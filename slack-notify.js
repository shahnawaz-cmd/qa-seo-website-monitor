const fs = require('fs');
const https = require('https');
const url = require('url');
const path = require('path');

const reportFile = 'playwright-report/results.json';
const resultsDir = 'playwright-report';

let totalPassed = 0;
let totalFailed = 0;
let totalSkipped = 0;
let totalFlaky = 0;
let totalTests = 0;
let overallStatus = '✅ PASS';

// Aggregated health metrics
let totalBrokenPages = 0;
let totalBrokenInternalLinks = 0;
let totalSlowPages = 0;
let totalPagesWithConsoleErrors = 0;
let totalPagesMissingSeo = 0;
let totalCrawlablePages = 0;
let totalUncrawlablePages = 0;

let failuresList = [];
let allExtractedLinks = new Set();
const linkMapping = {}; // Maps destination link -> Array of pages it was found on

// Resolve files to parse: either multiple results-*.json files from matrix run, or single results.json
let filesToParse = [];
if (fs.existsSync(resultsDir)) {
    filesToParse = fs.readdirSync(resultsDir)
        .filter(f => f.startsWith('results') && f.endsWith('.json'))
        .map(f => path.join(resultsDir, f));
}

// Fallback to single results.json if no sharded files found
if (filesToParse.length === 0 && fs.existsSync(reportFile)) {
    filesToParse.push(reportFile);
}

console.log(`[Slack Notify] Parsing result files for aggregation: ${JSON.stringify(filesToParse)}`);

for (const file of filesToParse) {
    try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        
        // Accumulate statistics
        const stats = data.stats;
        if (stats) {
            totalPassed += stats.expected || 0;
            totalFailed += stats.unexpected || 0;
            totalSkipped += stats.skipped || 0;
            totalFlaky += stats.flaky || 0;
        }

        // Recursively extract test attachments and metadata
        function parseSuites(suite) {
            if (suite.specs) {
                for (const spec of suite.specs) {
                    for (const test of spec.tests) {
                        const hasFailed = test.results && test.results.some(r => r.status === 'unexpected' || r.status === 'failure');
                        
                        // Parse attachments (pageReport holds detailed validation statistics)
                        if (test.results && test.results.length > 0) {
                            const lastResult = test.results[test.results.length - 1];
                            const attachment = lastResult.attachments && lastResult.attachments.find(a => a.name === 'pageReport');
                            
                            if (attachment && attachment.body) {
                                try {
                                    let body = attachment.body;
                                    // If attachment body is base64 encoded
                                    if (body && !body.trim().startsWith('{')) {
                                        body = Buffer.from(body, 'base64').toString('utf8');
                                    }
                                    
                                    const pageReport = JSON.parse(body);
                                    
                                    // 1. Broken Pages
                                    if (pageReport.statusCode === 0 || pageReport.statusCode >= 400) {
                                        totalBrokenPages++;
                                    }
                                    
                                    // 2. Slow Pages (>3s)
                                    if (pageReport.loadTimeMs > 3000) {
                                        totalSlowPages++;
                                    }
                                    
                                    // 3. Console Errors
                                    if (pageReport.consoleErrors && pageReport.consoleErrors.length > 0) {
                                        totalPagesWithConsoleErrors++;
                                    }
                                    
                                    // 4. Missing SEO elements
                                    const hasMissingTitle = !pageReport.title || !pageReport.title.trim();
                                    const hasMissingDesc = !pageReport.metaDescription || !pageReport.metaDescription.trim();
                                    const hasMissingCanonical = !pageReport.canonical || !pageReport.canonical.trim();
                                    const hasMissingH1 = !pageReport.h1Tags || pageReport.h1Tags.length === 0;
                                    if (hasMissingTitle || hasMissingDesc || hasMissingCanonical || hasMissingH1) {
                                        totalPagesMissingSeo++;
                                    }

                                    // 5. Crawlability/Indexation
                                    if (pageReport.isCrawlable === true) {
                                        totalCrawlablePages++;
                                    } else {
                                        totalUncrawlablePages++;
                                    }

                                    // 6. Gather extracted links for post-crawl validation
                                    if (pageReport.extractedLinks) {
                                        for (const link of pageReport.extractedLinks) {
                                            allExtractedLinks.add(link);
                                            if (!linkMapping[link]) {
                                                linkMapping[link] = [];
                                            }
                                            linkMapping[link].push(pageReport.url);
                                        }
                                    }

                                } catch (err) {
                                    console.error('Error parsing pageReport attachment:', err);
                                }
                            }

                            // If test failed, capture failure logs
                            if (hasFailed) {
                                const pageUrl = spec.title.replace('Auditing [FAST]: ', '').replace('Auditing [FULL]: ', '');
                                let errorDetail = 'Unknown Error';
                                if (lastResult.errors && lastResult.errors.length > 0) {
                                    errorDetail = lastResult.errors[0].message.split('\n')[0];
                                }
                                failuresList.push(`• *URL:* <${pageUrl}|${pageUrl.replace('https://', '')}>\n  *Issue:* \`${errorDetail}\``);
                            }
                        }
                    }
                }
            }
            if (suite.suites) {
                for (const subSuite of suite.suites) {
                    parseSuites(subSuite);
                }
            }
        }

        if (data.suites) {
            for (const suite of data.suites) {
                parseSuites(suite);
            }
        }

    } catch (e) {
        console.error(`Error parsing results file ${file}:`, e);
    }
}

totalTests = totalPassed + totalFailed + totalSkipped + totalFlaky;
if (totalFailed > 0) {
    overallStatus = '❌ FAIL';
}

const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
if (!slackWebhookUrl) {
    console.log('SLACK_WEBHOOK_URL is not set. Printing payload:');
}

const githubServer = process.env.GITHUB_SERVER || 'https://github.com';
const githubRepo = process.env.GITHUB_REPO || 'owner/repo';
const githubRun = process.env.GITHUB_RUN || '1';
const githubActor = process.env.GITHUB_ACTOR || 'actor';
const githubRef = process.env.GITHUB_REF || 'main';
const githubEvent = process.env.GITHUB_EVENT || 'push';

const publicReportUrl = githubRepo !== 'owner/repo' 
    ? `https://${githubRepo.split('/')[0]}.github.io/${githubRepo.split('/')[1]}/`
    : '#';

// POST-CRAWL DEDUPLICATED LINK AUDITING
const uniqueLinksArray = Array.from(allExtractedLinks);
const brokenLinksList = [];
const linkCheckTimeout = 5000;

console.log(`[Slack Notify] Extracted ${uniqueLinksArray.length} unique internal links. Verifying status codes...`);

// Axios-free request helper using native https
function checkLinkStatus(link) {
    return new Promise((resolve) => {
        const parsedUrl = new url.URL(link);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET', // Standard GET to bypass HEAD blocks
            timeout: linkCheckTimeout,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        };

        const req = https.request(options, (res) => {
            resolve({
                url: link,
                statusCode: res.statusCode,
                passed: res.statusCode >= 200 && res.statusCode < 400
            });
        });

        req.on('error', (e) => {
            resolve({
                url: link,
                statusCode: 0,
                passed: false,
                error: e.message
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({
                url: link,
                statusCode: 0,
                passed: false,
                error: 'Timeout'
            });
        });

        req.end();
    });
}

// Perform link checking before constructing payload
Promise.all(uniqueLinksArray.map(link => checkLinkStatus(link))).then((results) => {
    for (const r of results) {
        if (!r.passed) {
            totalBrokenInternalLinks++;
            brokenLinksList.push(r);
        }
    }

    console.log(`[Slack Notify] Link verification complete. Found ${totalBrokenInternalLinks} broken links.`);

    // Append broken links details to Slack notifications if they exist
    let brokenLinksDetailsText = '';
    if (brokenLinksList.length > 0) {
        brokenLinksDetailsText = `\n\n*🔗 Broken Links List (Top 5):*\n`;
        brokenLinksList.slice(0, 5).forEach((b) => {
            const pageRef = linkMapping[b.url]?.[0] || 'site page';
            const pageShort = pageRef.replace('https://', '');
            brokenLinksDetailsText += `• <${b.url}|${b.url.replace('https://', '')}> (Found on: <${pageRef}|${pageShort}>)\n`;
        });
    }

    // Format failure logs block if page failures exist
    let failuresText = '';
    if (failuresList.length > 0) {
        failuresText = `\n\n*🚨 Failed Pages & Issues (Max 5 shown):*\n${failuresList.slice(0, 5).join('\n')}`;
        if (failuresList.length > 5) {
            failuresText += `\n...and ${failuresList.length - 5} more failures.`;
        }
    }

    const payload = {
        blocks: [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: `🌐 Universal Website Monitor – Playwright CI (${githubEvent === 'schedule' ? 'Scheduled Run' : 'Manual/Push Run'})`,
                    emoji: true
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `_Website stability and validation audit run summary._\n\n*Overall Status:* ${overallStatus}\n\n*📊 Test Results Summary:*\n• *Total Pages Tested:* ${totalTests}\n• *✅ Passed:* ${totalPassed}\n• *❌ Failed:* ${totalFailed}\n• *⏭️ Skipped:* ${totalSkipped}\n• *⚠️ Flaky:* ${totalFlaky}\n\n*🩺 Website Quality Metrics:*\n• *⚠️ Broken Pages:* ${totalBrokenPages}\n• *🔗 Broken Internal Links:* ${totalBrokenInternalLinks}\n• *⏱️ Slow Pages (>3s):* ${totalSlowPages}\n• *💻 Pages with Console Errors:* ${totalPagesWithConsoleErrors}\n• *🔍 Pages Missing SEO Elements:* ${totalPagesMissingSeo}\n• *🤖 Indexation Status:* ${totalCrawlablePages} Indexable / ${totalUncrawlablePages} Blocked${brokenLinksDetailsText}${failuresText}\n\n*Branch:* \`${githubRef}\`\n*Triggered by:* \`${githubActor}\`\n*Event:* \`${githubEvent}\`\n\n🔗 <${githubServer}/${githubRepo}/actions/runs/${githubRun}|View Workflow Run>\n🌐 <${publicReportUrl}|View Public HTML Report>`
                }
            }
        ]
    };

    const payloadString = JSON.stringify(payload, null, 2);

    if (!slackWebhookUrl || slackWebhookUrl === 'local') {
        console.log(payloadString);
        process.exit(0);
    }

    const webhookUrl = new url.URL(slackWebhookUrl);

    const options = {
        hostname: webhookUrl.hostname,
        port: 443,
        path: webhookUrl.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payloadString)
        }
    };

    const req = https.request(options, (res) => {
        res.on('data', (d) => {
            process.stdout.write(d);
        });
    });

    req.on('error', (e) => {
        console.error('Error sending slack notification:', e);
    });

    req.write(payloadString);
    req.end();
});

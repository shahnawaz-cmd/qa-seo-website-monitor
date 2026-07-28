const fs = require('fs');
const https = require('https');
const url = require('url');

const reportFile = 'playwright-report/results.json';
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

try {
    if (fs.existsSync(reportFile)) {
        const data = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
        
        // Parse standard statistics
        const stats = data.stats;
        if (stats) {
            totalPassed = stats.expected || 0;
            totalFailed = stats.unexpected || 0;
            totalSkipped = stats.skipped || 0;
            totalFlaky = stats.flaky || 0;
            totalTests = totalPassed + totalFailed + totalSkipped + totalFlaky;
        }
        if (totalFailed > 0) {
            overallStatus = '❌ FAIL';
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
                                    
                                    // 2. Broken Internal Links
                                    if (pageReport.brokenInternalLinks) {
                                        const brokenLinks = pageReport.brokenInternalLinks.filter(l => !l.passed).length;
                                        totalBrokenInternalLinks += brokenLinks;
                                    }
                                    
                                    // 3. Slow Pages (>3s)
                                    if (pageReport.loadTimeMs > 3000) {
                                        totalSlowPages++;
                                    }
                                    
                                    // 4. Console Errors
                                    if (pageReport.consoleErrors && pageReport.consoleErrors.length > 0) {
                                        totalPagesWithConsoleErrors++;
                                    }
                                    
                                    // 5. Missing SEO elements
                                    const hasMissingTitle = !pageReport.title || !pageReport.title.trim();
                                    const hasMissingDesc = !pageReport.metaDescription || !pageReport.metaDescription.trim();
                                    const hasMissingCanonical = !pageReport.canonical || !pageReport.canonical.trim();
                                    const hasMissingH1 = !pageReport.h1Tags || pageReport.h1Tags.length === 0;
                                    if (hasMissingTitle || hasMissingDesc || hasMissingCanonical || hasMissingH1) {
                                        totalPagesMissingSeo++;
                                    }

                                    // 6. Crawlability/Indexation
                                    if (pageReport.isCrawlable === true) {
                                        totalCrawlablePages++;
                                    } else {
                                        totalUncrawlablePages++;
                                    }

                                } catch (err) {
                                    console.error('Error parsing pageReport attachment:', err);
                                }
                            }

                            // If test failed, capture failure logs
                            if (hasFailed) {
                                const pageUrl = spec.title.replace('Auditing: ', '');
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

    } else {
        console.warn(`Results file ${reportFile} not found!`);
        overallStatus = '⚠️ WARNING (No report found)';
    }
} catch (e) {
    console.error('Error parsing results file:', e);
    overallStatus = '❌ ERROR';
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
const githubSha = process.env.GITHUB_SHA_VAL || 'sha';

const publicReportUrl = githubRepo !== 'owner/repo' 
    ? `https://${githubRepo.split('/')[0]}.github.io/${githubRepo.split('/')[1]}/`
    : '#';

// Format failure logs block if failures exist
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
                text: `_Website stability and validation audit run summary._\n\n*Overall Status:* ${overallStatus}\n\n*📊 Test Results Summary:*\n• *Total Pages Tested:* ${totalTests}\n• *✅ Passed:* ${totalPassed}\n• *❌ Failed:* ${totalFailed}\n• *⏭️ Skipped:* ${totalSkipped}\n• *⚠️ Flaky:* ${totalFlaky}\n\n*🩺 Website Quality Metrics:*\n• *⚠️ Broken Pages:* ${totalBrokenPages}\n• *🔗 Broken Internal Links:* ${totalBrokenInternalLinks}\n• *⏱️ Slow Pages (>3s):* ${totalSlowPages}\n• *💻 Pages with Console Errors:* ${totalPagesWithConsoleErrors}\n• *🔍 Pages Missing SEO Elements:* ${totalPagesMissingSeo}\n• *🤖 Indexation Status:* ${totalCrawlablePages} Indexable / ${totalUncrawlablePages} Blocked\n\n*Branch:* \`${githubRef}\`\n*Triggered by:* \`${githubActor}\`\n*Event:* \`${githubEvent}\`${failuresText}\n\n🔗 <${githubServer}/${githubRepo}/actions/runs/${githubRun}|View Workflow Run>\n🌐 <${publicReportUrl}|View Public HTML Report>`
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

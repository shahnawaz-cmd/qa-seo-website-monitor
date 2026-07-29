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
let brokenPagesList = [];
let consoleErrorsList = [];
let missingSeoList = [];
let slowPagesList = [];

// Resolve files to parse: either multiple results-*.json files from matrix run, or single results.json
let filesToParse = [];
if (fs.existsSync(resultsDir)) {
    filesToParse = fs.readdirSync(resultsDir)
        .filter(f => f.startsWith('results-') && f.endsWith('.json'))
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
                                        if (brokenPagesList.length < 5) {
                                            brokenPagesList.push(`• <${pageReport.url}|${pageReport.url.replace('https://', '')}> (Status: ${pageReport.statusCode})`);
                                        }
                                    }
                                    
                                    // 2. Slow Pages (>3s)
                                    if (pageReport.loadTimeMs > 3000) {
                                        totalSlowPages++;
                                        if (slowPagesList.length < 5) {
                                            slowPagesList.push(`• <${pageReport.url}|${pageReport.url.replace('https://', '')}> (${(pageReport.loadTimeMs / 1000).toFixed(1)}s)`);
                                        }
                                    }
                                    
                                    // 3. Console Errors
                                    if (pageReport.consoleErrors && pageReport.consoleErrors.length > 0) {
                                        totalPagesWithConsoleErrors++;
                                        if (consoleErrorsList.length < 5) {
                                            consoleErrorsList.push(`• <${pageReport.url}|${pageReport.url.replace('https://', '')}> (${pageReport.consoleErrors.length} errors)`);
                                        }
                                    }
                                    
                                    // 4. Missing SEO elements
                                    const hasMissingTitle = !pageReport.title || !pageReport.title.trim();
                                    const hasMissingDesc = !pageReport.metaDescription || !pageReport.metaDescription.trim();
                                    const hasMissingCanonical = !pageReport.canonical || !pageReport.canonical.trim();
                                    const hasMissingH1 = !pageReport.h1Tags || pageReport.h1Tags.length === 0;
                                    if (hasMissingTitle || hasMissingDesc || hasMissingCanonical || hasMissingH1) {
                                        totalPagesMissingSeo++;
                                        if (missingSeoList.length < 5) {
                                            let missingParts = [];
                                            if (hasMissingTitle) missingParts.push('Title');
                                            if (hasMissingDesc) missingParts.push('Desc');
                                            if (hasMissingCanonical) missingParts.push('Canonical');
                                            if (hasMissingH1) missingParts.push('H1');
                                            missingSeoList.push(`• <${pageReport.url}|${pageReport.url.replace('https://', '')}> (Missing: ${missingParts.join(', ')})`);
                                        }
                                    }

                                    // 5. Crawlability/Indexation
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

// 1. Read dynamic site name from metadata.json
let siteName = 'Website';
const metadataPath = path.join(resultsDir, 'metadata.json');
if (fs.existsSync(metadataPath)) {
    try {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        if (metadata.siteName) {
            siteName = metadata.siteName;
        }
    } catch (e) {
        console.error('Failed to parse metadata.json:', e);
    }
}

// 2. Fallback: Extract Site Name dynamically from results.json audited URLs if metadata.json is missing
if (siteName === 'Website' && filesToParse.length > 0) {
    try {
        const sampleData = JSON.parse(fs.readFileSync(filesToParse[0], 'utf8'));
        let sampleUrl = '';
        
        function findUrl(suite) {
            if (suite.specs) {
                for (const spec of suite.specs) {
                    if (spec.title && spec.title.includes('https://')) {
                        const match = spec.title.match(/https?:\/\/[^\s]+/);
                        if (match) {
                            sampleUrl = match[0];
                            return;
                        }
                    }
                }
            }
            if (suite.suites) {
                for (const subSuite of suite.suites) {
                    findUrl(subSuite);
                    if (sampleUrl) return;
                }
            }
        }

        if (sampleData.suites) {
            for (const suite of sampleData.suites) {
                findUrl(suite);
                if (sampleUrl) break;
            }
        }

        if (sampleUrl) {
            const parsedSample = new url.URL(sampleUrl);
            siteName = parsedSample.host.replace('www.', '').split('.')[0].toUpperCase();

            try {
                const fs = require('fs');
                const path = require('path');
                const kodPath = path.join(__dirname, 'kod-sites.json');
                if (fs.existsSync(kodPath)) {
                    const kodSites = JSON.parse(fs.readFileSync(kodPath, 'utf-8'));
                    const matchingSite = kodSites.find(s => new URL(s.url).host === parsedSample.host);
                    if (matchingSite) {
                        siteName = matchingSite.id;
                    }
                }
            } catch (err) {
                console.error('Failed to read kod-sites.json in slack-notify:', err);
            }

            if (parsedSample.host.includes('detailedvehiclehistory.com')) {
                siteName = 'DVH';
            } else if (parsedSample.host.includes('vehiclesreport.com')) {
                siteName = 'VSR';
            } else if (parsedSample.host.includes('vehiclehistory.eu')) {
                siteName = 'VHREU';
            } else if (parsedSample.host.includes('classicdecoder.com')) {
                siteName = 'CD';
            } else if (parsedSample.host.includes('instantvinreports.com')) {
                siteName = 'IVR';
            } else if (parsedSample.host.includes('vinnumber.ca')) {
                siteName = 'VNCA';
            } else if (parsedSample.host.includes('motorcyclevinlookup.com')) {
                siteName = 'MVL';
            } else if (parsedSample.host.includes('smartcarcheck.uk')) {
                siteName = 'SCC';
            } else if (parsedSample.host.includes('consultadevin.com')) {
                siteName = 'CNV';
            } else if (parsedSample.host.includes('premiumvin.com')) {
                siteName = 'PV';
            } else if (parsedSample.host.includes('windowstickerslookup.com')) {
                siteName = 'WSL';
            }
        }
    } catch (e) {
        console.error('Failed to extract siteName from results.json:', e);
    }
}

// READ BROKEN LINKS FROM PLAYWRIGHT LINK CHECKER SPEC
let brokenLinksList = [];
const brokenLinksJsonPath = path.join(resultsDir, 'broken-links.json');
if (fs.existsSync(brokenLinksJsonPath)) {
    try {
        brokenLinksList = JSON.parse(fs.readFileSync(brokenLinksJsonPath, 'utf-8'));
        totalBrokenInternalLinks = brokenLinksList.length;
    } catch (e) {
        console.error('Failed to read broken-links.json:', e);
    }
}

// Append broken links details to Slack notifications if they exist
let brokenLinksDetailsText = '';
if (brokenLinksList.length > 0) {
    brokenLinksDetailsText = `\n\n*🔗 Broken Links List (Top 5):*\n`;
    brokenLinksList.slice(0, 5).forEach((b) => {
        const pageRef = b.pagesFoundOn?.[0] || 'site page';
        const pageShort = pageRef.replace('https://', '');
        brokenLinksDetailsText += `• <${b.url}|${b.url.replace('https://', '')}> (Found on: <${pageRef}|${pageShort}>)\n`;
    });
}

// Format detailed validation failure lists (Top 5 each)
let brokenPagesSection = '';
if (brokenPagesList.length > 0) {
    brokenPagesSection = `\n\n*⚠️ Broken Pages List (Top 5):*\n${brokenPagesList.join('\n')}`;
}

let consoleErrorsSection = '';
if (consoleErrorsList.length > 0) {
    consoleErrorsSection = `\n\n*💻 Console Errors List (Top 5):*\n${consoleErrorsList.join('\n')}`;
}

let missingSeoSection = '';
if (missingSeoList.length > 0) {
    missingSeoSection = `\n\n*🔍 Missing SEO Elements (Top 5):*\n${missingSeoList.join('\n')}`;
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
                text: `🌐 [${siteName}] Website Monitor – Playwright CI (${githubEvent === 'schedule' ? 'Scheduled Run' : 'Manual/Push Run'})`,
                emoji: true
            }
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: `_Website stability and validation audit run summary for ${siteName}._\n\n*Overall Status:* ${overallStatus}\n\n*📊 Test Results Summary:*\n• *Total Pages Tested:* ${totalTests}\n• *✅ Passed:* ${totalPassed}\n• *❌ Failed:* ${totalFailed}\n• *⏭️ Skipped:* ${totalSkipped}\n• *⚠️ Flaky:* ${totalFlaky}\n\n*🩺 Website Quality Metrics:*\n• *⚠️ Broken Pages:* ${totalBrokenPages}\n• *🔗 Broken Internal Links:* ${totalBrokenInternalLinks}\n• *⏱️ Slow Pages (>3s):* ${totalSlowPages}\n• *💻 Pages with Console Errors:* ${totalPagesWithConsoleErrors}\n• *🔍 Pages Missing SEO Elements:* ${totalPagesMissingSeo}\n• *🤖 Indexation Status:* ${totalCrawlablePages} Indexable / ${totalUncrawlablePages} Blocked${brokenPagesSection}${brokenLinksDetailsText}${consoleErrorsSection}${missingSeoSection}${failuresText}\n\n*Branch:* \`${githubRef}\`\n*Triggered by:* \`${githubActor}\`\n*Event:* \`${githubEvent}\`\n\n🔗 <${githubServer}/${githubRepo}/actions/runs/${githubRun}|View Workflow Run>\n🌐 <${publicReportUrl}|View Public HTML Report>`
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

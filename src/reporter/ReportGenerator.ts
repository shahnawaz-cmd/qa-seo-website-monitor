import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { RunReport, PageReport, SummaryDashboard } from '../types';

export class ReportGenerator {
  static generateSummary(pages: PageReport[]): SummaryDashboard {
    const totalPages = pages.length;
    let healthyPages = 0;
    let brokenPages = 0;
    let redirects = 0;
    let slowPages = 0;
    let missingSeo = 0;
    let failedValidations = 0;
    let totalLoadTime = 0;

    for (const page of pages) {
      totalLoadTime += page.loadTimeMs;

      // Broken checks
      const isBroken = page.statusCode === 0 || page.statusCode >= 400;
      if (isBroken) {
        brokenPages++;
      } else if (page.statusCode >= 300 && page.statusCode < 400) {
        redirects++;
      } else {
        healthyPages++;
      }

      if (page.loadTimeMs > 3000) {
        slowPages++;
      }

      // Check missing SEO elements
      const hasMissingTitle = !page.title.trim();
      const hasMissingDesc = !page.metaDescription.trim();
      const hasMissingH1 = page.h1Tags.length === 0;
      const hasMissingCanonical = !page.canonical.trim();

      if (hasMissingTitle || hasMissingDesc || hasMissingH1 || hasMissingCanonical) {
        missingSeo++;
      }

      // Count failed validations
      const pageFailedCount = page.validations.filter(v => !v.passed).length;
      failedValidations += pageFailedCount;
    }

    return {
      totalPages,
      healthyPages,
      brokenPages,
      redirects,
      slowPages,
      missingSeo,
      failedValidations,
      averageLoadTimeMs: totalPages > 0 ? Math.round(totalLoadTime / totalPages) : 0
    };
  }

  static generateAllReports(report: RunReport, outputDir: string): void {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    this.generateJson(report, path.join(outputDir, 'report.json'));
    this.generateCsv(report, path.join(outputDir, 'report.csv'));
    this.generateExcel(report, path.join(outputDir, 'report.xlsx'));
    this.generateHtml(report, path.join(outputDir, 'index.html'));
  }

  private static generateJson(report: RunReport, filepath: string): void {
    fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf-8');
  }

  private static generateCsv(report: RunReport, filepath: string): void {
    const headers = ['URL', 'Status Code', 'Status Text', 'Load Time (ms)', 'Title', 'Meta Description', 'H1 Tags', 'Canonical', 'Robots Meta', 'Console Errors Count', 'Broken Internal Links Count', 'Failed Validations Count'];
    const rows = report.pages.map(page => [
      page.url,
      page.statusCode,
      page.statusText,
      page.loadTimeMs,
      `"${page.title.replace(/"/g, '""')}"`,
      `"${page.metaDescription.replace(/"/g, '""')}"`,
      `"${page.h1Tags.join(' | ').replace(/"/g, '""')}"`,
      page.canonical,
      page.robotsMeta,
      page.consoleErrors.length,
      page.brokenInternalLinks.length,
      page.validations.filter(v => !v.passed).length
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    fs.writeFileSync(filepath, csvContent, 'utf-8');
  }

  private static generateExcel(report: RunReport, filepath: string): void {
    const wb = XLSX.utils.book_new();

    // Summary Sheet
    const summaryData = [
      { Metric: 'Target URL', Value: report.targetUrl },
      { Metric: 'Start Time', Value: report.startTime },
      { Metric: 'End Time', Value: report.endTime },
      { Metric: 'Total Pages Crawled', Value: report.summary.totalPages },
      { Metric: 'Healthy Pages (2xx)', Value: report.summary.healthyPages },
      { Metric: 'Broken Pages (4xx/5xx/Fail)', Value: report.summary.brokenPages },
      { Metric: 'Redirects (3xx)', Value: report.summary.redirects },
      { Metric: 'Slow Pages (>3s)', Value: report.summary.slowPages },
      { Metric: 'Pages Missing SEO Element', Value: report.summary.missingSeo },
      { Metric: 'Total Failed Validations', Value: report.summary.failedValidations },
      { Metric: 'Average Load Time (ms)', Value: report.summary.averageLoadTimeMs }
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    // Pages Sheet
    const pagesData = report.pages.map(p => ({
      URL: p.url,
      'Status Code': p.statusCode,
      'Status Text': p.statusText,
      'Load Time (ms)': p.loadTimeMs,
      Title: p.title,
      'Meta Description': p.metaDescription,
      'Canonical Tag': p.canonical,
      'Robots Meta': p.robotsMeta,
      'H1 Count': p.h1Tags.length,
      'Console Errors': p.consoleErrors.length,
      'Broken Links': p.brokenInternalLinks.length,
      'Failed Validations': p.validations.filter(v => !v.passed).length
    }));
    const wsPages = XLSX.utils.json_to_sheet(pagesData);
    XLSX.utils.book_append_sheet(wb, wsPages, 'Pages Data');

    // Detailed Validations Sheet
    const detailedValidations: any[] = [];
    for (const page of report.pages) {
      for (const validation of page.validations) {
        detailedValidations.push({
          URL: page.url,
          'Rule Name': validation.ruleName,
          Passed: validation.passed ? 'PASS' : 'FAIL',
          Severity: validation.severity,
          Message: validation.message,
          Actual: validation.actual || '',
          Expected: validation.expected || ''
        });
      }
    }
    const wsValidations = XLSX.utils.json_to_sheet(detailedValidations);
    XLSX.utils.book_append_sheet(wb, wsValidations, 'Detailed Validations');

    XLSX.writeFile(wb, filepath);
  }

  private static generateHtml(report: RunReport, filepath: string): void {
    const cardsHtml = `
      <div class="card bg-blue">
        <h3>Total Pages</h3>
        <p class="value">${report.summary.totalPages}</p>
      </div>
      <div class="card bg-green">
        <h3>Healthy Pages</h3>
        <p class="value">${report.summary.healthyPages}</p>
      </div>
      <div class="card bg-red">
        <h3>Broken Pages</h3>
        <p class="value">${report.summary.brokenPages}</p>
      </div>
      <div class="card bg-orange">
        <h3>Redirects</h3>
        <p class="value">${report.summary.redirects}</p>
      </div>
      <div class="card bg-purple">
        <h3>Slow Pages (>3s)</h3>
        <p class="value">${report.summary.slowPages}</p>
      </div>
      <div class="card bg-yellow">
        <h3>SEO Alerts</h3>
        <p class="value">${report.summary.missingSeo}</p>
      </div>
      <div class="card bg-dark-red">
        <h3>Failed Rules</h3>
        <p class="value">${report.summary.failedValidations}</p>
      </div>
    `;

    const rowsHtml = report.pages.map((page, idx) => {
      const failedCount = page.validations.filter(v => !v.passed).length;
      const rowClass = page.statusCode >= 400 || page.statusCode === 0 ? 'row-broken' : failedCount > 0 ? 'row-warning' : 'row-healthy';
      const screenshotLink = page.screenshotPath 
        ? `<a href="./screenshots/${path.basename(page.screenshotPath)}" target="_blank" class="screenshot-btn">View Screenshot</a>` 
        : 'None';
      
      const validationsSummary = page.validations.map(v => `
        <div class="validation-badge ${v.passed ? 'badge-pass' : v.severity === 'error' ? 'badge-fail' : 'badge-warn'}">
          <strong>${v.ruleName}:</strong> ${v.message}
        </div>
      `).join('');

      return `
        <tr class="${rowClass}">
          <td><strong>${idx + 1}</strong></td>
          <td class="url-cell"><a href="${page.url}" target="_blank">${page.url}</a></td>
          <td><span class="status-badge status-${page.statusCode >= 400 ? 'error' : page.statusCode >= 300 ? 'warn' : 'ok'}">${page.statusCode}</span></td>
          <td>${page.loadTimeMs} ms</td>
          <td>
            <button class="expand-btn" onclick="toggleDetails(${idx})">Toggle Validations (${failedCount} failed)</button>
            <div id="details-${idx}" class="details-pane" style="display:none;">
              <p><strong>Title:</strong> ${page.title || '<em>None</em>'}</p>
              <p><strong>Meta Description:</strong> ${page.metaDescription || '<em>None</em>'}</p>
              <p><strong>H1s:</strong> ${page.h1Tags.map(h => `"${h}"`).join(', ') || '<em>None</em>'}</p>
              <p><strong>Canonical:</strong> ${page.canonical || '<em>None</em>'}</p>
              <p><strong>Robots:</strong> ${page.robotsMeta || '<em>None</em>'}</p>
              <p><strong>Console Errors:</strong> ${page.consoleErrors.length > 0 ? page.consoleErrors.join('<br>') : 'None'}</p>
              <div class="rules-list">${validationsSummary}</div>
            </div>
          </td>
          <td>${screenshotLink}</td>
        </tr>
      `;
    }).join('');

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Website Audit Dashboard</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #3b82f6;
      --green: #10b981;
      --red: #ef4444;
      --orange: #f97316;
      --yellow: #f59e0b;
      --purple: #8b5cf6;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 20px;
    }
    header {
      margin-bottom: 30px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 20px;
    }
    h1 { margin: 0; font-size: 2.5rem; }
    .subtitle { color: var(--text-muted); margin-top: 5px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 15px;
      text-align: center;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      transition: transform 0.2s;
    }
    .card:hover { transform: translateY(-3px); }
    .card h3 { font-size: 0.9rem; color: var(--text-muted); margin: 0 0 10px; }
    .card .value { font-size: 1.8rem; font-weight: bold; margin: 0; }
    .bg-blue { border-top: 4px solid var(--primary); }
    .bg-green { border-top: 4px solid var(--green); }
    .bg-red { border-top: 4px solid var(--red); }
    .bg-orange { border-top: 4px solid var(--orange); }
    .bg-purple { border-top: 4px solid var(--purple); }
    .bg-yellow { border-top: 4px solid var(--yellow); }
    .bg-dark-red { border-top: 4px solid #b91c1c; }

    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--card-bg);
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 40px;
    }
    th, td {
      padding: 12px 15px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    th {
      background: #1e293b;
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .row-healthy { border-left: 4px solid var(--green); }
    .row-warning { border-left: 4px solid var(--yellow); }
    .row-broken { border-left: 4px solid var(--red); }
    
    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: bold;
      font-size: 0.85rem;
    }
    .status-ok { background: rgba(16, 185, 129, 0.2); color: var(--green); }
    .status-warn { background: rgba(249, 115, 22, 0.2); color: var(--orange); }
    .status-error { background: rgba(239, 68, 68, 0.2); color: var(--red); }

    .expand-btn {
      background: #334155;
      color: var(--text);
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
    }
    .expand-btn:hover { background: #475569; }
    
    .details-pane {
      background: #0f172a;
      padding: 15px;
      border-radius: 6px;
      margin-top: 10px;
      font-size: 0.9rem;
      border: 1px solid var(--border);
    }
    .details-pane p { margin: 5px 0; }
    .rules-list {
      margin-top: 10px;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .validation-badge {
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 0.85rem;
    }
    .badge-pass { background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-warn { background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); }
    .badge-fail { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); }

    .screenshot-btn {
      color: var(--primary);
      text-decoration: none;
      font-weight: bold;
    }
    .screenshot-btn:hover { text-decoration: underline; }
    .url-cell {
      max-width: 300px;
      word-break: break-all;
    }
    .url-cell a {
      color: var(--text);
      text-decoration: none;
    }
    .url-cell a:hover {
      color: var(--primary);
      text-decoration: underline;
    }
  </style>
  <script>
    function toggleDetails(idx) {
      const pane = document.getElementById('details-' + idx);
      if (pane.style.display === 'none') {
        pane.style.display = 'block';
      } else {
        pane.style.display = 'none';
      }
    }
  </script>
</head>
<body>
  <header>
    <h1>Website Monitor Dashboard</h1>
    <div class="subtitle">Target URL: <strong>${report.targetUrl}</strong> | Executed at: ${report.startTime}</div>
  </header>
  
  <div class="grid">
    ${cardsHtml}
  </div>

  <h2>Audit Details</h2>
  <table>
    <thead>
      <tr>
        <th style="width: 5%">#</th>
        <th style="width: 35%">URL</th>
        <th style="width: 10%">Status</th>
        <th style="width: 10%">Load Time</th>
        <th style="width: 30%">Validations</th>
        <th style="width: 10%">Screenshot</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
</body>
</html>
    `;

    fs.writeFileSync(filepath, htmlContent, 'utf-8');
  }
}

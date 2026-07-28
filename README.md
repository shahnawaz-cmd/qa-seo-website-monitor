# Universal Website Monitoring Framework (Screenplay Pattern)

A robust, production-grade website monitoring framework written in TypeScript using **Playwright** and the **Screenplay Pattern** following **SOLID Principles**.

---

## Architecture (Screenplay Pattern)
The framework strictly adheres to the Screenplay Pattern:
- **Actors**: Who performs the validation action (e.g. `Actor` class).
- **Abilities**: What they can use (`BrowseTheWeb` wraps Playwright, `CallAnApi` wraps Axios).
- **Tasks**: High-level orchestrations (`DiscoverUrls`, `CheckRobotsTxtTask`, `ValidatePageTask`).
- **Validations / Rules**: Modular rules (`HttpStatusCodeRule`, `PageTitleRule`, `MetaDescriptionRule`, etc.) implemented under an open-closed schema (`ValidationRule` interface).

---

## Features
- **Sitemap Index & Sitemap Discovery**: Automatically parses sitemaps recursively.
- **Parallel Scanning**: Built-in worker queue to process multiple URLs concurrently for extreme speed.
- **Broken Link Checker**: Scrapes internal page links and tests their status code.
- **Comprehensive Audits**: Validate H1 tags, titles, canonical tags, console errors, robots directives, and page load time.
- **Failed Page Screenshots**: Automatically captures a full-page screenshot for pages experiencing critical validation failures.
- **Clean Dashboards**: Generates interactive HTML dashboards, Excel spreadsheets, CSV data, and JSON outputs.
- **Comparison Engine**: Diff two runs to view new errors, fixes, slower pages, or newly discovered URLs.

---

## Installation

1. Navigate to the project directory:
   ```bash
   cd C:\Users\Shahnawaz\Desktop\universal-website-monitor
   ```
2. Install the node packages:
   ```bash
   npm install
   ```
3. Install Playwright browser binaries:
   ```bash
   npx playwright install chromium
   ```

---

## How to Execute

### 1. Monitor a Website (e.g. detailedvehiclehistory.com)
```bash
npm run monitor -- --url https://detailedvehiclehistory.com
```

### 2. Monitor Specific URLs Only
```bash
npm run monitor -- --urls "https://detailedvehiclehistory.com,https://detailedvehiclehistory.com/about"
```

### 3. Change Concurrency (Parallel workers)
```bash
npm run monitor -- --url https://detailedvehiclehistory.com --parallel 5
```

### 4. Compare Two Different Run Reports
```bash
npm run monitor -- --compare "./reports/run_base/report.json,./reports/run_current/report.json"
```

### 5. View Scheduling Guidelines
```bash
npm run monitor -- --schedule daily
```

---

## File Structure
```
universal-website-monitor/
├── .github/
│   └── workflows/
│       └── monitor.yml        # CI/CD schedule execution workflow
├── src/
│   ├── screenplay/
│   │   ├── abilities/
│   │   │   ├── BrowseTheWeb.ts
│   │   │   └── CallAnApi.ts
│   │   ├── tasks/
│   │   │   ├── CheckRobotsTxtTask.ts
│   │   │   ├── DiscoverUrls.ts
│   │   │   └── ValidatePageTask.ts
│   │   ├── validations/
│   │   │   ├── rules/
│   │   │   │   ├── HttpStatusCodeRule.ts
│   │   │   │   ├── PageTitleRule.ts
│   │   │   │   ├── MetaDescriptionRule.ts
│   │   │   │   ├── H1TagRule.ts
│   │   │   │   ├── CanonicalTagRule.ts
│   │   │   │   ├── RobotsMetaRule.ts
│   │   │   │   ├── BrokenLinksRule.ts
│   │   │   │   ├── ConsoleErrorsRule.ts
│   │   │   │   └── LoadTimeRule.ts
│   │   │   │   └── index.ts
│   │   │   └── ValidationRule.ts
│   │   ├── Actor.ts
│   │   ├── Ability.ts
│   │   ├── Task.ts
│   │   ├── Interaction.ts
│   │   └── Question.ts
│   ├── reporter/
│   │   ├── ReportGenerator.ts
│   │   └── ReportComparer.ts
│   ├── types/
│   │   └── index.ts
│   └── monitor.ts             # Main CLI execution coordinator
├── package.json
├── tsconfig.json
└── README.md
```

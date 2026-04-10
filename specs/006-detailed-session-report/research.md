# Research Findings

## 1. UI Export to PDF

- **Decision**: Leverage CSS `@media print` combined with native `window.print()`.
- **Rationale**: For clinical applications running in standard modern browsers, utilizing native print-to-PDF provides the highest accessibility without needing to manage heavy client-side libraries (like `jspdf` or `html2canvas`) or deploying a headless Puppeteer backend resource just for static reports.
- **Alternatives considered**: `react-to-print`, `jspdf`. These were rejected because they are prone to styling bugs when using complex CSS Grids/Flexbox and Rechart SVGs in modern React versions.

## 2. Professional UI Architecture for 3-Tier Model Display

- **Decision**: Stacked hierarchical cards with dynamic visual weights.
- **Rationale**: The user wants to see current state (Model 1), functional output (Model 2), and predictive prognosis (Model 3). Using TailwindCSS border accents and progressive disclosure (grouping them chronologically down the page) ensures the UX clearly separates real-time diagnosis from A.I. extrapolations as demanded by FR-004.
- **Alternatives considered**: Tabbed navigation structure. Rejected because a clinical user needs to scan all information simultaneously in a unified document without clicking through hidden tabs, especially when printing.

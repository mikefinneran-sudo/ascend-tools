# Ascend Tools

Lead magnet toolkit for Ascend Travel — three client-side tools deployed as a static site.

**Live:** [ascend-tools.vercel.app](https://ascend-tools.vercel.app)

## Tools

### ROI Calculator (`index.html`)

Shows prospects how much they save with an Ascend membership. Inputs: travel frequency, cabin class, hotel tier, booking platform. Outputs: 12-month cost comparison chart, savings projection, member case studies, downloadable PDF.

Supports URL prefilling: `?trips=8&cabin=premium&tier=standard`

### Pricing Proposal Tool (`pricing.html`)

Internal tool for building custom B2B pricing proposals. Inputs: prospect info, brand value scoring, network/referral value, transactional revenue, hotel/car projections. Outputs: price waterfall chart, margin projection, discount log. Integrates with Gamma API for CRM export.

### Trip Planner (`trip-planner.html`)

Customer-facing 5-step wizard for building a travel profile. Steps: destinations/dates, travel style, accommodation, budget/preferences, review. Outputs: structured summary with WhatsApp share and clipboard copy.

## Tech Stack

- Vanilla HTML/JavaScript (no framework, no build step)
- Chart.js (charting)
- jsPDF (PDF export)
- Google Fonts (Inter, DM Mono)
- Light/dark mode toggle
- Responsive design (mobile breakpoint at 700px)

## Deployment

Static site on Vercel — push to `main` to deploy. No build step required.

## Development

Open any HTML file directly in a browser, or use a local server:

```bash
python3 -m http.server 8000
```

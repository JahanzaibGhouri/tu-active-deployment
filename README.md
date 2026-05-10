<<<<<<< HEAD
# TU-ACTIVE DEPLOYMENT

Live command-center dashboard, syncing every 60 seconds from your Google Sheet. Single static HTML file — no build, no backend, no Node.

## Quick start (local)

Just open `index.html` in your browser. Default password: `tuactive2026`.

## Files

- `index.html` — entire dashboard (HTML + CSS + JS in one file)
- `README.md` — this file

## Configuration

All settings live in the `CONFIG` block near the top of the `<script>` section in `index.html`:

```js
const CONFIG = {
  SHEET_CSV: 'https://docs.google.com/.../pub?gid=0&single=true&output=csv',
  AUTO_REFRESH_MS: 60 * 1000,   // sync interval
  PASSWORD: 'tuactive2026',     // change me
  PAGE_SIZE: 15,
};
```

### Change the password
Edit `CONFIG.PASSWORD`. Note: client-side passwords are obfuscation, not real security — anyone who views page source can read it. Acceptable for an internal CEO dashboard kept off public links; not bank-grade.

### Change the data source
Replace `CONFIG.SHEET_CSV`. The URL must be a **published-to-web CSV** (not the regular sharing URL). Generate it via:
1. Open the sheet → File → Share → **Publish to web**
2. Choose the tab and **CSV** as format
3. Copy the URL — it starts with `https://docs.google.com/spreadsheets/d/e/2PACX-...`

## Deploy to GitHub Pages

```bash
cd C:/Users/hp/Downloads/tu-active-deployment
git init
git add .
git commit -m "TU-ACTIVE DEPLOYMENT dashboard"
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/tu-active-deployment.git
git push -u origin main
```

Then on GitHub:
1. Go to repo → **Settings → Pages**
2. Source: **Deploy from a branch** → branch `main`, folder `/ (root)`
3. Save. After ~1 minute, your dashboard is live at `https://<YOUR_USERNAME>.github.io/tu-active-deployment/`

## Deploy to Vercel (alternative)

1. Push to GitHub as above
2. Go to [vercel.com](https://vercel.com) → New Project → import the repo
3. Click **Deploy** — defaults work, no config needed

## What the dashboard shows

1. **10 Executive KPIs** — Total / Live / Pending / Under Deployment / Delayed / Teams / Assignees / Completion % / Critical Issues / Go-Live This Week
2. **Status donut + Team stacked bar** — distribution charts
3. **Brand Deployment Tracker** — searchable, sortable, filterable, paginated table with status badges, completion bars, risk levels
4. **Department Completion Matrix** — heatmap of % live across Inventory · POS · OMS · Accounts · Load Sheet · Manufacturing per team
5. **Assignee Performance** — leaderboard with gold/silver/bronze ranks + workload chart
6. **CEO Insights** — auto-generated text summaries
7. **Risk Monitor** — brands needing attention with reasons
8. **Go-Live Timeline** — chronological launch list
9. **Exports** — CSV + full-dashboard PNG snapshot
10. **Theme toggle** (dark/light) + manual refresh + logout

## Sheet column quirks (already handled)

The dashboard tolerates these typos / spaces in your live sheet headers:
- `Inventroy ` (typo + trailing space) → mapped to `Inventory`
- `Asignee` (typo) → mapped to `Assignee`
- `Go live date ` (trailing space) → handled
- `Under Deploymnet` (typo) → normalized to `Under Deployment`

Free-text dates like `7April,2026`, `4-11-2025`, `24pril.2026` (typo) are all parsed.

## Tech stack

- **Chart.js 4.4** (CDN) — donut, stacked, horizontal bar charts
- **PapaParse 5.4** (CDN) — Google Sheets CSV parsing
- **html2canvas 1.4** (CDN) — PNG export
- **Sora + JetBrains Mono** (Google Fonts) — typography
- Vanilla JavaScript, vanilla CSS — no React, Vue, Tailwind, or build tooling

## License

Internal use.
=======
# tu-active-deployment
>>>>>>> a6b42e2c568ed3a7cfa595ae7bad1a102d8b7078

/**
 * TU-ACTIVE DEPLOYMENT — CRUD backend
 * ------------------------------------------------------------
 * Bind this script to your Google Sheet (Extensions → Apps Script),
 * deploy as a Web App, and paste the resulting /exec URL into
 * CONFIG.SCRIPT_URL in index.html.
 *
 * doGet  → returns every row as JSON (not required by the dashboard,
 *          but handy for testing the deployment in a browser tab)
 * doPost → handles create / update / delete, sent as JSON in the
 *          request body with one of these shapes:
 *            { action: 'create', data: {...columns} }
 *            { action: 'update', originalBrand: 'Old Name', data: {...columns} }
 *            { action: 'delete', brand: 'Brand Name' }
 *
 * Rows are located by exact-match on the "Brand" column (case-insensitive).
 * Keep Brand values unique in the sheet — it's the lookup key for
 * update/delete, the same way the dashboard already treats it as the
 * primary label for search, sort, and filtering.
 * ------------------------------------------------------------
 */

// Change this if your data tab isn't named "Sheet1"
const SHEET_NAME = 'Sheet1';

// ── AUTH ─────────────────────────────────────────────────
// Shared secret required on every write (create/update/delete).
// MUST match CONFIG.API_TOKEN in index.html exactly.
// NOTE: index.html is public, so this token is visible to anyone who
// reads the page source. It is NOT bank-grade auth — it only stops
// drive-by writes from anyone who merely finds the /exec URL. For real
// security, switch to Google Sign-In with an email allowlist later.
// To rotate: change it here AND in index.html, then redeploy the web app.
const API_TOKEN = 'tuactive_k7m2p9x4q8r3w6n1z5c0t8b4h7d2f9j3';

// Canonical column name -> header variants to match in row 1.
// Mirrors the typo-tolerant col() helper in index.html so this
// keeps working even if your headers still have the quirks
// (e.g. "Inventroy ", "Asignee") mentioned in the README.
const COLUMN_ALIASES = {
  'Brand':             ['Brand'],
  'Status':            ['Status'],
  'Inventory':         ['Inventroy ', 'Inventroy', 'Inventory'],
  'POS':               ['POS'],
  'OMS':               ['OMS'],
  'Accounts':          ['Accounts'],
  'Load Sheet':        ['Load Sheet'],
  'Manufacturing':     ['Manufacturing'],
  'Deployment start':  ['Deployment start'],
  'Next Day Task':     ['Next Day Task'],
  'Assignee':          ['Asignee', 'Assignee'],
  'Go live date':      ['Go live date ', 'Go live date'],
  'Team':              ['Team'],
};

// ── ALERTS ───────────────────────────────────────────────
// Who gets emailed. Add as many addresses as you want.
const ALERT_EMAILS = ['jahanzaib.saleem.js4@gmail.com'];

// Turn either alert type on/off without touching the rest of the file.
const ENABLE_LIVE_ALERTS = true;       // instant email when a brand's Status becomes "Live"
const ENABLE_DELAYED_DIGEST = true;    // daily email listing brands past their Go-live date

function getSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet tab "' + SHEET_NAME + '" not found — check SHEET_NAME in Code.gs');
  return sheet;
}

// Build canonical-name -> column-index (1-based) map from the actual header row
function getHeaderMap_(sheet) {
  const lastCol = sheet.getLastColumn();
  const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const map = {};
  Object.keys(COLUMN_ALIASES).forEach(canonical => {
    const variants = COLUMN_ALIASES[canonical].map(v => v.trim().toLowerCase());
    for (let i = 0; i < headerRow.length; i++) {
      const h = String(headerRow[i] || '').replace(/^\uFEFF/, '').trim().toLowerCase();
      if (variants.indexOf(h) !== -1) { map[canonical] = i + 1; break; }
    }
  });
  return map;
}

// Find the sheet row number (1-based, includes header) for a given Brand value
function findRowByBrand_(sheet, headerMap, brand) {
  const brandCol = headerMap['Brand'];
  if (!brandCol) throw new Error('Could not find a "Brand" column in row 1');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const values = sheet.getRange(2, brandCol, lastRow - 1, 1).getValues();
  const target = String(brand).trim().toLowerCase();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim().toLowerCase() === target) return i + 2;
  }
  return -1;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── ALERTS: helpers ─────────────────────────────────────────

function sendAlertEmail_(subject, body) {
  if (!ALERT_EMAILS || ALERT_EMAILS.length === 0) return;
  try {
    MailApp.sendEmail({ to: ALERT_EMAILS.join(','), subject: subject, body: body });
  } catch (err) {
    console.error('Failed to send alert email: ' + err);
  }
}

// Sends a "went live" email the moment a brand's status flips to Live.
// Skips it if the brand was already Live before this write (no repeat spam).
function sendLiveAlertIfNeeded_(brand, newStatus, oldStatus, data) {
  if (!ENABLE_LIVE_ALERTS) return;
  const isNowLive = String(newStatus || '').trim().toLowerCase().startsWith('live');
  const wasLive = String(oldStatus || '').trim().toLowerCase().startsWith('live');
  if (!isNowLive || wasLive) return;
  const subject = '🟢 ' + brand + ' is now Live — TU-ACTIVE DEPLOYMENT';
  const body = brand + ' just went live.\n\n' +
    'Team: ' + (data['Team'] || '—') + '\n' +
    'Assignee: ' + (data['Assignee'] || '—') + '\n' +
    'Go-live date: ' + (data['Go live date'] || '—') + '\n\n' +
    '— Sent automatically by your TU-ACTIVE DEPLOYMENT Apps Script';
  sendAlertEmail_(subject, body);
}

// Same free-text date parser the dashboard uses ("7 April, 2026", "4-11-2025", etc.)
// so a sheet cell stored as text is read the same way on both sides.
const ALERT_MONTHS = { jan:0, feb:1, mar:2, apr:3, april:3, may:4, jun:5, jul:6, aug:7, sep:8, sept:8, oct:9, nov:10, dec:11 };
function parseGoLiveDate_(val) {
  if (val instanceof Date) return isNaN(val) ? null : val;
  const t = String(val || '').trim();
  if (!t) return null;
  let m;
  if ((m = t.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/))) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const day = Number(m[1]), mo = Number(m[2]) - 1;
    if (day >= 1 && day <= 31 && mo >= 0 && mo <= 11) {
      const d = new Date(y, mo, day);
      if (!isNaN(d)) return d;
    }
  }
  if ((m = t.match(/^(\d{1,2})\s*([A-Za-z]+)[\s,.]*(\d{2,4})/))) {
    const key = m[2].toLowerCase().replace(/[^a-z]/g, '');
    let mo = ALERT_MONTHS[key];
    if (mo === undefined) {
      for (const k in ALERT_MONTHS) { if (key.indexOf(k.slice(0, 3)) === 0) { mo = ALERT_MONTHS[k]; break; } }
    }
    if (mo !== undefined) {
      const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      const d = new Date(y, mo, Number(m[1]));
      if (!isNaN(d)) return d;
    }
  }
  if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) {
    const d = new Date(t);
    if (!isNaN(d)) return d;
  }
  return null;
}

function findDelayedBrands_(sheet, headerMap) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const lastCol = sheet.getLastColumn();
  const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const out = [];
  data.forEach(row => {
    const get = canonical => headerMap[canonical] ? row[headerMap[canonical] - 1] : '';
    const brand = String(get('Brand') || '').trim();
    if (!brand) return;
    const status = String(get('Status') || '').trim().toLowerCase();
    if (status.startsWith('live')) return;
    const goLive = parseGoLiveDate_(get('Go live date'));
    if (!goLive || goLive >= today) return;
    out.push({
      brand: brand,
      days: Math.round((today - goLive) / 86400000),
      status: get('Status'),
      assignee: get('Assignee'),
      team: get('Team'),
    });
  });
  return out;
}

// ── ALERTS: entry points ────────────────────────────────────

/** Run this once manually from the Apps Script editor to confirm email sending works. */
function testSendAlert() {
  sendAlertEmail_('✅ Test alert — TU-ACTIVE DEPLOYMENT', 'If you got this, email alerts are working correctly.');
}

/** Time-driven trigger target — set this up in Triggers (clock icon) to run once daily. */
function dailyDelayedDigest() {
  if (!ENABLE_DELAYED_DIGEST) return;
  const sheet = getSheet_();
  const headerMap = getHeaderMap_(sheet);
  const delayed = findDelayedBrands_(sheet, headerMap);
  if (delayed.length === 0) return;
  delayed.sort((a, b) => b.days - a.days);
  const lines = delayed.map(d =>
    '• ' + d.brand + ' — ' + d.days + 'd overdue (Status: ' + (d.status || '—') +
    ', Assignee: ' + (d.assignee || '—') + ', Team: ' + (d.team || '—') + ')'
  );
  const subject = '⚠️ ' + delayed.length + ' brand' + (delayed.length > 1 ? 's' : '') + ' delayed — TU-ACTIVE DEPLOYMENT';
  const body = 'Daily delayed-brand digest\n\n' + lines.join('\n') +
    '\n\n— Sent automatically by your TU-ACTIVE DEPLOYMENT Apps Script';
  sendAlertEmail_(subject, body);
}

/** GET — returns all rows as JSON. Useful for testing the deployed URL directly. */
function doGet(e) {
  try {
    const sheet = getSheet_();
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2) return jsonOut_({ ok: true, rows: [] });
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    const rows = data.map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i]; });
      return obj;
    });
    return jsonOut_({ ok: true, rows: rows });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

/** POST — create / update / delete a row. */
function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) {
      return jsonOut_({ ok: false, error: 'No request body received' });
    }
    const body = JSON.parse(e.postData.contents);

    // ── AUTH GATE ── reject any write that doesn't carry the shared secret.
    if (body.token !== API_TOKEN) {
      return jsonOut_({ ok: false, error: 'Unauthorized — missing or invalid token' });
    }

    const action = body.action;
    const sheet = getSheet_();
    const headerMap = getHeaderMap_(sheet);

    if (action === 'create') {
      if (!body.data || !body.data.Brand) {
        return jsonOut_({ ok: false, error: 'Brand is required to create a row' });
      }
      const existingRow = findRowByBrand_(sheet, headerMap, body.data.Brand);
      if (existingRow !== -1) {
        return jsonOut_({ ok: false, error: 'A brand named "' + body.data.Brand + '" already exists' });
      }
      const lastCol = sheet.getLastColumn();
      const newRow = new Array(lastCol).fill('');
      Object.keys(headerMap).forEach(canonical => {
        if (body.data[canonical] !== undefined) {
          newRow[headerMap[canonical] - 1] = body.data[canonical];
        }
      });
      sheet.appendRow(newRow);
      sendLiveAlertIfNeeded_(body.data.Brand, body.data.Status, '', body.data);
      return jsonOut_({ ok: true });
    }

    if (action === 'update') {
      const lookupBrand = body.originalBrand || (body.data && body.data.Brand);
      if (!lookupBrand) return jsonOut_({ ok: false, error: 'originalBrand is required to update a row' });
      const row = findRowByBrand_(sheet, headerMap, lookupBrand);
      if (row === -1) return jsonOut_({ ok: false, error: 'Brand not found: ' + lookupBrand });
      const oldStatus = headerMap['Status'] ? sheet.getRange(row, headerMap['Status']).getValue() : '';
      Object.keys(headerMap).forEach(canonical => {
        if (body.data[canonical] !== undefined) {
          sheet.getRange(row, headerMap[canonical]).setValue(body.data[canonical]);
        }
      });
      sendLiveAlertIfNeeded_(body.data.Brand || lookupBrand, body.data.Status, oldStatus, body.data);
      return jsonOut_({ ok: true });
    }

    if (action === 'delete') {
      if (!body.brand) return jsonOut_({ ok: false, error: 'brand is required to delete a row' });
      const row = findRowByBrand_(sheet, headerMap, body.brand);
      if (row === -1) return jsonOut_({ ok: false, error: 'Brand not found: ' + body.brand });
      sheet.deleteRow(row);
      return jsonOut_({ ok: true });
    }

    return jsonOut_({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}
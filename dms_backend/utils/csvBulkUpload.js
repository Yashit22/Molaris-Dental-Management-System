// ============================================================================
//                     SHARED CSV / SHEET BULK-UPLOAD UTILITIES
// ============================================================================
//
// Used by clinical-findings, diagnoses, suggested-treatments and medicine
// bulk uploads. Produces a consistent { inserted, skipped, total, errors }
// shape where every error carries the row number (1-based, as the user sees
// it in the spreadsheet — i.e. row 2 is the first data row after headers),
// the column name and the offending value so the UI can show "what failed
// and where".

/**
 * Extract the spreadsheet ID from a Google Sheets URL or bare ID.
 */
export function extractSheetId(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9-_]+$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * Parse a CSV string into an array of header-keyed objects. Handles quoted
 * fields, escaped quotes and embedded commas. Keys are lowercased & trimmed.
 *
 * Returns { headers: string[], rows: Array<{ data, _rowNumber }> } where
 * _rowNumber is the spreadsheet row (2 = first data row, after headers).
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (ch === '\r') { /* skip */ }
      else field += ch;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }

  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map(h => h.trim().toLowerCase());
  const dataRows = rows.slice(1)
    .map((r, idx) => ({ raw: r, _rowNumber: idx + 2 })) // +2 = header row + 1-based
    .filter(({ raw }) => raw.some(c => String(c).trim() !== ''))
    .map(({ raw, _rowNumber }) => {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = (raw[idx] ?? '').trim(); });
      return { data: obj, _rowNumber };
    });
  return { headers, rows: dataRows };
}

/**
 * Fetch a Google Sheet as CSV. Returns { headers, rows } or throws an
 * Error whose .userMessage is a sheet-share-aware hint.
 */
export async function fetchSheetCsv(sheetUrl) {
  const sheetId = extractSheetId(sheetUrl);
  if (!sheetId) {
    const err = new Error('Invalid Google Sheets URL or ID.');
    err.userMessage = err.message;
    throw err;
  }
  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
  const response = await fetch(exportUrl, { redirect: 'follow' });
  if (!response.ok) {
    const err = new Error(`Could not read sheet (HTTP ${response.status}).`);
    err.userMessage = `Could not read sheet. Make sure it's shared as "Anyone with the link can view". (HTTP ${response.status})`;
    throw err;
  }
  return parseCsv(await response.text());
}

/**
 * Run a bulk upload using one of:
 *   - body.sheetUrl: Google Sheets URL → fetched & parsed server-side
 *   - body.rows: Pre-parsed array of header-keyed objects (e.g. from a
 *                CSV file uploaded & parsed in the browser). Each row may
 *                carry an optional _rowNumber to preserve the source row.
 *
 * Config:
 *   requiredHeaders: string[]            — error if any header missing
 *   validateRow(row, ctx) => string|null — return error message string if
 *                                          invalid; null/'' otherwise. ctx
 *                                          carries existingKeys & seenKeys.
 *   transformRow(row) => mongooseDoc     — shape the row for insertMany.
 *   dedupeKey(row) => string|null        — case-insensitive dedupe key
 *                                          (e.g. name). null disables dedupe.
 *   existingKeys: Set<string>            — keys already in the DB (lowercased).
 *
 * Returns { inserted, skipped, total, errors, insertedRows }.
 */
export async function runBulkInsert({ body, requiredHeaders = ['name'], validateRow, transformRow, dedupeKey, existingKeys, Model }) {
  let headers, rows;

  if (Array.isArray(body?.rows)) {
    // Client-parsed rows (file upload path)
    rows = body.rows.map((r, idx) => {
      const data = {};
      Object.keys(r || {}).forEach(k => {
        if (k === '_rowNumber') return;
        data[String(k).trim().toLowerCase()] = r[k] == null ? '' : String(r[k]).trim();
      });
      return { data, _rowNumber: r?._rowNumber ?? (idx + 2) };
    });
    headers = rows.length ? Object.keys(rows[0].data) : [];
  } else if (body?.sheetUrl) {
    const parsed = await fetchSheetCsv(body.sheetUrl);
    headers = parsed.headers;
    rows = parsed.rows;
  } else {
    throw Object.assign(new Error('Provide either sheetUrl or rows.'), { status: 400 });
  }

  // Header validation
  const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
  if (missingHeaders.length) {
    throw Object.assign(
      new Error(`Missing required column(s): ${missingHeaders.join(', ')}`),
      { status: 400 }
    );
  }
  if (rows.length === 0) {
    throw Object.assign(new Error('No data rows found.'), { status: 400 });
  }

  const errors = [];
  const toInsert = [];
  const insertedRows = [];
  const seenKeys = new Set();

  for (const { data, _rowNumber } of rows) {
    const ctx = { existingKeys, seenKeys, rowNumber: _rowNumber };
    const validationError = validateRow ? validateRow(data, ctx) : null;
    if (validationError) {
      errors.push({
        row: _rowNumber,
        column: validationError.column || 'name',
        value: validationError.value !== undefined ? validationError.value : (data.name || ''),
        error: typeof validationError === 'string' ? validationError : validationError.message,
      });
      continue;
    }
    if (dedupeKey) {
      const key = (dedupeKey(data) || '').toLowerCase();
      if (key) {
        if (existingKeys?.has(key)) {
          errors.push({ row: _rowNumber, column: 'name', value: data.name || '', error: 'Already exists in your library' });
          continue;
        }
        if (seenKeys.has(key)) {
          errors.push({ row: _rowNumber, column: 'name', value: data.name || '', error: 'Duplicate of an earlier row in this upload' });
          continue;
        }
        seenKeys.add(key);
      }
    }
    const doc = transformRow(data);
    toInsert.push(doc);
    insertedRows.push(_rowNumber);
  }

  let inserted = 0;
  if (toInsert.length && Model) {
    const docs = await Model.insertMany(toInsert, { ordered: false });
    inserted = docs.length;
  }

  return {
    inserted,
    skipped: errors.length,
    total: rows.length,
    errors,
    insertedRows,
  };
}

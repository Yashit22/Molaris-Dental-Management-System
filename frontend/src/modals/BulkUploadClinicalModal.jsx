import React, { useRef, useState } from 'react';
import { X, Upload, FileSpreadsheet, Link2, Download, Loader2, CheckCircle, XCircle, AlertTriangle, ExternalLink } from 'lucide-react';
import API from '../services/api';

const TYPE_CONFIG = {
  findings: {
    title: 'Bulk Upload — Clinical Findings',
    endpoint: '/clinical-findings/bulk-upload',
    sampleFileName: 'clinical_findings_sample.csv',
    headers: ['name', 'category', 'description'],
    sampleRows: [
      ['Bleeding on probing', 'Periodontal', 'Gingival bleeding on probing'],
      ['Pocket depth 5 mm',   'Periodontal', 'Pathological sulcus depth'],
      ['Dentine caries',      'Hard Tissue', 'Decay extending into dentine'],
    ],
  },
  diagnoses: {
    title: 'Bulk Upload — Diagnoses',
    endpoint: '/diagnoses/bulk-upload',
    sampleFileName: 'diagnoses_sample.csv',
    headers: ['name', 'code', 'category', 'description'],
    sampleRows: [
      ['Irreversible pulpitis', 'K04.01', 'Pulp & Periapical', 'Pulp inflammation beyond recovery'],
      ['Chronic gingivitis',    'K05.1',  'Periodontal',       'Long-standing gingival inflammation'],
    ],
  },
  treatments: {
    title: 'Bulk Upload — Suggested Treatments',
    endpoint: '/suggested-treatments/bulk-upload',
    sampleFileName: 'suggested_treatments_sample.csv',
    headers: ['name', 'category', 'cost', 'description'],
    sampleRows: [
      ['Composite filling (Class I)', 'Restorative', '800',  'Single surface composite'],
      ['RCT — molar',                 'Endodontic',  '6000', '3–4 canal molar RCT'],
      ['Scaling and polishing',       'Periodontal', '1200', 'Routine cleaning'],
    ],
  },
  medicines: {
    title: 'Bulk Upload — Medicines',
    endpoint: '/medicines/bulk-upload',
    sampleFileName: 'medicines_sample.csv',
    headers: ['name', 'composition', 'strength', 'form', 'category', 'default_dosage', 'default_duration', 'default_instructions', 'cost'],
    sampleRows: [
      ['Amoxicillin 500mg', 'Amoxicillin 500mg', '500mg', 'Capsule', 'Antibiotic', '1-0-1', '5 days', 'After food', '8'],
      ['Ibuprofen 400mg',   'Ibuprofen 400mg',   '400mg', 'Tablet',  'Analgesic',  '1-1-1', '3 days', 'After food', '2'],
      ['Chlorhexidine Mouthwash', 'Chlorhexidine Gluconate 0.2%', '0.2%', 'Mouthwash', 'Antiseptic', '0-1-1', '7 days', 'Rinse 10ml, do not swallow', '85'],
    ],
  },
};

// Tiny CSV writer (escapes quotes and commas).
function toCsv(rows) {
  return rows.map(r => r.map(cell => {
    const s = String(cell ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n');
}

// CSV parser with quote handling. Returns { headers, rows } where each row
// is keyed by header (lowercased & trimmed) and carries _rowNumber (1-based
// with the header counted as row 1 — first data row = 2).
function parseCsvText(text) {
  const out = [];
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
      else if (ch === '\n') { row.push(field); out.push(row); row = []; field = ''; }
      else if (ch === '\r') { /* skip */ }
      else field += ch;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); out.push(row); }

  if (!out.length) return { headers: [], rows: [] };
  const headers = out[0].map(h => h.trim().toLowerCase());
  const rows = out.slice(1)
    .map((raw, idx) => ({ raw, _rowNumber: idx + 2 }))
    .filter(({ raw }) => raw.some(c => String(c).trim() !== ''))
    .map(({ raw, _rowNumber }) => {
      const obj = { _rowNumber };
      headers.forEach((h, idx) => { obj[h] = (raw[idx] ?? '').trim(); });
      return obj;
    });
  return { headers, rows };
}

export default function BulkUploadClinicalModal({ tab, onClose, onComplete }) {
  const cfg = TYPE_CONFIG[tab];
  const [mode, setMode] = useState('file'); // 'file' | 'sheet'
  const [file, setFile] = useState(null);
  const [parsedPreview, setParsedPreview] = useState(null); // { headers, rows }
  const [sheetUrl, setSheetUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null); // { inserted, skipped, total, errors }
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const downloadSample = () => {
    const csv = toCsv([cfg.headers, ...cfg.sampleRows]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = cfg.sampleFileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (f) => {
    setError('');
    setResult(null);
    setFile(f);
    if (!f) { setParsedPreview(null); return; }
    if (!/\.csv$/i.test(f.name)) {
      setError('Please select a .csv file. (For Excel, export your sheet as CSV first, or use the Google Sheets tab.)');
      setParsedPreview(null);
      return;
    }
    try {
      const text = await f.text();
      const parsed = parseCsvText(text);
      if (!parsed.headers.includes('name')) {
        setError('CSV must include a "name" column. Download the sample to see the expected headers.');
        setParsedPreview(null);
        return;
      }
      if (parsed.rows.length === 0) {
        setError('CSV has no data rows.');
        setParsedPreview(null);
        return;
      }
      setParsedPreview(parsed);
    } catch (err) {
      setError('Could not read the file: ' + err.message);
      setParsedPreview(null);
    }
  };

  const submitFile = async () => {
    if (!parsedPreview) return;
    setUploading(true);
    setError('');
    try {
      const res = await API.post(cfg.endpoint, { rows: parsedPreview.rows });
      setResult(res.data);
      onComplete?.();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setUploading(false);
    }
  };

  const submitSheet = async (e) => {
    e.preventDefault();
    if (!sheetUrl.trim()) return;
    setUploading(true);
    setError('');
    setResult(null);
    try {
      const res = await API.post(cfg.endpoint, { sheetUrl: sheetUrl.trim() });
      setResult(res.data);
      onComplete?.();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={20} className="text-green-600" />
            <h3 className="font-bold text-lg text-slate-800 dark:text-white">{cfg.title}</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"><X size={20} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {!result && (
            <>
              {/* Sample download + headers preview */}
              <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Step 1 — Get the template</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      Download the sample CSV with the exact columns we expect, fill it in, then upload it here.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {cfg.headers.map(h => (
                        <code key={h} className="text-[11px] bg-white dark:bg-slate-800 border border-blue-200 text-blue-700 px-1.5 py-0.5 rounded font-mono">
                          {h}{h === 'name' ? ' *' : ''}
                        </code>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5">* = required. Other columns are optional.</p>
                  </div>
                  <button
                    onClick={downloadSample}
                    className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-white border border-blue-300 hover:bg-blue-100 text-blue-700 text-sm font-semibold rounded-lg"
                  >
                    <Download size={14} /> Sample CSV
                  </button>
                </div>
              </div>

              {/* Mode tabs */}
              <div className="flex rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 w-fit">
                <button
                  onClick={() => { setMode('file'); setError(''); }}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-colors ${
                    mode === 'file' ? 'bg-[#137fec] text-white' : 'bg-white dark:bg-slate-800 text-slate-600'
                  }`}
                >
                  <Upload size={14} /> Upload CSV
                </button>
                <button
                  onClick={() => { setMode('sheet'); setError(''); }}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-colors ${
                    mode === 'sheet' ? 'bg-[#137fec] text-white' : 'bg-white dark:bg-slate-800 text-slate-600'
                  }`}
                >
                  <Link2 size={14} /> Google Sheets URL
                </button>
              </div>

              {/* File mode */}
              {mode === 'file' && (
                <div className="space-y-3">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 text-center cursor-pointer hover:border-[#137fec] hover:bg-blue-50/30 transition-colors"
                  >
                    <Upload size={28} className="mx-auto text-slate-400 mb-2" />
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      {file ? file.name : 'Click to pick a CSV file'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {parsedPreview ? `${parsedPreview.rows.length} row(s) detected` : 'Excel users — File → Save As → CSV first.'}
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={(e) => handleFile(e.target.files?.[0])}
                    />
                  </div>

                  {parsedPreview && (
                    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                      <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Preview — first 5 rows
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-800">
                            <tr>
                              <th className="px-3 py-2 text-left text-slate-500">Row</th>
                              {parsedPreview.headers.map(h => (
                                <th key={h} className="px-3 py-2 text-left text-slate-500 font-semibold">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {parsedPreview.rows.slice(0, 5).map(r => (
                              <tr key={r._rowNumber}>
                                <td className="px-3 py-1.5 text-slate-400">{r._rowNumber}</td>
                                {parsedPreview.headers.map(h => (
                                  <td key={h} className="px-3 py-1.5 text-slate-700 dark:text-slate-300 max-w-[200px] truncate">{r[h] || '—'}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                    <button
                      onClick={submitFile}
                      disabled={!parsedPreview || uploading}
                      className="px-5 py-2 rounded-lg bg-[#137fec] text-white text-sm font-bold hover:bg-blue-600 disabled:opacity-60 flex items-center gap-2"
                    >
                      {uploading ? <><Loader2 size={14} className="animate-spin" /> Importing…</> : <><Upload size={14} /> Import {parsedPreview ? `${parsedPreview.rows.length} row(s)` : ''}</>}
                    </button>
                  </div>
                </div>
              )}

              {/* Sheet mode */}
              {mode === 'sheet' && (
                <form onSubmit={submitSheet} className="space-y-3">
                  <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                    <p><b>1.</b> Open your Google Sheet → click <b>Share</b> → set <b>General access</b> to <b>"Anyone with the link"</b> (Viewer).</p>
                    <p><b>2.</b> Copy the URL and paste it below.</p>
                    <a href="https://docs.google.com/spreadsheets/create" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-1 text-[#137fec] font-semibold hover:underline">
                      <ExternalLink size={11} /> Create a new Google Sheet
                    </a>
                  </div>
                  <input
                    type="url"
                    required
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-[#137fec] outline-none bg-white dark:bg-slate-800"
                  />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                    <button type="submit" disabled={uploading} className="px-5 py-2 rounded-lg bg-[#137fec] text-white text-sm font-bold hover:bg-blue-600 disabled:opacity-60 flex items-center gap-2">
                      {uploading ? <><Loader2 size={14} className="animate-spin" /> Importing…</> : <><Upload size={14} /> Import from Sheet</>}
                    </button>
                  </div>
                </form>
              )}

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl text-sm bg-red-50 text-red-700 border border-red-100">
                  <XCircle size={14} className="mt-0.5 flex-shrink-0" />
                  {error}
                </div>
              )}
            </>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{result.inserted}</p>
                  <p className="text-xs text-slate-500 uppercase">Imported</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-amber-700">{result.skipped}</p>
                  <p className="text-xs text-slate-500 uppercase">Errors</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">{result.total}</p>
                  <p className="text-xs text-slate-500 uppercase">Total Rows</p>
                </div>
              </div>

              {result.inserted > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 text-green-700 text-sm border border-green-100">
                  <CheckCircle size={14} />
                  Imported {result.inserted} row{result.inserted !== 1 ? 's' : ''} successfully.
                </div>
              )}

              {result.errors?.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={16} className="text-amber-600" />
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      {result.errors.length} row{result.errors.length !== 1 ? 's' : ''} skipped — fix and re-upload
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 mb-2">
                    Row numbers below match the row numbers in your CSV / sheet (header is row 1).
                  </p>
                  <div className="border border-amber-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-amber-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Row</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Column</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Value</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Why it failed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-100">
                        {result.errors.map((e, idx) => (
                          <tr key={idx} className="hover:bg-amber-50/50">
                            <td className="px-3 py-1.5 font-mono text-slate-700">{e.row}</td>
                            <td className="px-3 py-1.5 text-slate-600">{e.column || '—'}</td>
                            <td className="px-3 py-1.5 text-slate-500 max-w-[180px] truncate" title={e.value}>{e.value || <span className="italic text-slate-400">(empty)</span>}</td>
                            <td className="px-3 py-1.5 text-red-600">{e.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => { setResult(null); setFile(null); setParsedPreview(null); setSheetUrl(''); }}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Upload another
                </button>
                <button onClick={onClose} className="px-5 py-2 rounded-lg bg-[#137fec] text-white text-sm font-bold hover:bg-blue-600">
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

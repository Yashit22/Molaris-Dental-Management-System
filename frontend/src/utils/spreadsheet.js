import ExcelJS from 'exceljs';

// Parse an uploaded .xlsx / .xls / .csv file into an array of row objects
// keyed by the header row. Empty cells become ''.
export function parseSpreadsheet(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = async (e) => {
      try {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'csv') {
          const text = new TextDecoder().decode(e.target.result);
          const lines = text.split(/\r?\n/).filter((l) => l.trim());
          if (lines.length === 0) return resolve([]);
          const headers = lines[0].split(',').map((h) => h.trim());
          const rows = lines.slice(1).map((line) => {
            const cells = line.split(',');
            return Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? '').trim()]));
          });
          return resolve(rows);
        }
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(e.target.result);
        const sheet = wb.worksheets[0];
        if (!sheet) return resolve([]);
        const rowValues = [];
        sheet.eachRow((row) => rowValues.push(row.values.slice(1)));
        if (rowValues.length === 0) return resolve([]);
        const headers = rowValues[0].map((h) => String(h ?? '').trim());
        const rows = rowValues.slice(1).map((cells) =>
          Object.fromEntries(headers.map((h, i) => [h, String(cells[i] ?? '').trim()]))
        );
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function triggerDownload(buffer, filename) {
  const blob = new Blob([buffer], {
    type: filename.endsWith('.csv')
      ? 'text/csv'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Download a sample template: header row + optional example rows.
// headers: string[]   exampleRows: Array<Record<string, any>>
export async function downloadSampleSheet(baseName, headers, exampleRows = []) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Template');
  sheet.addRow(headers);
  if (exampleRows.length) {
    exampleRows.forEach((r) => sheet.addRow(headers.map((h) => r[h] ?? '')));
  }
  const buffer = await wb.xlsx.writeBuffer();
  triggerDownload(buffer, `${baseName}_sample.xlsx`);
}

// Export data rows to csv or xlsx.
// headers: string[]   rows: Array<Array<any>> (already ordered to match headers)
export async function exportSheet(baseName, headers, rows, format = 'xlsx') {
  if (format === 'csv') {
    const lines = [headers, ...rows].map((r) => r.join(','));
    const buffer = new TextEncoder().encode(lines.join('\n'));
    triggerDownload(buffer, `${baseName}.csv`);
    return;
  }
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Sheet1');
  sheet.addRow(headers);
  rows.forEach((r) => sheet.addRow(r));
  const buffer = await wb.xlsx.writeBuffer();
  triggerDownload(buffer, `${baseName}.xlsx`);
}

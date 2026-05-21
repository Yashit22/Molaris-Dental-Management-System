---
title: Setting Up Clinical Data (Findings · Diagnoses · Treatments)
journey: Management
order: 9
tags: [settings, clinical data, findings, diagnoses, treatments, bulk upload, csv, library, import]
keywords: add findings, add diagnoses, add suggested treatments, bulk upload csv sheet, import dental library, fix bulk upload errors, which row is wrong
video:
---

## Setting Up Clinical Data

Before you start charting, set up your clinic's master lists for **Clinical Findings**, **Diagnoses** and **Suggested Treatments**. These drive the dropdowns and treatment plan suggestions throughout the Treatment page.

Go to **Settings → Clinical Data**. Pick the sub-tab you want (Findings / Diagnoses / Treatments), then click the blue **Add [tab name]** button.

---

### Four ways to add — pick what fits

When you click **Add**, a chooser appears with four options:

1. **Add One** — Open a small form and add a single item. Best for ad-hoc additions during the day.
2. **Quick Entry** — Type several items row-by-row into an in-place table. Best when you have 5–15 items to add fast.
3. **Bulk Upload** — Upload a CSV file or paste a Google Sheets URL. Best for migrating from an old system or importing 50+ items.
4. **Import from Library** — Pick from our pre-built dental starter catalog. Best for new clinics — gives you a working baseline in seconds.

---

### Bulk Upload — step by step

1. Click **Add → Bulk Upload**.
2. **Download the sample CSV** at the top of the modal. It has the exact columns we expect — for example, `name` (required), `category`, `description` for findings; `name`, `category`, `cost`, `description` for treatments.
3. Fill in the file using Excel, Google Sheets, or any text editor that saves CSV. Don't rename the headers.
4. Choose how to upload:
   - **Upload CSV** — Click the drop zone and pick the file. You'll see a 5-row preview before sending.
   - **Google Sheets URL** — Set your sheet to **Share → Anyone with the link → Viewer** and paste the URL.
5. Click **Import**. The system processes every row and tells you the result.

---

### Reading the error report

After upload, the modal shows three numbers — **Imported**, **Errors**, **Total Rows** — plus a detailed table for every row that failed:

| Column | What it means |
|--------|---------------|
| **Row** | The exact row number in your spreadsheet (header is row 1, so the first data row is row 2). |
| **Column** | Which column had the problem (`name`, `cost`, etc.). |
| **Value** | What you wrote in that cell (or `(empty)` if blank). |
| **Why it failed** | Plain-English reason: "Name is required", "Already exists in your library", "Cost must be a number", "Duplicate of an earlier row in this upload". |

Open your sheet, jump to the row numbers shown, fix the cells flagged, and re-upload. Successful rows that went in the first time will be skipped as duplicates on the second pass — only the corrected rows will be imported.

---

### Things to keep in mind

> **The header row counts as row 1.** When the error table says "Row 7", that's the seventh row in your sheet, which means the sixth row of data. Always check the row number against the spreadsheet itself, not the import preview.

> **Duplicates are blocked by name (case-insensitive).** "Composite Filling" and "composite filling" are treated as the same item. If you re-upload, items already in the library will be flagged — no harm done.

> **You can mix all four methods.** Use the library to seed, then add one-offs as you go, then bulk-upload if you migrate from another system. They don't conflict.

> **Quick Entry skips the file dance.** If you have a small batch (10–15 items), Quick Entry is usually faster than Excel.

---

### What happens next

- Findings appear in the **Clinical Findings** picker on the Treatment page.
- Diagnoses populate the **Diagnosis** dropdown.
- Suggested Treatments show up in the treatment plan board with their default cost prefilled (you can override per-patient).

Need to fix or delete an item later? Open Settings → Clinical Data → the relevant tab and use the trash icon next to the item.

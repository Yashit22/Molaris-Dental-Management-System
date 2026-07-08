import { PDFDocument } from 'pdf-lib';
import { downloadFileFromDrive } from './googleDrive.service.js';

/**
 * A valid, page-less PDF buffer used as the base when the user selects only
 * uploaded files (so there is no leading blank page). appendDriveFilesToPdf adds
 * the file pages onto it.
 */
export async function emptyPdfBuffer() {
  const doc = await PDFDocument.create();
  return Buffer.from(await doc.save());
}

// A4 in PDF points (72 dpi): 595.28 × 841.89.
const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 24;

// Identify a file from its magic bytes (Drive downloads often lie in the header,
// returning application/octet-stream). Falls back to the reported mime type.
function detectKind(buf, mimeType = '') {
  if (buf && buf.length >= 4) {
    if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'pdf';  // %PDF
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';  // .PNG
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';                     // JPEG SOI
  }
  const mt = (mimeType || '').toLowerCase();
  if (mt.includes('pdf')) return 'pdf';
  if (mt.includes('png')) return 'png';
  if (mt.includes('jpeg') || mt.includes('jpg')) return 'jpg';
  return 'other';
}

/**
 * Append uploaded visit files (from Google Drive) onto an already-rendered base
 * PDF, producing one combined PDF.
 *
 *   • PDF attachments  → all their pages are copied in verbatim.
 *   • Image attachments (jpg/jpeg/png) → each placed on its own A4 page, scaled
 *     to fit within the margins.
 *
 * Non-embeddable types (e.g. gif/webp/tiff, or corrupt files) are skipped; a
 * failure on one attachment never aborts the merge.
 *
 * @param {Buffer} baseBuffer   The Chromium-rendered document PDF.
 * @param {string[]} driveFileIds  Drive file ids of the uploaded files to append.
 * @param {object} credentials  Tenant Drive credentials.
 * @returns {Promise<Buffer>}   Combined PDF buffer (base unchanged if nothing appended).
 */
export async function appendDriveFilesToPdf(baseBuffer, driveFileIds, credentials, { replaceBase = false } = {}) {
  if (!Array.isArray(driveFileIds) || driveFileIds.length === 0) return baseBuffer;

  const merged = await PDFDocument.load(baseBuffer);
  // When the base is just an empty placeholder (only uploaded files selected),
  // remember its pages so we can drop them after appending — avoids a blank page.
  const basePageCount = replaceBase ? merged.getPageCount() : 0;

  for (const fileId of driveFileIds) {
    try {
      const { data, mimeType } = await downloadFileFromDrive(credentials, fileId);
      // Drive's alt=media download often returns application/octet-stream, so
      // detect the real type from the file's magic bytes (fall back to header).
      const kind = detectKind(data, mimeType);

      if (kind === 'pdf') {
        const src = await PDFDocument.load(data, { ignoreEncryption: true });
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach(p => merged.addPage(p));
      } else if (kind === 'png' || kind === 'jpg') {
        const img = kind === 'png'
          ? await merged.embedPng(data)
          : await merged.embedJpg(data);
        const page = merged.addPage([A4.w, A4.h]);
        const maxW = A4.w - MARGIN * 2;
        const maxH = A4.h - MARGIN * 2;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        page.drawImage(img, {
          x: (A4.w - w) / 2,
          y: (A4.h - h) / 2,
          width: w,
          height: h,
        });
      } else {
        console.warn('[pdfMerge] Skipping unembeddable attachment:', mimeType, fileId);
      }
    } catch (err) {
      console.warn('[pdfMerge] Failed to append attachment', fileId, '-', err.message);
    }
  }

  // Drop the placeholder base page(s) once real content has been appended — but
  // only if at least one attachment actually landed, so we never return a 0-page
  // (invalid) PDF.
  if (basePageCount > 0 && merged.getPageCount() > basePageCount) {
    for (let i = basePageCount - 1; i >= 0; i--) merged.removePage(i);
  }

  const out = await merged.save();
  return Buffer.from(out);
}

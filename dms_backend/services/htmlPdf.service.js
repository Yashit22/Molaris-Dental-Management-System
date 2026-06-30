import puppeteer from 'puppeteer';

// ─── Headless Chromium HTML → PDF renderer ──────────────────────────────────────
// The frontend (VisitDocumentsModal) builds the rich, good-looking document HTML
// for the Print path. To make Save / Share / Email produce a *pixel-identical*
// PDF, we render that exact same HTML here with headless Chromium instead of
// redrawing it with PDFKit (which can't do the tooth SVGs, anatomy grids, cards,
// or rich text). The HTML is the single source of truth for document appearance.

let browserPromise = null;

// Launch (once) and reuse a single browser instance across requests.
async function getBrowser() {
  if (browserPromise) {
    const browser = await browserPromise.catch(() => null);
    if (browser && browser.connected) return browser;
    browserPromise = null; // stale/crashed — relaunch
  }
  browserPromise = puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', // avoid /dev/shm exhaustion on small servers
      '--disable-gpu',
    ],
  });
  const browser = await browserPromise;
  browser.on('disconnected', () => { browserPromise = null; });
  return browser;
}

/**
 * Render a full HTML document string to a PDF Buffer (A4).
 * Waits for network-idle so CDN images (tooth/anatomy SVGs) and inline base64
 * images finish loading before the PDF is captured.
 *
 * @param {string} html  A complete HTML document (<!DOCTYPE html>…)
 * @returns {Promise<Buffer>}
 */
export async function htmlToPdfBuffer(html) {
  if (!html || !String(html).trim()) throw new Error('No HTML provided to render');
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true, // honour the @page rule in the document's <style>
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}

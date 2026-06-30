import { buildVisitDocumentPdfFromIds } from '../services/documentPdf.service.js';
import { htmlToPdfBuffer } from '../services/htmlPdf.service.js';
import { uploadFile } from '../services/cloudinary.service.js';
import { sendEmail } from '../services/email.service.js';

// Resolve the combined-document PDF buffer.
// Preferred path: the client sends the exact rich HTML it renders for Print, and
// we render it with headless Chromium → pixel-identical PDF. Fallback (no html,
// e.g. AI-report / WhatsApp callers): rebuild from DB ids with PDFKit.
async function resolveDocumentPdf(req, { visitId, patientId, invoiceId, reportJobId, include, html }) {
  if (html && String(html).trim()) {
    return htmlToPdfBuffer(html);
  }
  return buildVisitDocumentPdfFromIds(req.tenantModels, {
    visitId, patientId, invoiceId, reportJobId, include,
  }, req.tenantConfig);
}

// Seed document branding from existing settings/tenant the first time it's read.
function buildSeedDefaults(invoiceS, prescriptionS) {
  const inv = invoiceS?.clinic || {};
  const pr = prescriptionS?.clinic || {};
  return {
    clinic_name:     inv.name || pr.name || '',
    tagline:         pr.tagline || '',
    address:         (inv.addressLines || pr.addressLines || []).join(', '),
    phone:           inv.phone || pr.phone || '',
    email:           inv.email || pr.email || '',
    reg_number:      '',
    clinic_logo_url: inv.logoUrl || pr.logoUrl || '',
    currency_symbol: invoiceS?.currencySymbol || '₹',
    gstin:           inv.gstNumber || '',
    invoice_prefix:  invoiceS?.invoiceNumber?.prefix || 'INV',
    invoice_footer_text:      invoiceS?.footerText || '',
    prescription_footer_text: prescriptionS?.footerText || '',
  };
}

// GET /api/documents/settings
export async function getDocumentSettings(req, res) {
  try {
    const { DocumentSettings, InvoiceSettings, PrescriptionSettings } = req.tenantModels;
    let doc = await DocumentSettings.findOne({}).lean();
    if (!doc) {
      const [inv, pr] = await Promise.all([
        InvoiceSettings.findOne({}).lean(),
        PrescriptionSettings.findOne({}).lean(),
      ]);
      // Return seeded defaults (not persisted until the user saves)
      return res.json(buildSeedDefaults(inv, pr));
    }
    const { _id, __v, createdAt, updatedAt, ...data } = doc;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// PUT /api/documents/settings
export async function saveDocumentSettings(req, res) {
  try {
    const { DocumentSettings } = req.tenantModels;
    const { _id, __v, createdAt, updatedAt, ...body } = req.body;
    const doc = await DocumentSettings.findOneAndUpdate(
      {},
      { $set: body },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    const { _id: id, __v: v, createdAt: ca, updatedAt: ua, ...data } = doc;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/documents/upload-image  (clinic logo or payment QR) → { url }
export async function uploadDocumentImage(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const uploaded = await uploadFile(
      req.file.buffer,
      req.file.originalname,
      'dms/document-branding',
      [],
      req.tenantConfig
    );
    res.status(201).json({ url: uploaded.url, publicId: uploaded.publicId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/documents/pdf  → streams a combined PDF (inline) for Save/Share
export async function generateDocumentPdf(req, res) {
  try {
    const { visitId, patientId, invoiceId, reportJobId, include, html } = req.body;
    const buffer = await resolveDocumentPdf(req, { visitId, patientId, invoiceId, reportJobId, include, html });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="documents.pdf"`);
    res.send(buffer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// POST /api/documents/email  → emails the combined PDF as an attachment
export async function emailDocumentPdf(req, res) {
  try {
    const { EmailSettings } = req.tenantModels;
    const { visitId, patientId, invoiceId, reportJobId, include, to, subject, body, patientName, html } = req.body;

    if (!to) return res.status(400).json({ error: 'Recipient email (to) is required' });

    const settings = await EmailSettings.findOne({});
    if (!settings || !settings.enabled) {
      return res.status(400).json({ error: 'Email delivery is not enabled. Configure SMTP in Settings → Email.' });
    }

    const buffer = await resolveDocumentPdf(req, { visitId, patientId, invoiceId, reportJobId, include, html });

    await sendEmail({
      tenantModels: req.tenantModels,
      settings,
      to,
      subject: subject || 'Your documents from the clinic',
      text: body || 'Please find your documents attached.',
      html: undefined,
      attachments: [{
        filename: `documents-${Date.now()}.pdf`,
        content: buffer,
        contentType: 'application/pdf',
      }],
      patientId,
      event: 'documentShared',
    });

    res.json({ ok: true, message: `Document emailed to ${to}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

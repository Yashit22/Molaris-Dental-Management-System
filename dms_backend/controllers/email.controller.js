import PDFDocumentLib from 'pdfkit';
import {
  getTransporter,
  invalidateTransporterCache,
  buildEmailMessage,
  generateReportPdf,
  sendEmail,
} from '../services/email.service.js';
import { encrypt, decrypt } from '../utils/crypto.util.js';
import * as Templates from '../services/emailTemplates.js';

// ─── PDF helpers ───────────────────────────────────────────────────────────

function stripHtml(html) {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function generateVisitSummaryPdf(visit, patientName, doctorName, date) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocumentLib({ margin: 50 });
    const buffers = [];
    doc.on('data', c => buffers.push(c));
    doc.on('end',  () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    doc.fontSize(16).font('Helvetica-Bold').text('Visit Summary', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica')
      .text(`Patient: ${patientName}`)
      .text(`Doctor: ${doctorName}`)
      .text(`Date: ${date}`);
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    if (visit.treatments?.length) {
      doc.fontSize(12).font('Helvetica-Bold').text('Treatment Plan');
      doc.moveDown(0.3);
      visit.treatments.forEach(t => {
        const teeth = t.teeth_numbers?.length ? ` (Teeth: ${t.teeth_numbers.join(', ')})` : '';
        doc.fontSize(10).font('Helvetica').text(`• ${t.treatment_name}${teeth} — ${t.status} — ₹${t.cost || 0}`);
      });
      doc.moveDown();
    }

    if (visit.prescriptions?.length) {
      doc.fontSize(12).font('Helvetica-Bold').text('Prescriptions');
      doc.moveDown(0.3);
      visit.prescriptions.forEach(p => {
        const parts = [p.drug_name, p.dosage, p.duration ? `for ${p.duration}` : '', p.instructions].filter(Boolean).join(' — ');
        doc.fontSize(10).font('Helvetica').text(`• ${parts}`);
      });
      doc.moveDown();
    }

    if (visit.consultation_notes?.length) {
      doc.fontSize(12).font('Helvetica-Bold').text('Consultation Notes');
      doc.moveDown(0.3);
      visit.consultation_notes.forEach(n => {
        doc.fontSize(10).font('Helvetica').text(stripHtml(n.content));
        doc.moveDown(0.3);
      });
      doc.moveDown();
    }

    if (visit.advices?.length) {
      doc.fontSize(12).font('Helvetica-Bold').text('Advice');
      doc.moveDown(0.3);
      visit.advices.forEach(a => {
        doc.fontSize(10).font('Helvetica').text(stripHtml(a.content));
        doc.moveDown(0.3);
      });
    }

    doc.end();
  });
}

function generateInvoicePdf(invoice, patientName) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocumentLib({ margin: 50 });
    const buffers = [];
    doc.on('data', c => buffers.push(c));
    doc.on('end',  () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    doc.fontSize(18).font('Helvetica-Bold').text('INVOICE', { align: 'center' });
    doc.moveDown(0.5);
    const invDate = new Date(invoice.date || invoice.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.fontSize(10).font('Helvetica')
      .text(`Invoice #: ${invoice.invoice_id}`)
      .text(`Patient: ${patientName}`)
      .text(`Date: ${invDate}`);
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    // Column headers
    const col = { item: 50, qty: 310, rate: 370, total: 450 };
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Item',  col.item,  doc.y, { width: 255 });
    doc.text('Qty',   col.qty,   doc.y - doc.currentLineHeight(), { width: 55,  align: 'right' });
    doc.text('Rate',  col.rate,  doc.y - doc.currentLineHeight(), { width: 75,  align: 'right' });
    doc.text('Total', col.total, doc.y - doc.currentLineHeight(), { width: 95,  align: 'right' });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.3);

    doc.font('Helvetica').fontSize(10);
    (invoice.items || []).forEach(item => {
      const y = doc.y;
      doc.text(item.name,            col.item,  y, { width: 255 });
      doc.text(String(item.quantity), col.qty,  y, { width: 55,  align: 'right' });
      doc.text(`₹${item.rate}`,       col.rate, y, { width: 75,  align: 'right' });
      doc.text(`₹${item.total}`,      col.total,y, { width: 95,  align: 'right' });
      doc.moveDown();
    });

    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.3);

    // Totals
    doc.font('Helvetica').fontSize(10).text(`Subtotal:`, 350, doc.y, { width: 95, align: 'right' });
    doc.text(`₹${invoice.subtotal ?? invoice.total_amount}`, col.total, doc.y - doc.currentLineHeight(), { width: 95, align: 'right' });
    doc.moveDown();
    if (invoice.tax) {
      doc.text('Tax:', 350, doc.y, { width: 95, align: 'right' });
      doc.text(`₹${invoice.tax}`, col.total, doc.y - doc.currentLineHeight(), { width: 95, align: 'right' });
      doc.moveDown();
    }
    doc.font('Helvetica-Bold').fontSize(11);
    doc.text('Total:', 350, doc.y, { width: 95, align: 'right' });
    doc.text(`₹${invoice.total_amount}`, col.total, doc.y - doc.currentLineHeight(), { width: 95, align: 'right' });
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10)
      .fillColor('green').text(`Paid: ₹${invoice.paid_amount || 0}`, 350, doc.y, { width: 195, align: 'right' });
    doc.moveDown();
    if ((invoice.pending_amount || 0) > 0) {
      doc.fillColor('red').text(`Pending: ₹${invoice.pending_amount}`, 350, doc.y, { width: 195, align: 'right' });
    }

    doc.end();
  });
}

// ─── Settings ──────────────────────────────────────────────────────────────

export async function getSettings(req, res) {
  const { EmailSettings } = req.tenantModels;

  try {
    let settings = await EmailSettings.findOne({});

    if (!settings) {
      // Return defaults if no settings exist
      settings = {
        enabled: false,
        automationEnabled: false,
        mode: 'gmail',
        smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
        events: {
          aiReportReady: { enabled: false, delayMinutes: 0 },
          appointmentBooked: { enabled: false, delayMinutes: 0 },
          invoiceGenerated: { enabled: false, delayMinutes: 0 },
        },
      };
    }

    // Never expose password
    const safe = settings.toObject ? settings.toObject() : settings;
    delete safe.smtp.password;

    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateSettings(req, res) {
  const { EmailSettings } = req.tenantModels;

  try {
    const {
      enabled,
      automationEnabled,
      mode,
      smtp,
      fromName,
      fromEmail,
      replyTo,
      events,
    } = req.body;

    // Validate SMTP config
    if (smtp && smtp.user && !smtp.host) {
      return res.status(400).json({
        error: 'SMTP host is required when user is provided',
      });
    }

    let settings = await EmailSettings.findOne({});

    if (!settings) {
      settings = new EmailSettings();
    }

    settings.enabled = enabled !== undefined ? enabled : settings.enabled;
    settings.automationEnabled = automationEnabled !== undefined ? automationEnabled : settings.automationEnabled;
    settings.mode = mode || settings.mode;
    settings.fromName = fromName || settings.fromName;
    settings.fromEmail = fromEmail || settings.fromEmail;
    settings.replyTo = replyTo || settings.replyTo;

    if (smtp) {
      settings.smtp.host = smtp.host || settings.smtp.host;
      settings.smtp.port = smtp.port || settings.smtp.port;
      settings.smtp.secure = smtp.secure !== undefined ? smtp.secure : settings.smtp.secure;
      settings.smtp.user = smtp.user || settings.smtp.user;

      // Handle password: if provided and not empty, encrypt it
      if (smtp.password && smtp.password.trim()) {
        settings.smtp.password = encrypt(smtp.password.trim());
      }
      // If empty string, keep existing password
    }

    if (events) {
      settings.events = { ...settings.events, ...events };
    }

    await settings.save();

    // Invalidate transporter cache
    if (settings._id) {
      invalidateTransporterCache(settings._id.toString());
    }

    // Return safe copy
    const safe = settings.toObject();
    delete safe.smtp.password;

    res.json({ message: 'Settings updated', settings: safe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function testSend(req, res) {
  const { EmailSettings } = req.tenantModels;
  const { to } = req.body;

  if (!to) {
    return res.status(400).json({ error: 'Recipient email (to) is required' });
  }

  try {
    let settings = await EmailSettings.findOne({});

    if (!settings || !settings.enabled || !settings.smtp.user) {
      return res.status(400).json({
        error: 'Email settings not configured or disabled',
      });
    }

    const transporter = getTransporter(settings);

    await transporter.sendMail({
      from: settings.fromEmail || settings.smtp.user,
      to,
      subject: 'Test Email from Dental DMS',
      text: 'This is a test email to verify your SMTP configuration is working correctly.',
    });

    res.json({ message: 'Test email sent successfully', to });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Templates ────────────────────────────────────────────────────────────

export async function getTemplates(req, res) {
  const { EmailTemplate } = req.tenantModels;
  const { event, language } = req.query;

  try {
    const filter = {};
    if (event) filter.event = event;
    if (language) filter.language = language;

    const templates = await EmailTemplate.find(filter).sort({ createdAt: -1 });

    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createTemplate(req, res) {
  const { EmailTemplate } = req.tenantModels;
  const { event, language, subject, body, isActive } = req.body;

  if (!event || !language || !subject || !body) {
    return res.status(400).json({
      error: 'event, language, subject, and body are required',
    });
  }

  try {
    // If creating as active, deactivate other active templates for same event/language
    if (isActive !== false) {
      await EmailTemplate.updateMany(
        { event, language, isActive: true },
        { isActive: false }
      );
    }

    const template = new EmailTemplate({
      event,
      language,
      subject,
      body,
      isActive: isActive !== false,
    });

    await template.save();

    res.status(201).json(template);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateTemplate(req, res) {
  const { EmailTemplate } = req.tenantModels;
  const { id } = req.params;
  const { subject, body, isActive } = req.body;

  try {
    const template = await EmailTemplate.findById(id);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    template.subject = subject || template.subject;
    template.body = body || template.body;

    // If activating, deactivate others for same event/language
    if (isActive && !template.isActive) {
      await EmailTemplate.updateMany(
        {
          event: template.event,
          language: template.language,
          isActive: true,
          _id: { $ne: id },
        },
        { isActive: false }
      );
    }

    if (isActive !== undefined) {
      template.isActive = isActive;
    }

    await template.save();

    res.json(template);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function deleteTemplate(req, res) {
  const { EmailTemplate } = req.tenantModels;
  const { id } = req.params;

  try {
    const template = await EmailTemplate.findByIdAndDelete(id);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ message: 'Template deleted', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Send Report Email ─────────────────────────────────────────────────────

export async function sendReportEmail(req, res) {
  const { EmailSettings, Patient } = req.tenantModels;
  const { patient_id, to, subject, body, report_text, template_name } = req.body;

  if (!patient_id || !to || !report_text) {
    return res.status(400).json({
      error: 'patient_id, to, and report_text are required',
    });
  }

  try {
    let settings = await EmailSettings.findOne({});

    if (!settings || !settings.enabled) {
      return res.status(400).json({ error: 'Email delivery is not enabled' });
    }

    const patient = await Patient.findById(patient_id);
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const doctorName = req.user?.name || 'Attending Doctor';
    const today = new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    // Generate PDF
    const patientName = `${patient.first_name} ${patient.last_name || ''}`.trim();
    const pdfBuffer = await generateReportPdf(report_text, {
      patientName,
      doctorName,
      date: today,
      templateName: template_name || 'Clinical Report',
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `${template_name || 'Report'}_${patientName}_${dateStr}.pdf`;

    // Send email
    const result = await sendEmail({
      tenantModels: req.tenantModels,
      settings,
      to,
      subject: subject || `Your Visit Summary - ${today}`,
      text: body || report_text,
      attachments: [
        {
          filename,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
      patientId: patient_id,
      event: 'manual',
    });

    res.json({
      status: 'sent',
      to,
      messageId: result.messageId,
      filename,
    });
  } catch (err) {
    console.error('[Email] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

// ─── Patient email status (what's available to send) ──────────────────────

export async function getPatientEmailStatus(req, res) {
  const { EmailSettings, Invoice, ReportJob } = req.tenantModels;
  const { patientId } = req.params;

  try {
    const [settings, latestInvoice, latestAiReport] = await Promise.all([
      EmailSettings.findOne({}).lean(),
      Invoice.findOne({ patient_id: patientId }).sort({ createdAt: -1 }).select('invoice_id total_amount status pending_amount createdAt').lean(),
      ReportJob
        ? ReportJob.findOne({ patientId, status: 'done' }).sort({ createdAt: -1 }).select('templateId createdAt').lean()
        : Promise.resolve(null),
    ]);

    res.json({
      emailEnabled: settings?.enabled || false,
      hasSmtp:      !!(settings?.smtp?.user),
      latestInvoice:  latestInvoice  || null,
      latestAiReport: latestAiReport || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Send Treatment Summary (smart report + invoice + AI report) ───────────

export async function sendTreatmentSummary(req, res) {
  const { EmailSettings, Patient, Visit, Invoice, ReportJob } = req.tenantModels;
  const { patient_id, to, include = [] } = req.body;

  if (!patient_id || !to) {
    return res.status(400).json({ error: 'patient_id and to are required' });
  }
  if (!Array.isArray(include) || include.length === 0) {
    return res.status(400).json({ error: 'include must be a non-empty array of: smart_report, invoice, ai_report' });
  }

  try {
    const settings = await EmailSettings.findOne({}).lean();
    if (!settings?.enabled) {
      return res.status(400).json({ error: 'Email delivery is not enabled. Configure SMTP in Settings → Email.' });
    }
    if (!settings?.smtp?.user) {
      return res.status(400).json({ error: 'SMTP credentials not configured. Go to Settings → Email → Connection.' });
    }

    const patient = await Patient.findById(patient_id).lean();
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const patientName = `${patient.first_name} ${patient.last_name || ''}`.trim();
    const doctorName  = req.user?.name || 'Attending Doctor';
    const today   = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const dateStr = new Date().toISOString().slice(0, 10);

    const attachments = [];
    let treatmentNames = [];

    if (include.includes('smart_report')) {
      const visit = await Visit.findOne({ patient_id }).sort({ date: -1 }).lean();
      if (visit) {
        treatmentNames = (visit.treatments || []).map(t => t.treatment_name).filter(Boolean);
        const pdf = await generateVisitSummaryPdf(visit, patientName, doctorName, today);
        attachments.push({ filename: `VisitSummary_${patientName}_${dateStr}.pdf`, content: pdf, contentType: 'application/pdf' });
      }
    }

    if (include.includes('invoice')) {
      const invoice = await Invoice.findOne({ patient_id }).sort({ createdAt: -1 }).lean();
      if (invoice) {
        const pdf = await generateInvoicePdf(invoice, patientName);
        attachments.push({ filename: `Invoice_${invoice.invoice_id}_${patientName}_${dateStr}.pdf`, content: pdf, contentType: 'application/pdf' });
      }
    }

    if (include.includes('ai_report')) {
      const job = ReportJob
        ? await ReportJob.findOne({ patientId: patient_id, status: 'done' }).sort({ createdAt: -1 }).lean()
        : null;
      if (job?.reportText) {
        const pdf = await generateReportPdf(job.reportText, { patientName, doctorName, date: today, templateName: job.templateId || 'Clinical Report' });
        attachments.push({ filename: `AIReport_${patientName}_${dateStr}.pdf`, content: pdf, contentType: 'application/pdf' });
      }
    }

    if (!attachments.length) {
      return res.status(400).json({ error: 'No content found for the selected items. Generate a visit, invoice, or AI report first.' });
    }

    // Build subject + body from the appointmentCompleted template (with variable substitution)
    const templateData = {
      name:        patientName,
      first_name:  patient.first_name,
      doctor:      doctorName,
      date:        today,
      treatments:  treatmentNames.join(', ') || 'your recent treatment',
    };

    const { subject, body } = await buildEmailMessage({
      tenantModels: req.tenantModels,
      eventType: 'appointmentCompleted',
      data: templateData,
      defaultSubject: `Your visit summary — ${today}`,
      defaultBody:    `Dear {{first_name}},\n\nThank you for visiting us. Please find your appointment documents attached.\n\nWarm regards,\n{{doctor}}\n{{clinic}}`,
    });

    const result = await sendEmail({
      tenantModels: req.tenantModels,
      settings,
      to,
      subject,
      text: body,
      attachments,
      patientId: patient_id,
      event: 'appointmentCompleted',
    });

    res.json({ status: 'sent', to, messageId: result.messageId, attachments: attachments.map(a => a.filename) });
  } catch (err) {
    console.error('[Email] sendTreatmentSummary:', err.message);
    res.status(500).json({ error: err.message });
  }
}

// ─── Automation trigger: Appointment Completed ────────────────────────────
// Called internally from appointment controller — never throws to caller.
export async function triggerAppointmentCompleted({ tenantModels, patientId, appointmentId, doctorName }) {
  try {
    const { EmailSettings, Patient, Visit, Invoice, ReportJob } = tenantModels;

    const settings = await EmailSettings.findOne({}).lean();
    if (!settings?.enabled || !settings?.automationEnabled) return;

    const eventCfg = settings?.events?.appointmentCompleted;
    if (!eventCfg?.enabled) return;

    const patient = await Patient.findById(patientId).lean();
    if (!patient?.contact?.email) return;

    const patientName = `${patient.first_name} ${patient.last_name || ''}`.trim();
    const today   = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const dateStr = new Date().toISOString().slice(0, 10);
    const include = eventCfg.include || {};
    const attachments = [];

    if (include.smartReport || include.prescription) {
      const visit = await Visit.findOne({ patient_id: patientId }).sort({ date: -1 }).lean();
      if (visit) {
        const pdf = await generateVisitSummaryPdf(visit, patientName, doctorName || 'Attending Doctor', today);
        attachments.push({ filename: `VisitSummary_${patientName}_${dateStr}.pdf`, content: pdf, contentType: 'application/pdf' });
      }
    }

    if (include.invoice) {
      const invoice = await Invoice.findOne({ patient_id: patientId }).sort({ createdAt: -1 }).lean();
      if (invoice) {
        const pdf = await generateInvoicePdf(invoice, patientName);
        attachments.push({ filename: `Invoice_${invoice.invoice_id}_${patientName}_${dateStr}.pdf`, content: pdf, contentType: 'application/pdf' });
      }
    }

    if (include.aiReport && ReportJob) {
      let job = appointmentId
        ? await ReportJob.findOne({ patientId, appointmentId, status: 'done' }).sort({ createdAt: -1 }).lean()
        : null;
      if (!job) job = await ReportJob.findOne({ patientId, status: 'done' }).sort({ createdAt: -1 }).lean();
      if (job?.reportText) {
        const pdf = await generateReportPdf(job.reportText, { patientName, doctorName: doctorName || 'Attending Doctor', date: today, templateName: job.templateId || 'Clinical Report' });
        attachments.push({ filename: `AIReport_${patientName}_${dateStr}.pdf`, content: pdf, contentType: 'application/pdf' });
      }
    }

    if (!attachments.length) return;

    // Build subject + body from template with variables
    const visit = await (tenantModels.Visit
      ? tenantModels.Visit.findOne({ patient_id: patientId }).sort({ date: -1 }).lean()
      : Promise.resolve(null));
    const treatmentNames = (visit?.treatments || []).map(t => t.treatment_name).filter(Boolean);

    const templateData = {
      name:        patientName,
      first_name:  patient.first_name,
      doctor:      doctorName || 'Attending Doctor',
      date:        today,
      treatments:  treatmentNames.join(', ') || 'your recent treatment',
    };

    const { subject, body } = await buildEmailMessage({
      tenantModels,
      eventType: 'appointmentCompleted',
      data: templateData,
      defaultSubject: `Your appointment summary — ${today}`,
      defaultBody:    `Dear {{first_name}},\n\nThank you for visiting us. Please find your appointment documents attached.\n\nWarm regards,\n{{doctor}}\n{{clinic}}`,
    });

    const delayMs = (eventCfg.delayMinutes || 0) * 60 * 1000;
    if (delayMs > 0) {
      setTimeout(() => _sendCompletionEmail({ tenantModels, settings, patient, patientId, subject, body, attachments }), delayMs);
    } else {
      await _sendCompletionEmail({ tenantModels, settings, patient, patientId, subject, body, attachments });
    }
  } catch (err) {
    console.error('[Email] triggerAppointmentCompleted silenced:', err.message);
  }
}

async function _sendCompletionEmail({ tenantModels, settings, patient, patientId, subject, body, attachments }) {
  await sendEmail({
    tenantModels,
    settings,
    to: patient.contact.email,
    subject,
    text: body,
    attachments,
    patientId,
    event: 'appointmentCompleted',
  });
}

// ─── Shared helpers ────────────────────────────────────────────────────────

async function getSettingsOrNull(tenantModels) {
  try {
    return await tenantModels.EmailSettings.findOne({}).lean();
  } catch {
    return null;
  }
}

async function getClinicVars(tenantModels) {
  const profile = await (tenantModels.ClinicProfile
    ? tenantModels.ClinicProfile.findOne({}).lean()
    : Promise.resolve(null));
  return {
    clinic_name:    profile?.name    || 'Your Dental Clinic',
    clinic_phone:   profile?.phone   || '',
    clinic_address: [profile?.address, profile?.city].filter(Boolean).join(', '),
    logo_url:       profile?.logoUrl || '',
  };
}

function fmtDate(dt) {
  return new Date(dt).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function fmtTime(dt) {
  return new Date(dt).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

async function getDoctorName(tenantModels, doctorId) {
  if (!doctorId || !tenantModels.Doctor) return 'Doctor';
  try {
    const doc = await tenantModels.Doctor.findById(doctorId).select('name').lean();
    return doc?.name || 'Doctor';
  } catch { return 'Doctor'; }
}

// Internal sender — never throws
async function _fireMail(tenantModels, settings, { to, event, patientId, ...tpl }) {
  if (!to || !settings?.enabled || !settings?.smtp?.user) return;
  try {
    await sendEmail({
      tenantModels,
      settings,
      to,
      subject:   tpl.subject,
      html:      tpl.html,
      text:      tpl.text,
      patientId,
      event,
    });
  } catch (err) {
    console.error(`[Email] _fireMail(${event}) silenced:`, err.message);
  }
}

// ─── Booking trigger (called from booking.controller) ──────────────────────
export async function triggerBookingEmails({ tenantModels, patient, appointment, serviceName, clinicName }) {
  try {
    const settings = await getSettingsOrNull(tenantModels);
    if (!settings?.enabled) return;

    const ev = settings.events?.bookingReceived;
    if (!ev?.enabled) return;

    const clinic = await getClinicVars(tenantModels);
    const vars = {
      ...clinic,
      clinic_name:      clinic.clinic_name || clinicName || 'Your Dental Clinic',
      first_name:       patient.first_name,
      patient_name:     `${patient.first_name} ${patient.last_name || ''}`.trim(),
      patient_phone:    patient.contact?.mobile || '',
      service_name:     serviceName || appointment.type || 'Consultation',
      appointment_date: fmtDate(appointment.start_time),
      appointment_time: fmtTime(appointment.start_time),
      doctor_name:      await getDoctorName(tenantModels, appointment.doctor_id),
      notes:            appointment.notes || '',
    };

    const patientEmail = patient.contact?.email;

    // Patient confirmation
    if (patientEmail) {
      const tpl = Templates.bookingRequestReceived(vars);
      await _fireMail(tenantModels, settings, { to: patientEmail, event: 'bookingReceived', patientId: patient._id?.toString(), ...tpl });
    }

    // Clinic alert
    if (ev.notifyClinic) {
      const clinicEmail = ev.clinicEmail || settings.fromEmail || settings.smtp?.user;
      if (clinicEmail) {
        const tpl = Templates.newBookingNotification(vars);
        await _fireMail(tenantModels, settings, { to: clinicEmail, event: 'bookingReceived', ...tpl });
      }
    }
  } catch (err) {
    console.error('[Email] triggerBookingEmails silenced:', err.message);
  }
}

// ─── Booking confirmed by staff ─────────────────────────────────────────────
export async function triggerBookingConfirmed({ tenantModels, patient, appointment, serviceName }) {
  try {
    const settings = await getSettingsOrNull(tenantModels);
    if (!settings?.enabled || !settings?.events?.bookingConfirmed?.enabled) return;

    const patientEmail = patient?.contact?.email;
    if (!patientEmail) return;

    const clinic = await getClinicVars(tenantModels);
    const vars = {
      ...clinic,
      first_name:       patient.first_name,
      service_name:     serviceName || appointment.type || 'Consultation',
      appointment_date: fmtDate(appointment.start_time),
      appointment_time: fmtTime(appointment.start_time),
      doctor_name:      await getDoctorName(tenantModels, appointment.doctor_id),
    };

    const tpl = Templates.appointmentConfirmed(vars);
    await _fireMail(tenantModels, settings, { to: patientEmail, event: 'bookingConfirmed', patientId: patient._id?.toString(), ...tpl });
  } catch (err) {
    console.error('[Email] triggerBookingConfirmed silenced:', err.message);
  }
}

// ─── Appointment rescheduled ────────────────────────────────────────────────
export async function triggerAppointmentRescheduled({ tenantModels, patient, appointment }) {
  try {
    const settings = await getSettingsOrNull(tenantModels);
    if (!settings?.enabled || !settings?.events?.appointmentRescheduled?.enabled) return;

    const patientEmail = patient?.contact?.email;
    if (!patientEmail) return;

    const clinic = await getClinicVars(tenantModels);
    const vars = {
      ...clinic,
      first_name:       patient.first_name,
      appointment_date: fmtDate(appointment.start_time),
      appointment_time: fmtTime(appointment.start_time),
      doctor_name:      await getDoctorName(tenantModels, appointment.doctor_id),
    };

    const tpl = Templates.appointmentRescheduled(vars);
    await _fireMail(tenantModels, settings, { to: patientEmail, event: 'appointmentRescheduled', patientId: patient._id?.toString(), ...tpl });
  } catch (err) {
    console.error('[Email] triggerAppointmentRescheduled silenced:', err.message);
  }
}

// ─── Appointment cancelled ──────────────────────────────────────────────────
export async function triggerAppointmentCancelled({ tenantModels, patient, appointment }) {
  try {
    const settings = await getSettingsOrNull(tenantModels);
    if (!settings?.enabled || !settings?.events?.appointmentCancelled?.enabled) return;

    const patientEmail = patient?.contact?.email;
    if (!patientEmail) return;

    const clinic = await getClinicVars(tenantModels);
    const vars = {
      ...clinic,
      first_name:       patient.first_name,
      appointment_date: fmtDate(appointment.start_time),
      appointment_time: fmtTime(appointment.start_time),
    };

    const tpl = Templates.appointmentCancelled(vars);
    await _fireMail(tenantModels, settings, { to: patientEmail, event: 'appointmentCancelled', patientId: patient._id?.toString(), ...tpl });
  } catch (err) {
    console.error('[Email] triggerAppointmentCancelled silenced:', err.message);
  }
}

// ─── Invoice paid receipt ───────────────────────────────────────────────────
export async function triggerInvoicePaid({ tenantModels, patient, invoice }) {
  try {
    const settings = await getSettingsOrNull(tenantModels);
    if (!settings?.enabled || !settings?.events?.invoicePaid?.enabled) return;

    const patientEmail = patient?.contact?.email;
    if (!patientEmail) return;

    const clinic = await getClinicVars(tenantModels);
    const vars = {
      ...clinic,
      first_name:   patient.first_name,
      invoice_id:   invoice.invoice_id,
      amount:       invoice.paid_amount || invoice.total_amount,
      outstanding:  invoice.pending_amount > 0 ? invoice.pending_amount : '',
      invoice_date: fmtDate(invoice.updatedAt || invoice.createdAt),
    };

    const tpl = Templates.invoiceReceipt(vars);

    // Optionally attach invoice PDF
    let attachments = [];
    if (settings.events.invoicePaid.attachInvoice) {
      try {
        const patientName = `${patient.first_name} ${patient.last_name || ''}`.trim();
        const dateStr = new Date().toISOString().slice(0, 10);
        const pdf = await generateInvoicePdf(invoice, patientName);
        attachments = [{ filename: `Invoice_${invoice.invoice_id}_${dateStr}.pdf`, content: pdf, contentType: 'application/pdf' }];
      } catch (pdfErr) {
        console.error('[Email] Invoice PDF generation failed:', pdfErr.message);
      }
    }

    await sendEmail({
      tenantModels, settings,
      to: patientEmail, subject: tpl.subject, html: tpl.html, text: tpl.text,
      attachments,
      patientId: patient._id?.toString(),
      event: 'invoicePaid',
    });
  } catch (err) {
    console.error('[Email] triggerInvoicePaid silenced:', err.message);
  }
}

// ─── Low stock alert ────────────────────────────────────────────────────────
export async function triggerLowStockAlert({ tenantModels, item }) {
  try {
    const settings = await getSettingsOrNull(tenantModels);
    if (!settings?.enabled) return;

    const alertEmail = settings.events?.bookingReceived?.clinicEmail || settings.fromEmail || settings.smtp?.user;
    if (!alertEmail) return;

    const clinic = await getClinicVars(tenantModels);
    const vars = {
      ...clinic,
      item_name:    item.name,
      current_stock: String(item.stock_on_hand),
      min_stock:    String(item.min_stock_level),
      stock_status: item.status || 'Low',
    };

    const tpl = Templates.lowStockAlert(vars);
    await _fireMail(tenantModels, settings, { to: alertEmail, event: 'lowStockAlert', ...tpl });
  } catch (err) {
    console.error('[Email] triggerLowStockAlert silenced:', err.message);
  }
}

// ─── Lab order ready ────────────────────────────────────────────────────────
export async function triggerLabOrderReady({ tenantModels, patient, labOrder, doctorEmail, doctorName }) {
  try {
    const settings = await getSettingsOrNull(tenantModels);
    if (!settings?.enabled) return;

    const to = doctorEmail;
    if (!to) return;

    const clinic = await getClinicVars(tenantModels);
    const itemNames = (labOrder.items || []).map(i => i.item_name).join(', ');
    const vars = {
      ...clinic,
      doctor_name:   doctorName || 'Doctor',
      patient_name:  patient ? `${patient.first_name} ${patient.last_name || ''}`.trim() : 'Patient',
      lab_name:      labOrder.vendor || '',
      items:         itemNames,
      received_date: fmtDate(new Date()),
    };

    const tpl = Templates.labOrderReady(vars);
    await _fireMail(tenantModels, settings, { to, event: 'labOrderReady', ...tpl });
  } catch (err) {
    console.error('[Email] triggerLabOrderReady silenced:', err.message);
  }
}

// ─── Logs ──────────────────────────────────────────────────────────────────

export async function getLogs(req, res) {
  const { EmailLog } = req.tenantModels;
  const { event, status, dateFrom, dateTo } = req.query;

  try {
    const filter = {};

    if (event) filter.event = event;
    if (status) filter.status = status;

    if (dateFrom || dateTo) {
      filter.sentAt = {};
      if (dateFrom) {
        filter.sentAt.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        filter.sentAt.$lte = new Date(dateTo);
      }
    }

    const logs = await EmailLog.find(filter)
      .sort({ sentAt: -1 })
      .limit(200)
      .populate('patientId', 'first_name last_name patientId');

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

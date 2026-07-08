import {
  uploadFileToDrive,
  updateFileInDrive,
  createPatientDriveFolders,
  createSubfolder,
} from '../services/googleDrive.service.js';
import { TEMPLATES, getTemplateById } from '../config/templates.config.js';
import { buildSingleDocPdf } from '../services/documentPdf.service.js';
import { debit as debitCredits } from '../services/credits.service.js';

// ─── Emoji stripping ───────────────────────────────────────────────────────────
// PDFKit's standard fonts can't render emoji/pictographs, so they corrupt the
// output. Remove them (and tidy the whitespace they leave behind) from any text
// that may reach the PDF or be saved.
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{200D}\u{20E3}\u{2122}\u{2139}]/gu;

function stripEmojis(text) {
  if (!text) return text;
  return text
    .replace(EMOJI_RE, '')
    .replace(/[ \t]{2,}/g, ' ')   // collapse double spaces left behind
    .replace(/ +$/gm, '');         // trim trailing spaces per line
}

// ─── Structured error classification ───────────────────────────────────────────
function classifyError(err, source) {
  const raw = err?.message || String(err);

  if (source === 'sarvam') {
    if (/401|403|Unauthorized|Forbidden|api.subscription.key/i.test(raw))
      return { source, code: 'auth',       userMessage: 'Transcription failed — invalid API key.',              detail: raw };
    if (/429|rate.limit|quota/i.test(raw))
      return { source, code: 'rate_limit', userMessage: 'Transcription failed — rate limit reached. Try again shortly.', detail: raw };
    if (/timed out|timeout|10 min/i.test(raw))
      return { source, code: 'timeout',    userMessage: 'Transcription timed out — the audio may be too long.',  detail: raw };
    if (/empty|no transcript/i.test(raw))
      return { source, code: 'empty',      userMessage: 'Transcription returned no text. Check audio quality and try again.', detail: raw };
    if (/5\d\d|server error/i.test(raw))
      return { source, code: 'server',     userMessage: 'Transcription service is temporarily unavailable. Try again later.', detail: raw };
    return { source, code: 'unknown',      userMessage: 'Transcription service error. Please try again.',       detail: raw };
  }


  return { source: 'unknown', code: 'unknown', userMessage: raw, detail: raw };
}

// Serialize a classified error for SSE / job storage transport.
function serializeError(classified) {
  return JSON.stringify(classified);
}

// ─── LLM: Generate a single document (non-streaming) ──────────────────────────
async function generateFromTemplate(apiKey, transcript, patientName, patientGender, doctorName, date, template, detailLevel) {
  if (!apiKey) throw new Error('Sarvam API Key not configured for this tenant.');

  const salutation = patientGender === 'Female' ? 'Ms' : patientGender === 'Male' ? 'Mr' : 'Mx';

  const detailInstructions = {
    brief:    'Respond concisely. Use short paragraphs. Omit anything not critical. Target approximately 200 words.',
    standard: 'Follow the structure as given. Use normal paragraph length and include all relevant details from the dictation.',
    detailed: 'Expand each section thoroughly. Include clinical reasoning and context where appropriate. Target 600 or more words.',
  };

  const systemPrompt = `IMPORTANT: Write your entire response EXCLUSIVELY in English. Do not write in Hindi, Hinglish, or any other language.
IMPORTANT: Do NOT use any emojis, emoticons, or pictographic symbols anywhere in the response. Use plain text only.

${template.systemInstruction}

Detail level instructions:
${detailInstructions[detailLevel] || detailInstructions.standard}
The current detail level is: ${detailLevel}

STRUCTURE TO FOLLOW:
${template.structure}`;

  const userPrompt = `Patient: ${patientName} (${salutation})
Doctor: ${doctorName}
Date: ${date}

DICTATION:
"""
${transcript}
"""

Generate the document now following the structure and detail level above. Return plain text only — no JSON, no markdown code blocks.`;

  const res = await fetch('https://api.sarvam.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sarvam-105b',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
      max_tokens:  4096,
      temperature: 0.3,
      top_p:       1.0,
    }),
  });

  if (!res.ok) throw new Error(`LLM API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return stripEmojis(data.choices?.[0]?.message?.content?.trim() || '');
}

// ─── LLM: Stream response to frontend via SSE ─────────────────────────────────
async function streamFromTemplate(apiKey, transcript, patientName, patientGender, doctorName, date, template, detailLevel, res) {
  if (!apiKey) throw new Error('Sarvam API Key not configured for this tenant.');

  const salutation = patientGender === 'Female' ? 'Ms' : patientGender === 'Male' ? 'Mr' : 'Mx';

  const detailInstructions = {
    brief:    'Respond concisely. Use short paragraphs. Omit anything not critical. Target approximately 200 words.',
    standard: 'Follow the structure as given. Use normal paragraph length and include all relevant details from the dictation.',
    detailed: 'Expand each section thoroughly. Include clinical reasoning and context where appropriate. Target 600 or more words.',
  };

  const systemPrompt = `IMPORTANT: Write your entire response EXCLUSIVELY in English. Do not write in Hindi, Hinglish, or any other language.
IMPORTANT: Do NOT use any emojis, emoticons, or pictographic symbols anywhere in the response. Use plain text only.

${template.systemInstruction}

Detail level instructions:
${detailInstructions[detailLevel] || detailInstructions.standard}
The current detail level is: ${detailLevel}

STRUCTURE TO FOLLOW:
${template.structure}`;

  const userPrompt = `Patient: ${patientName} (${salutation})
Doctor: ${doctorName}
Date: ${date}

DICTATION:
"""
${transcript}
"""

Generate the document now following the structure and detail level above. Return plain text only — no JSON, no markdown code blocks.`;

  const upstream = await fetch('https://api.sarvam.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sarvam-105b',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
      max_tokens:  4096,
      temperature: 0.3,
      top_p:       1.0,
      stream:      true,
    }),
  });

  if (!upstream.ok) throw new Error(`LLM API error ${upstream.status}: ${await upstream.text()}`);

  // Pipe SSE tokens to client
  let fullText = '';
  const decoder = new TextDecoder();
  for await (const chunk of upstream.body) {
    const text = decoder.decode(chunk, { stream: true });
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (!trimmed.startsWith('data: ')) continue;
      try {
        const parsed = JSON.parse(trimmed.slice(6));
        const token = parsed.choices?.[0]?.delta?.content || '';
        if (token) {
          fullText += token;
          // Best-effort strip for the live stream; the returned fullText below is
          // stripped authoritatively (handles emoji split across token boundaries).
          const cleanToken = stripEmojis(token);
          if (cleanToken) res.write(`data: ${JSON.stringify({ token: cleanToken })}\n\n`);
        }
      } catch { /* skip malformed SSE lines */ }
    }
  }
  return stripEmojis(fullText);
}

// ─── LLM: Structured autofill extraction ──────────────────────────────────────
async function parseAutofillWithLLM(apiKey, transcript) {
  if (!apiKey) return null;

  const systemPrompt = `Extract structured clinical data from a dental consultation transcript. Return ONLY valid JSON. Write all text in English only.`;

  const userPrompt = `Extract from this transcript:
"""
${transcript}
"""

Return JSON:
{
  "chief_complaint": "string",
  "medical_history": ["string"],
  "dental_history": "string",
  "treatment_plan": [ { "tooth_numbers": [], "clinical_findings": "", "diagnosis": "", "suggested_treatment": "", "estimated_price": 0 } ],
  "consultation_note": "HTML summarizing visit",
  "advice": "HTML combined advice",
  "medications": [ { "drug_name": "", "dosage": "", "duration": "", "instructions": "" } ],
  "recall": { "days_later": 0, "notes": "" }
}`;

  const res = await fetch('https://api.sarvam.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sarvam-105b',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
      max_tokens:  4096,
      temperature: 0.1,
      top_p:       1.0,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return JSON.parse(data.choices?.[0]?.message?.content || '{}');
}

// ─── Resolve the visit to pair the report file with ────────────────────────────
// Prefer the visit linked to the job's appointment; otherwise fall back to the
// patient's visit dated today (creating one if none exists), matching how
// uploaded documents and notes/advice attach to a visit. Returns the visit _id
// or null if it can't be resolved (the file still saves, just unpaired).
async function resolveReportVisitId(models, { patientId, appointmentId }) {
  const { Visit, Patient } = models;
  try {
    if (appointmentId) {
      const apptVisit = await Visit.findOne({ appointment_id: appointmentId }).select('_id');
      if (apptVisit) return apptVisit._id;
    }
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay   = new Date(); endOfDay.setHours(23, 59, 59, 999);
    let visit = await Visit.findOne({
      patient_id: patientId,
      date: { $gte: startOfDay, $lte: endOfDay },
    }).sort({ date: -1 }).select('_id');
    if (!visit) {
      visit = await Visit.create({ patient_id: patientId, appointment_id: appointmentId || undefined, date: new Date() });
      await Patient.findByIdAndUpdate(patientId, { last_visit_date: new Date() });
    }
    return visit._id;
  } catch (err) {
    console.warn('[Report] resolveReportVisitId failed:', err.message);
    return null;
  }
}

// Resolve the Doctor record affiliated with this report's visit/appointment.
// The report's signing doctor must be the treating doctor on the visit — NOT
// the logged-in user (who may be a receptionist/assistant). Resolution order:
//   1. visit.doctor_id  (the visit's treating doctor)
//   2. the doctor on the visit's appointment
//   3. fallback: { name: fallbackName } using the logged-in user's name
async function resolveReportDoctor(models, { patientId, appointmentId, fallbackName }) {
  const { Visit, Doctor, Appointment } = models;
  const fallback = { name: fallbackName || 'Attending Doctor' };
  if (!Doctor) return fallback;
  try {
    let doctorId = null;

    // Find the visit (by appointment, else most recent today) to read its doctor.
    let visit = null;
    if (appointmentId) {
      visit = await Visit.findOne({ appointment_id: appointmentId }).select('doctor_id appointment_id');
    }
    if (!visit) {
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay   = new Date(); endOfDay.setHours(23, 59, 59, 999);
      visit = await Visit.findOne({
        patient_id: patientId,
        date: { $gte: startOfDay, $lte: endOfDay },
      }).sort({ date: -1 }).select('doctor_id appointment_id');
    }
    if (visit?.doctor_id) doctorId = visit.doctor_id;

    // Fall back to the doctor on the visit's (or report's) appointment.
    if (!doctorId && Appointment) {
      const apptId = appointmentId || visit?.appointment_id;
      if (apptId) {
        const appt = await Appointment.findById(apptId).select('doctor_id');
        if (appt?.doctor_id) doctorId = appt.doctor_id;
      }
    }

    if (doctorId) {
      const doctor = await Doctor.findById(doctorId).lean().catch(() => null);
      if (doctor) return doctor;
    }
    return fallback;
  } catch (err) {
    console.warn('[Report] resolveReportDoctor failed:', err.message);
    return fallback;
  }
}

// ─── Upload report text to Drive ────────────────────────────────────────────────
async function uploadTextToDrive(credentials, folderId, text, filename) {
  const buffer = Buffer.from(text, 'utf-8');
  return uploadFileToDrive(credentials, folderId, buffer, filename, 'text/plain');
}

// ─── GET /api/report/templates ──────────────────────────────────────────────────
export function listTemplates(req, res) {
  const summary = TEMPLATES.map(({ id, name, description, type, category, specialty }) => ({
    id, name, description, type, category, specialty,
  }));
  res.json(summary);
}

// ─── POST /api/report/transcribe ───────────────────────────────────────────────
// Creates a ReportJob from a finalized transcript. Audio is transcribed live over
// the WebSocket relay (/api/report/stream); by the time this is called the client
// already holds the full transcript text. The typed "Quick Notes" path also lands
// here with transcript_text and no audio_duration_seconds.
// Returns { jobId, status:'transcribed' }.
export async function transcribeAudio(req, res) {
  const { Patient, ReportJob, Visit } = req.tenantModels;

  try {
    const { patient_id, template_id, detail_level, save_report, autofill, appointment_id, audio_duration_seconds } = req.body;
    if (!patient_id)  return res.status(400).json({ error: 'patient_id is required' });
    if (!template_id) return res.status(400).json({ error: 'template_id is required' });

    const template = getTemplateById(template_id);
    if (!template) return res.status(400).json({ error: `Unknown template_id: ${template_id}` });

    const transcript = (req.body.transcript_text || '').trim();
    if (!transcript) return res.status(400).json({ error: 'transcript_text is required' });

    const patient = await Patient.findById(patient_id);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const patientName = `${patient.first_name} ${patient.last_name || ''}`.trim();
    const durationSeconds = Math.max(0, Math.round(Number(audio_duration_seconds) || 0));

    // ── Credit debit ── charged here, at transcription, per second of dictation
    // (1 credit = 60s). Typed "Quick Notes" sends no duration → free. Generation
    // is not billed again (job.creditDebited guards it).
    let creditDebited = false;
    if (durationSeconds > 0) {
      const ok = await debitCredits(req.user.tenantId, durationSeconds, {
        patientId: patient._id, patientName, durationSeconds,
        stage: 'transcription', createdBy: req.user?.name,
      });
      if (!ok) {
        return res.status(402).json({
          error: 'insufficient_credits',
          message: 'Your clinic has run out of AI report credits. Please contact your administrator.',
        });
      }
      creditDebited = true;
    }

    // Resolve (or create) THIS report's visit up front so the ReportJob is linked
    // to a visit_id from creation — same anchor invoices/files use. Prefers the
    // appointment's visit, else today's, else creates one.
    const reportVisitId = await resolveReportVisitId(req.tenantModels, {
      patientId: patient._id, appointmentId: appointment_id || null,
    });

    // Cache the transcript on that visit for reuse.
    if (reportVisitId) {
      await Visit.findByIdAndUpdate(reportVisitId, { ai_transcript: transcript });
    }

    const job = await ReportJob.create({
      patientId:     patient._id,
      appointmentId: appointment_id || null,
      visitId:       reportVisitId || null,
      status:        'transcribed',
      transcript,
      templateId:    template_id,
      detailLevel:   detail_level || 'standard',
      saveReport:    save_report !== 'false',
      runAutofill:   autofill === 'true',
      audioDurationSeconds: durationSeconds,
      creditDebited, // already charged at transcription → generate is free
      createdBy:     req.user?.name || 'unknown',
    });

    return res.json({ jobId: job._id, status: 'transcribed', transcript });
  } catch (err) {
    console.error('[Report] transcribeAudio error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

// ─── GET /api/report/jobs/:jobId ────────────────────────────────────────────────
export async function getJobStatus(req, res) {
  const { ReportJob } = req.tenantModels;
  try {
    const job = await ReportJob.findById(req.params.jobId).select('-audioBuffer');
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({
      jobId:      job._id,
      status:     job.status,
      transcript: job.transcript || '',
      errorMessage: job.errorMessage || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ─── GET /api/report/latest?patientId=&appointmentId= ──────────────────────────
// Returns the most recent completed AI report for a patient (optionally scoped to
// an appointment). Used by the unified Documents modal to attach the AI report.
export async function getLatestReport(req, res) {
  const { ReportJob } = req.tenantModels;
  try {
    const { patientId, appointmentId, date } = req.query;
    if (!patientId) return res.status(400).json({ error: 'patientId is required' });

    const filter = { patientId, status: 'done', reportText: { $nin: [null, ''] } };
    if (appointmentId) {
      // Strictly scoped to the appointment — no fallback, so the Documents modal
      // never shows another visit's report.
      filter.appointmentId = appointmentId;
    } else if (date) {
      // No appointment (e.g. walk-in visit): scope to reports created on the
      // visit's own day so we still only return THIS visit's report.
      const d = new Date(date);
      if (!isNaN(d)) {
        const start = new Date(d); start.setHours(0, 0, 0, 0);
        const end   = new Date(d); end.setHours(23, 59, 59, 999);
        filter.createdAt = { $gte: start, $lte: end };
      }
    }

    const job = await ReportJob.findOne(filter).sort({ createdAt: -1 })
      .select('reportText templateId createdAt driveFileIds').lean();

    if (!job) return res.json({ report: null });
    const templateName = getTemplateById(job.templateId)?.name || 'Clinical Report';
    // driveFileIds ({templateId -> drive_file_id}) lets the Documents modal drop
    // the AI report's own uploaded file from the "uploaded files" list so the
    // report isn't shown twice (once as "AI Clinical Report", once as a file).
    res.json({ report: { _id: job._id, templateId: job.templateId, templateName, reportText: job.reportText, createdAt: job.createdAt, driveFileIds: job.driveFileIds || {} } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ─── PATCH /api/report/jobs/:jobId/transcript ──────────────────────────────────
// Allow user to edit/review transcript before proceeding to generation
export async function editTranscript(req, res) {
  const { ReportJob } = req.tenantModels;
  try {
    const { jobId } = req.params;
    const { transcript } = req.body;

    if (!transcript || typeof transcript !== 'string') {
      return res.status(400).json({ error: 'transcript (string) is required' });
    }

    const job = await ReportJob.findById(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Allow editing only if job is in transcribed state (before generation)
    if (job.status !== 'transcribed') {
      return res.status(400).json({
        error: `Cannot edit transcript in status: ${job.status}. Job must be in 'transcribed' state.`,
      });
    }

    // Update transcript
    await ReportJob.findByIdAndUpdate(jobId, { transcript: transcript.trim() });

    res.json({
      jobId,
      status: 'transcribed',
      transcript: transcript.trim(),
      message: 'Transcript updated successfully. Ready for report generation.',
    });
  } catch (err) {
    console.error('[Report] editTranscript error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

// ─── POST /api/report/generate ─────────────────────────────────────────────────
// Accepts { jobId, template_id OR template_ids, detail_level, save_report, autofill }
// OR legacy { patient_id, template_id, transcript_text, ... } for backwards compat.
// Streams the LLM response via SSE.
// Supports single template (backward compat) or multiple templates (sequential generation)
export async function generateReport(req, res) {
  const { Patient, ReportJob } = req.tenantModels;
  const credentials = req.tenantConfig;

  try {
    const jobId = req.body.jobId;

    // ── New job-queue path ──
    if (jobId) {
      const job = await ReportJob.findById(jobId);
      if (!job) return res.status(404).json({ error: 'Job not found' });
      // Allow generation from 'transcribed' (first run) or 'done' (regenerate —
      // user wasn't satisfied and is re-running with the same/edited transcript).
      if (job.status !== 'transcribed' && job.status !== 'done') {
        return res.status(400).json({ error: `Job is not ready for generation (status: ${job.status})` });
      }

      // Allow transcript override (edit-and-regenerate)
      const transcriptOverride = (req.body.transcript || '').trim();
      const transcript = transcriptOverride || job.transcript;
      if (!transcript) return res.status(422).json({ error: 'Transcript is empty.' });

      // Support both single template_id and multiple template_ids
      const detailLevel = req.body.detail_level  || job.detailLevel;
      const saveReport  = req.body.save_report !== undefined ? req.body.save_report !== 'false' : job.saveReport;
      const runAutofill = req.body.autofill !== undefined ? req.body.autofill === 'true' : job.runAutofill;

      const templateIds = req.body.template_ids || (req.body.template_id ? [req.body.template_id] : [job.templateId]);
      if (!Array.isArray(templateIds) || templateIds.length === 0) {
        return res.status(400).json({ error: 'template_id or template_ids required' });
      }

      // Validate all templates exist
      const templates = [];
      for (const tId of templateIds) {
        const tpl = getTemplateById(tId);
        if (!tpl) return res.status(400).json({ error: `Unknown template_id: ${tId}` });
        templates.push(tpl);
      }

      const patient = await Patient.findById(job.patientId);
      if (!patient) return res.status(404).json({ error: 'Patient not found' });

      const patientName = `${patient.first_name} ${patient.last_name || ''}`.trim();
      // Use the treating doctor affiliated with the visit/appointment — not the
      // logged-in user (who may be a receptionist/assistant).
      const reportDoctor = await resolveReportDoctor(req.tenantModels, {
        patientId: job.patientId, appointmentId: job.appointmentId, fallbackName: req.user?.name,
      });
      const doctorName  = reportDoctor.name || 'Attending Doctor';
      const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

      // Credits are debited earlier, at transcription time (see transcribeAudio).
      // Generation — including regeneration — is free.

      await ReportJob.findByIdAndUpdate(jobId, { status: 'generating' });

      // Set up SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      // Generate reports sequentially for each template
      const reports = {};
      for (const template of templates) {
        try {
          res.write(`data: ${JSON.stringify({ progress: `Generating ${template.name}...` })}\n\n`);
          const reportText = await streamFromTemplate(
            credentials.sarvamApiKey, transcript, patientName, patient.gender,
            doctorName, today, template, detailLevel, res,
          );
          reports[template.id] = reportText;
          res.write(`data: ${JSON.stringify({ completed: template.id })}\n\n`);
        } catch (err) {
          const classified = classifyError(err, 'sarvam');
          res.write(`data: ${JSON.stringify({ error: serializeError(classified) })}\n\n`);
          await ReportJob.findByIdAndUpdate(jobId, { status: 'failed', errorMessage: serializeError(classified) });
          res.end();
          return;
        }
      }

      // Visit to pair the report file(s) with (same way uploaded docs attach).
      // Prefer the visit already linked to the job at transcription time; only
      // resolve as a fallback for legacy jobs created before visitId was stored.
      const reportVisitId = job.visitId || await resolveReportVisitId(req.tenantModels, {
        patientId: job.patientId, appointmentId: job.appointmentId,
      });

      // Autofill (once, parallel with Drive save)
      let autofill_v2 = null;
      const drive_links = {};
      const fileRecords = [];                            // NEW files to add to patient.files[]
      const drive_file_ids = { ...(job.driveFileIds || {}) }; // template.id -> drive_file_id (carried across regenerations)

      const [autofillResult, driveResult] = await Promise.allSettled([
        runAutofill ? parseAutofillWithLLM(credentials.sarvamApiKey, transcript) : Promise.resolve(null),
        (async () => {
          if (!saveReport) return;
          if (!patient.drive_folders?.root) {
            patient.drive_folders = await createPatientDriveFolders(credentials, patient.patientId, patientName);
            await patient.save();
          }
          const clinicalNotesFolderId = patient.drive_folders.clinical_notes;
          if (!clinicalNotesFolderId) return;
          const dateFolderName = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
          const dateFolderId   = await createSubfolder(credentials, clinicalNotesFolderId, dateFolderName);
          const dateStr  = new Date().toISOString().slice(0, 10);

          // Fetch delivery settings for PDF branding
          const ds = await fetchDeliverySettings(req.tenantModels);
          const pdfEnabled = ds.pdf?.enabled ?? false;

          // Upload each report to Drive — sign with the visit's treating doctor
          const driveDoctor = reportDoctor;
          for (const template of templates) {
            const reportText = reports[template.id];
            if (!reportText) continue;

            const mimeType = pdfEnabled ? 'application/pdf' : 'text/plain';
            const filename = `${template.name}_${patientName}_${dateStr}.${pdfEnabled ? 'pdf' : 'txt'}`;
            const buffer = pdfEnabled
              ? await buildSingleDocPdf(req.tenantModels, {
                  type: 'report', reportText,
                  patient: { first_name: patientName },
                  doctor: driveDoctor,
                  reportTemplateName: template.name,
                })
              : Buffer.from(reportText, 'utf-8');

            // Regenerate → overwrite the existing Drive file in place (same id/link,
            // no duplicate). First run → create a new file.
            const existingFileId = job.driveFileIds?.[template.id];
            let uploaded;
            if (existingFileId) {
              try {
                uploaded = await updateFileInDrive(credentials, existingFileId, buffer, filename, mimeType);
              } catch (err) {
                // File was moved/deleted in Drive — fall back to creating a fresh one.
                console.warn(`[Report] overwrite failed for ${existingFileId}, creating new:`, err.message);
                uploaded = await uploadFileToDrive(credentials, dateFolderId, buffer, filename, mimeType);
              }
            } else {
              uploaded = await uploadFileToDrive(credentials, dateFolderId, buffer, filename, mimeType);
            }

            if (uploaded) {
              drive_links[template.id]    = uploaded.webViewLink;
              drive_file_ids[template.id] = uploaded.id;
              // Only register a NEW patient.files[] record on first creation;
              // overwrites reuse the existing id, so don't duplicate the record.
              if (!existingFileId) {
                fileRecords.push({
                  file_name:     uploaded.name,
                  category:      'Clinical Notes',
                  drive_file_id: uploaded.id,
                  web_view_link: uploaded.webViewLink,
                  mime_type:     mimeType,
                  ...(reportVisitId ? { visit_id: reportVisitId } : {}),
                  ...(job.appointmentId ? { appointment_id: job.appointmentId } : {}),
                });
              }
            }
          }
        })(),
      ]);

      if (autofillResult.status === 'fulfilled') autofill_v2 = autofillResult.value;
      if (fileRecords.length > 0) {
        patient.files.push(...fileRecords);
        await patient.save();
      }

      await ReportJob.findByIdAndUpdate(jobId, {
        status: 'done', reportText: reports[templateIds[0]], driveLinks: drive_links,
        driveFileIds: drive_file_ids,
        autofillData: autofill_v2, transcript,
      });

      // Send final metadata event
      res.write(`data: ${JSON.stringify({
        done: true,
        jobId, transcript,
        reports,
        drive_links,
        autofill_v2,
      })}\n\n`);
      res.end();
      return;
    }

    // ── Legacy path: direct transcript_text (no jobId) ──
    const { patient_id, template_id, template_ids, detail_level, save_report, autofill, transcript_text, appointment_id, audio_duration_seconds } = req.body;
    if (!patient_id)  return res.status(400).json({ error: 'patient_id required' });

    const templateIds = template_ids || (template_id ? [template_id] : []);
    if (templateIds.length === 0) {
      return res.status(400).json({ error: 'template_id or template_ids required' });
    }

    const transcript = (transcript_text || '').trim();
    if (!transcript) return res.status(400).json({ error: 'transcript_text is required' });

    // Validate all templates exist
    const templates = [];
    for (const tId of templateIds) {
      const tpl = getTemplateById(tId);
      if (!tpl) return res.status(400).json({ error: `Unknown template_id: ${tId}` });
      templates.push(tpl);
    }

    const patient = await Patient.findById(patient_id);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const patientName = `${patient.first_name} ${patient.last_name || ''}`.trim();
    // Sign the report with the visit's treating doctor, not the logged-in user.
    const reportDoctor = await resolveReportDoctor(req.tenantModels, {
      patientId: patient_id, appointmentId: appointment_id, fallbackName: req.user?.name,
    });
    const doctorName  = reportDoctor.name || 'Attending Doctor';
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const detailLevel = detail_level || 'standard';
    const saveRep     = save_report !== 'false';
    const runAuto     = autofill === 'true';

    // Credits are debited at transcription (see transcribeAudio). This legacy
    // direct-transcript path (typed Quick Notes) carries no audio duration and is
    // not billed here — generation is free.

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Generate reports sequentially for each template
    const reports = {};
    for (const template of templates) {
      try {
        res.write(`data: ${JSON.stringify({ progress: `Generating ${template.name}...` })}\n\n`);
        const reportText = await streamFromTemplate(credentials.sarvamApiKey, transcript, patientName, patient.gender, doctorName, today, template, detailLevel, res);
        reports[template.id] = reportText;
        res.write(`data: ${JSON.stringify({ completed: template.id })}\n\n`);
      } catch (err) {
        const classified = classifyError(err, 'sarvam');
        res.write(`data: ${JSON.stringify({ error: serializeError(classified) })}\n\n`);
        res.end();
        return;
      }
    }

    let autofill_v2 = null;
    const drive_links = {};
    const fileRecords = [];

    const [afResult, drResult] = await Promise.allSettled([
      runAuto ? parseAutofillWithLLM(credentials.sarvamApiKey, transcript) : Promise.resolve(null),
      (async () => {
        if (!saveRep) return;
        if (!patient.drive_folders?.root) {
          patient.drive_folders = await createPatientDriveFolders(credentials, patient.patientId, patientName);
          await patient.save();
        }
        const clinicalNotesFolderId = patient.drive_folders.clinical_notes;
        if (!clinicalNotesFolderId) return;
        const dateFolderName = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
        const dateFolderId   = await createSubfolder(credentials, clinicalNotesFolderId, dateFolderName);
        const dateStr  = new Date().toISOString().slice(0, 10);

        // Upload each report to Drive
        for (const template of templates) {
          const reportText = reports[template.id];
          if (!reportText) continue;
          const filename = `${template.name}_${patientName}_${dateStr}.txt`;
          const uploaded = await uploadTextToDrive(credentials, dateFolderId, reportText, filename);
          if (uploaded) {
            drive_links[template.id] = uploaded.webViewLink;
            fileRecords.push({
              file_name: uploaded.name, category: 'Clinical Notes',
              drive_file_id: uploaded.id, web_view_link: uploaded.webViewLink, mime_type: 'text/plain',
            });
          }
        }
      })(),
    ]);

    if (afResult.status === 'fulfilled') autofill_v2 = afResult.value;
    if (fileRecords.length > 0) { patient.files.push(...fileRecords); await patient.save(); }

    res.write(`data: ${JSON.stringify({
      done: true, transcript,
      reports, drive_links, autofill_v2,
    })}\n\n`);
    res.end();

  } catch (err) {
    console.error('[Report] Error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
}

// ─── Delivery settings helper ──────────────────────────────────────────────────
async function fetchDeliverySettings(tenantModels) {
  const { ReportDeliverySettings } = tenantModels;
  let s = await ReportDeliverySettings.findOne();
  if (!s) {
    console.log('[fetchDeliverySettings] No settings found, creating default');
    s = await ReportDeliverySettings.create({});
  }
  console.log('[fetchDeliverySettings] Retrieved:', { pdfEnabled: s.pdf?.enabled, clinicName: s.pdf?.clinicName, clinicPhone: s.pdf?.clinicPhone });
  return s;
}

// ─── PATCH /api/report/jobs/:jobId/cancel ──────────────────────────────────────
export async function cancelGeneration(req, res) {
  const { ReportJob } = req.tenantModels;
  try {
    const { jobId } = req.params;
    const job = await ReportJob.findOneAndUpdate(
      { _id: jobId, status: { $in: ['generating', 'pending', 'transcribing'] } },
      { $set: { status: 'transcribed', generatingStartedAt: null } },
      { new: true },
    );
    if (!job) {
      const existing = await ReportJob.findById(jobId).select('status');
      if (!existing) return res.status(404).json({ error: 'Job not found' });
      return res.json({ status: existing.status, message: 'Nothing to cancel' });
    }
    res.json({ status: 'transcribed', message: 'Generation cancelled. Ready to retry.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ─── GET /api/report/delivery-settings ────────────────────────────────────────
export async function getReportDeliverySettings(req, res) {
  try {
    const { ReportDeliverySettings } = req.tenantModels;
    let settings = await ReportDeliverySettings.findOne();
    if (!settings) settings = await ReportDeliverySettings.create({});
    res.json(settings);
  } catch (err) {
    console.error('[getReportDeliverySettings]', err.message);
    res.status(500).json({ error: err.message });
  }
}

// ─── PUT /api/report/delivery-settings ────────────────────────────────────────
export async function saveReportDeliverySettings(req, res) {
  try {
    const { ReportDeliverySettings } = req.tenantModels;
    const { _id, __v, createdAt, updatedAt, ...body } = req.body;
    console.log('[saveReportDeliverySettings] Incoming body:', JSON.stringify(body, null, 2));
    const settings = await ReportDeliverySettings.findOneAndUpdate(
      {},
      { $set: body },
      { new: true, upsert: true, runValidators: true },
    );
    console.log('[saveReportDeliverySettings] Saved settings:', { pdfEnabled: settings.pdf?.enabled, clinicName: settings.pdf?.clinicName });
    res.json(settings);
  } catch (err) {
    console.error('[saveReportDeliverySettings] Error:', err.message);
    res.status(400).json({ error: err.message });
  }
}

// ─── POST /api/report/jobs/:jobId/save-to-drive ────────────────────────────────
export async function saveReportToDrive(req, res) {
  const { Patient, ReportJob } = req.tenantModels;
  const credentials = req.tenantConfig;
  try {
    const { jobId } = req.params;
    const job = await ReportJob.findById(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const reportText = (req.body.report_text || job.reportText || '').trim();
    if (!reportText) return res.status(422).json({ error: 'No report text to save.' });
    const patient = await Patient.findById(job.patientId);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    const template     = getTemplateById(job.templateId);
    const templateName = template?.name || 'Clinical Report';
    const patientName  = `${patient.first_name} ${patient.last_name || ''}`.trim();
    // Sign with the visit's treating doctor, not the logged-in user.
    const saveDoctor   = await resolveReportDoctor(req.tenantModels, {
      patientId: job.patientId, appointmentId: job.appointmentId, fallbackName: req.user?.name,
    });
    const ds = await fetchDeliverySettings(req.tenantModels);
    const pdfEnabled = ds.pdf?.enabled ?? false;
    console.log('[Report] Delivery Settings:', { pdfEnabled, clinicName: ds.pdf?.clinicName, clinicEmail: ds.pdf?.clinicEmail });
    if (!patient.drive_folders?.root) {
      patient.drive_folders = await createPatientDriveFolders(credentials, patient.patientId, patientName);
      await patient.save();
    }
    const clinicalNotesFolderId = patient.drive_folders.clinical_notes;
    if (!clinicalNotesFolderId) return res.status(400).json({ error: 'Clinical Notes folder not available.' });
    const dateFolderName = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    const dateFolderId   = await createSubfolder(credentials, clinicalNotesFolderId, dateFolderName);
    const dateStr        = new Date().toISOString().slice(0, 10);

    const mimeType = pdfEnabled ? 'application/pdf' : 'text/plain';
    const filename = `${templateName}_${patientName}_${dateStr}.${pdfEnabled ? 'pdf' : 'txt'}`;
    const buffer = pdfEnabled
      ? await buildSingleDocPdf(req.tenantModels, {
          type: 'report', reportText, patient, doctor: saveDoctor, reportTemplateName: templateName,
        })
      : Buffer.from(reportText, 'utf-8');

    // Overwrite the existing Drive file for this template if one exists (avoids
    // duplicates when re-saving after a regenerate); otherwise create a new file.
    const existingFileId = job.driveFileIds?.[job.templateId];
    let uploaded;
    if (existingFileId) {
      try {
        uploaded = await updateFileInDrive(credentials, existingFileId, buffer, filename, mimeType);
      } catch (err) {
        console.warn(`[Report] overwrite failed for ${existingFileId}, creating new:`, err.message);
        uploaded = await uploadFileToDrive(credentials, dateFolderId, buffer, filename, mimeType);
      }
    } else {
      uploaded = await uploadFileToDrive(credentials, dateFolderId, buffer, filename, mimeType);
    }

    await ReportJob.findByIdAndUpdate(jobId, {
      $set: {
        [`driveLinks.${templateName}`]: uploaded.webViewLink,
        [`driveFileIds.${job.templateId}`]: uploaded.id,
      },
    });

    // Register the report in patient.files[] (paired to the visit, like other
    // documents) — only on first creation. An overwrite reuses the same Drive id,
    // so don't add a duplicate record; refresh the existing one's link instead.
    if (!existingFileId) {
      const reportVisitId = await resolveReportVisitId(req.tenantModels, {
        patientId: job.patientId, appointmentId: job.appointmentId,
      });
      patient.files.push({
        file_name:     uploaded.name,
        category:      'Clinical Notes',
        drive_file_id: uploaded.id,
        web_view_link: uploaded.webViewLink,
        mime_type:     mimeType,
        ...(reportVisitId ? { visit_id: reportVisitId } : {}),
        ...(job.appointmentId ? { appointment_id: job.appointmentId } : {}),
      });
      await patient.save();
    } else {
      const existing = patient.files.find(f => f.drive_file_id === uploaded.id);
      if (existing) {
        existing.file_name = uploaded.name;
        existing.web_view_link = uploaded.webViewLink;
        await patient.save();
      }
    }

    // Auto-verify Google Drive integration since save succeeded
    try {
      const IntegrationStatus = req.tenantModels.IntegrationStatus;
      await IntegrationStatus.findOneAndUpdate(
        { integration: 'google_drive' },
        {
          isVerified: true,
          isConfigured: true,
          lastVerified: new Date(),
          lastError: null,
          'testDetails.testStatus': 'success',
          'testDetails.lastTestDate': new Date(),
          'testDetails.testMessage': 'Verified: Report successfully saved to Drive',
        },
        { upsert: true }
      );
    } catch (err) {
      console.error('[Report] Error updating integration status:', err.message);
      // Don't fail the save if status update fails
    }

    res.json({ success: true, webViewLink: uploaded.webViewLink, pdfEnabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

import { triggerWhatsApp, triggerJourney, normalizePhone } from '../services/whatsapp.service.js';
import PDFDocument from 'pdfkit';
import { uploadFile } from '../services/cloudinary.service.js';

/**
 * Helper: get today's visit for a patient, or create a stub if none exists
 * Returns the MOST RECENT visit for today
 * @param {object} models - req.tenantModels
 */
// Resolve (or create) today's visit for a patient. When an `appointmentId` is
// supplied (the action happened in the context of an appointment), the visit is
// tied to it so documents can be matched by appointment_id later — no same-day
// guessing. Prefers an existing visit already linked to that appointment; else
// today's visit (which it back-links to the appointment if it had none); else
// creates a fresh visit carrying the appointment_id.
async function getOrCreateTodayVisit(models, patientId, appointmentId = null) {
  const { Visit, Patient } = models;
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay   = new Date(); endOfDay.setHours(23, 59, 59, 999);

  // ── Appointment-scoped path ──────────────────────────────────────────────
  // When we know the appointment, the visit MUST belong to that appointment —
  // documents are matched by appointment_id. Never merge into a same-day visit
  // that belongs to a DIFFERENT appointment (that would make findings/treatments
  // for appointment A land on appointment B's Visit Summary).
  if (appointmentId) {
    // 1a. The visit already linked to this appointment.
    const linked = await Visit.findOne({ patient_id: patientId, appointment_id: appointmentId });
    if (linked) return linked;

    // 1b. A same-day visit with NO appointment yet — adopt it for this appointment.
    const orphan = await Visit.findOne({
      patient_id: patientId,
      appointment_id: { $in: [null, undefined] },
      date: { $gte: startOfDay, $lte: endOfDay },
    }).sort({ date: -1 });
    if (orphan) {
      orphan.appointment_id = appointmentId;
      await orphan.save();
      return orphan;
    }

    // 1c. Otherwise create a fresh visit dedicated to this appointment.
    const visit = await Visit.create({
      patient_id: patientId,
      appointment_id: appointmentId,
      date: new Date(),
    });
    await Patient.findByIdAndUpdate(patientId, { last_visit_date: new Date() });
    return visit;
  }

  // ── Walk-in path (no appointment context) ────────────────────────────────
  // 2. Today's visit for this patient (any).
  let visit = await Visit.findOne({
    patient_id: patientId,
    date: { $gte: startOfDay, $lte: endOfDay }
  }).sort({ date: -1 });

  if (visit) return visit;

  // 3. Create a fresh visit.
  visit = await Visit.create({
    patient_id: patientId,
    date: new Date(),
  });
  await Patient.findByIdAndUpdate(patientId, { last_visit_date: new Date() });
  return visit;
}

// POST /api/visits
// Merges into today's visit for this patient instead of creating a new document
// each time, so treatments/findings saved from different chart tabs (Dental /
// Soft Tissue / TMJ) in the same sitting all land on one Visit — otherwise the
// Visit Summary PDF (built from a single visitId) only shows one of them.
export async function createVisit(req, res) {
  const { Visit, Patient } = req.tenantModels;
  try {
    const { patient_id, appointment_id, treatments, findings, notes, date, dentition_type } = req.body;

    if (!patient_id) {
      const visit = new Visit(req.body);
      await visit.save();
      return res.status(201).json(visit);
    }

    const visit = await getOrCreateTodayVisit(req.tenantModels, patient_id, appointment_id || null);

    // One appointment = one dentition. Snapshot the chart the teeth are being
    // charted on the first time, then lock it: a later action on a different
    // dentition is rejected so a visit can never mix Adult/Pedo/Mixed teeth.
    if (dentition_type) {
      if (!visit.dentition_type) {
        visit.dentition_type = dentition_type;
      } else if (visit.dentition_type !== dentition_type) {
        return res.status(409).json({
          error: `This appointment is already charted on the ${visit.dentition_type} dentition. Finish or clear it before switching to ${dentition_type}.`,
          dentition_type: visit.dentition_type,
        });
      }
    }

    // Append treatments rather than replacing.
    if (Array.isArray(treatments) && treatments.length) {
      visit.treatments.push(...treatments);
    }

    // Merge findings — union soft_tissue/tmj/clinical_findings, keep last non-empty diagnosis.
    if (findings) {
      visit.findings = visit.findings || {};
      const mergeList = (existing = [], incoming = []) =>
        Array.from(new Set([...(existing || []), ...(incoming || [])]));
      if (findings.soft_tissue)
        visit.findings.soft_tissue = mergeList(visit.findings.soft_tissue, findings.soft_tissue);
      if (findings.tmj)
        visit.findings.tmj = mergeList(visit.findings.tmj, findings.tmj);
      if (findings.clinical_findings)
        visit.findings.clinical_findings = mergeList(visit.findings.clinical_findings, findings.clinical_findings);
      if (findings.diagnosis_notes && findings.diagnosis_notes.trim()) {
        visit.findings.diagnosis_notes = visit.findings.diagnosis_notes
          ? `${visit.findings.diagnosis_notes}, ${findings.diagnosis_notes}`
          : findings.diagnosis_notes;
      }
      // Per-tooth findings/diagnoses — append (each entry carries its own teeth).
      if (Array.isArray(findings.tooth_findings) && findings.tooth_findings.length)
        visit.findings.tooth_findings = [...(visit.findings.tooth_findings || []), ...findings.tooth_findings];
      if (Array.isArray(findings.tooth_diagnoses) && findings.tooth_diagnoses.length)
        visit.findings.tooth_diagnoses = [...(visit.findings.tooth_diagnoses || []), ...findings.tooth_diagnoses];
      visit.markModified('findings');
    }

    if (notes && notes.trim()) {
      visit.notes = visit.notes ? `${visit.notes}\n${notes}` : notes;
    }

    await visit.save();
    await Patient.findByIdAndUpdate(patient_id, { last_visit_date: new Date() });

    res.status(201).json(visit);
  } catch (err) { res.status(400).json({ error: err.message }); }
}

// GET /api/visits
export async function getVisits(req, res) {
  const { Visit } = req.tenantModels;
  try {
      const visits = await Visit.find().populate('patient_id');
      res.json(visits);
  } catch(err) { res.status(500).json({ error: err.message }); }
}

// GET /api/visits/:id 
export async function getVisitById(req, res) {
  const { Visit } = req.tenantModels;
  try {
      const visit = await Visit.findById(req.params.id).populate('patient_id');
      if(!visit) return res.status(404).json({error: "Visit not found"});
      res.json(visit);
  } catch(err) { res.status(500).json({ error: err.message }); }
}

// GET /api/visits/patient/:id
export async function getPatientHistory(req, res) {
  const { Visit } = req.tenantModels;
  try {
    const visits = await Visit.find({ patient_id: req.params.id })
      .populate('appointment_id')
      .populate('treatments.invoice_id',    'total_amount')
      .populate('prescriptions.invoice_id', 'total_amount')
      .sort({ date: -1 });
    res.json(visits);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// PATCH /api/visits/:id  (generic top-level field updates, e.g. chief_complaint)
export async function updateVisit(req, res) {
  const { Visit } = req.tenantModels;
  try {
    // Whitelist only safe top-level scalar fields to prevent overwriting subdoc arrays
    const ALLOWED = ['chief_complaint', 'notes', 'ai_transcript'];
    const updates = {};
    for (const key of ALLOWED) {
      if (key in req.body) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0)
      return res.status(400).json({ error: 'No valid fields to update' });

    const visit = await Visit.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
    if (!visit) return res.status(404).json({ error: 'Visit not found' });
    res.json(visit);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// PATCH /api/visits/:visitId/notes/:noteId
export async function updateNote(req, res) {
  const { Visit } = req.tenantModels;
  try {
    const { visitId, noteId } = req.params;
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });

    const visit = await Visit.findOneAndUpdate(
      { _id: visitId, 'consultation_notes._id': noteId },
      { $set: { 'consultation_notes.$.content': content } },
      { new: true }
    );
    if (!visit) return res.status(404).json({ error: 'Note not found' });
    res.json(visit);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// PATCH /api/visits/:visitId/advices/:adviceId
export async function updateAdvice(req, res) {
  const { Visit } = req.tenantModels;
  try {
    const { visitId, adviceId } = req.params;
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });

    const visit = await Visit.findOneAndUpdate(
      { _id: visitId, 'advices._id': adviceId },
      { $set: { 'advices.$.content': content } },
      { new: true }
    );
    if (!visit) return res.status(404).json({ error: 'Advice not found' });
    res.json(visit);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// POST /api/visits/patient/:patientId/note
export async function addConsultationNote(req, res) {
  const { Visit } = req.tenantModels;
  try {
    const { content, appointment_id } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });

    const visit = await getOrCreateTodayVisit(req.tenantModels, req.params.patientId, appointment_id || null);
    visit.consultation_notes.push({ content });
    await visit.save();

    res.status(201).json(visit);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// POST /api/visits/patient/:patientId/advice
export async function addAdvice(req, res) {
  const { Visit } = req.tenantModels;
  try {
    const { content, appointment_id } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });

    const visit = await getOrCreateTodayVisit(req.tenantModels, req.params.patientId, appointment_id || null);
    visit.advices.push({ content });
    await visit.save();

    res.status(201).json(visit);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// POST /api/visits/patient/:patientId/prescription
export async function addPrescription(req, res) {
  const { Visit } = req.tenantModels;
  try {
    const { drug_name, dosage, duration, instructions, visit_id, appointment_id } = req.body;
    if (!drug_name) return res.status(400).json({ error: 'drug_name is required' });

    // If a specific visit is targeted (e.g. editing a past completed appointment),
    // add to that visit; otherwise fall back to today's visit.
    let visit;
    if (visit_id) {
      visit = await Visit.findOne({ _id: visit_id, patient_id: req.params.patientId });
      if (!visit) return res.status(404).json({ error: 'Visit not found' });
    } else {
      visit = await getOrCreateTodayVisit(req.tenantModels, req.params.patientId, appointment_id || null);
    }
    visit.prescriptions.push({ drug_name, dosage, duration, instructions });
    await visit.save();

    // Fire-and-forget prescription notification with PDF
    req.tenantModels.Patient.findById(req.params.patientId)
      .select('first_name last_name contact patientId')
      .lean()
      .then(async patient => {
        if (!patient?.contact?.mobile) return;
        const firstName = patient.first_name;
        const fullName = `${firstName} ${patient.last_name || ''}`.trim();
        const patientId = patient._id.toString();

        let prescriptionUrl = '';
        try {
          const pdf = new PDFDocument();
          const chunks = [];
          pdf.on('data', chunk => chunks.push(chunk));
          const pdfPromise = new Promise((resolve, reject) => {
            pdf.on('end', () => resolve(Buffer.concat(chunks)));
            pdf.on('error', reject);
          });

          pdf.fontSize(18).text('Prescription', { align: 'center' });
          pdf.moveDown();
          pdf.fontSize(12).text(`Patient: ${fullName}`);
          pdf.text(`Date: ${new Date().toLocaleDateString('en-IN')}`);
          pdf.moveDown();

          pdf.fontSize(14).text('Medication Details:').moveDown();
          pdf.fontSize(11)
            .text(`Drug: ${drug_name}`)
            .text(`Dosage: ${dosage || 'N/A'}`)
            .text(`Duration: ${duration || 'N/A'}`)
            .text(`Instructions: ${instructions || 'N/A'}`);

          pdf.moveDown(2);
          pdf.fontSize(10).text('This prescription is issued by the dentist. Follow the instructions carefully.', { align: 'center' });
          pdf.end();

          const pdfBuffer = await pdfPromise;
          const fileName = `prescription-${patient.patientId}-${Date.now()}.pdf`;
          const uploadRes = await uploadFile(
            pdfBuffer,
            fileName,
            'dms/prescriptions',
            ['prescription', patient.patientId],
            req.tenantConfig
          ).catch(() => null);

          if (uploadRes?.url) {
            prescriptionUrl = uploadRes.url;
          }
        } catch (pdfErr) {
          console.error('[Prescription PDF] Generation failed:', pdfErr.message);
        }

        const visitId = visit._id.toString();
        triggerWhatsApp(
          req.tenantModels, req.user.tenantId, process.env.WAAPI_BASE_URL,
          'prescriptionIssued',
          patient.contact.mobile,
          {
            name: fullName,
            firstName,
            patientId: patient.patientId,
            // normalize so {{mobile}} renders identically across every event
            mobile: normalizePhone(patient.contact.mobile),
            drug: drug_name,
            dosage: dosage || '',
            duration: duration || '',
            instructions: instructions || '',
            prescriptionUrl: prescriptionUrl || '',
          },
          patientId,
          null, null, null,
          `prescription:${visitId}:${drug_name}`
        );
      })
      .catch(() => {});

    res.status(201).json(visit);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// POST /api/visits/patient/:patientId/treatments  — bulk-add treatments to today's visit
export async function addTreatments(req, res) {
  const { Visit } = req.tenantModels;
  try {
    const { treatments, appointment_id } = req.body;
    if (!Array.isArray(treatments) || treatments.length === 0)
      return res.status(400).json({ error: 'treatments array is required' });

    const visit = await getOrCreateTodayVisit(req.tenantModels, req.params.patientId, appointment_id || null);
    treatments.forEach(t => {
      visit.treatments.push({
        treatment_name: t.treatment_name,
        teeth_numbers:  Array.isArray(t.teeth_numbers) ? t.teeth_numbers : [],
        cost:           t.cost   || 0,
        qty:            t.qty    || 1,
        status:         t.status || 'Planned',
      });
    });
    await visit.save();
    res.status(201).json(visit);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// DELETE /api/visits/:visitId/notes/:noteId
export async function deleteNote(req, res) {
  const { Visit } = req.tenantModels;
  try {
    const { visitId, noteId } = req.params;
    const visit = await Visit.findByIdAndUpdate(
      visitId,
      { $pull: { consultation_notes: { _id: noteId } } },
      { new: true }
    );
    if (!visit) return res.status(404).json({ error: 'Visit not found' });
    res.json(visit);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// DELETE /api/visits/:visitId/advices/:adviceId
export async function deleteAdvice(req, res) {
  const { Visit } = req.tenantModels;
  try {
    const { visitId, adviceId } = req.params;
    const visit = await Visit.findByIdAndUpdate(
      visitId,
      { $pull: { advices: { _id: adviceId } } },
      { new: true }
    );
    if (!visit) return res.status(404).json({ error: 'Visit not found' });
    res.json(visit);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// DELETE /api/visits/:visitId/treatments/:treatmentId
export async function deleteTreatment(req, res) {
  const { Visit } = req.tenantModels;
  try {
    const { visitId, treatmentId } = req.params;

    const visit = await Visit.findById(visitId);
    if (!visit) return res.status(404).json({ error: 'Visit not found' });

    const target = (visit.treatments || []).find(t => String(t._id) === String(treatmentId));
    if (!target) return res.status(404).json({ error: 'Treatment not found' });

    // Teeth this treatment was charted on.
    const targetTeeth = new Set((target.teeth_numbers || []).map(String));

    // Teeth still referenced by OTHER treatments — their findings/diagnoses stay.
    const teethStillUsed = new Set();
    (visit.treatments || []).forEach(t => {
      if (String(t._id) === String(treatmentId)) return;
      (t.teeth_numbers || []).forEach(tt => teethStillUsed.add(String(tt)));
    });

    // Orphaned teeth = this treatment's teeth that no remaining treatment uses.
    // Their per-tooth findings/diagnoses would otherwise linger on the Visit
    // Summary PDF (a row/chart mark with an empty Treatment column), so prune them.
    const orphanTeeth = new Set([...targetTeeth].filter(tt => !teethStillUsed.has(tt)));

    // Remove the treatment itself.
    visit.treatments = (visit.treatments || []).filter(t => String(t._id) !== String(treatmentId));

    if (orphanTeeth.size && visit.findings) {
      // Drop a tooth number from an entry; keep the entry if it still targets
      // other (non-orphaned) teeth. Entries left with no teeth are removed.
      const prune = (arr = []) => arr
        .map(e => ({
          ...(e.toObject ? e.toObject() : e),
          teeth_numbers: (e.teeth_numbers || []).filter(tt => !orphanTeeth.has(String(tt))),
        }))
        .filter(e => (e.teeth_numbers || []).length > 0);

      visit.findings.tooth_findings  = prune(visit.findings.tooth_findings);
      visit.findings.tooth_diagnoses = prune(visit.findings.tooth_diagnoses);
    }

    await visit.save();
    res.json(visit);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// DELETE /api/visits/:visitId/prescriptions/:prescriptionId
export async function deletePrescription(req, res) {
  const { Visit } = req.tenantModels;
  try {
    const { visitId, prescriptionId } = req.params;
    const visit = await Visit.findByIdAndUpdate(
      visitId,
      { $pull: { prescriptions: { _id: prescriptionId } } },
      { new: true }
    );
    if (!visit) return res.status(404).json({ error: 'Visit not found' });
    res.json(visit);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// PATCH /api/visits/:visitId/prescriptions/:prescriptionId
// Edit a single prescription line in place. Only the provided fields are
// updated (drug_name, dosage, duration, instructions).
export async function updatePrescription(req, res) {
  const { Visit } = req.tenantModels;
  try {
    const { visitId, prescriptionId } = req.params;
    const editable = ['drug_name', 'dosage', 'duration', 'instructions'];
    const set = {};
    for (const field of editable) {
      if (req.body[field] !== undefined) set[`prescriptions.$.${field}`] = req.body[field];
    }
    if (Object.keys(set).length === 0)
      return res.status(400).json({ error: 'No editable fields provided' });
    if (set['prescriptions.$.drug_name'] !== undefined && !String(set['prescriptions.$.drug_name']).trim())
      return res.status(400).json({ error: 'drug_name cannot be empty' });

    const visit = await Visit.findOneAndUpdate(
      { _id: visitId, 'prescriptions._id': prescriptionId },
      { $set: set },
      { new: true }
    );
    if (!visit) return res.status(404).json({ error: 'Prescription not found' });
    res.json(visit);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// POST /api/visits/mark-invoiced
export async function markInvoiced(req, res) {
  const { Visit } = req.tenantModels;
  try {
    const { invoice_id, treatment_refs = [], prescription_refs = [] } = req.body;

    for (const ref of treatment_refs) {
      await Visit.updateOne(
        { _id: ref.visitId, 'treatments._id': ref.treatmentId },
        { $set: { 'treatments.$.invoice_id': invoice_id } }
      );
    }

    for (const ref of prescription_refs) {
      await Visit.updateOne(
        { _id: ref.visitId, 'prescriptions._id': ref.prescriptionId },
        { $set: { 'prescriptions.$.invoice_id': invoice_id } }
      );
    }

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// PATCH /api/visits/:visitId/treatments/:treatmentId/status
export async function updateTreatmentStatus(req, res) {
  const { Visit } = req.tenantModels;
  try {
    const { visitId, treatmentId } = req.params;
    const { status } = req.body; // 'Planned' | 'In Progress' | 'Completed'

    // Stamp the transition timestamp for this status. Only set a stage's date the
    // first time it's entered (don't overwrite on revert-then-redo). A direct
    // Planned -> Completed also backfills started_at so the timeline stays ordered.
    const now = new Date();
    const setFields = { "treatments.$.status": status };
    if (status === 'In Progress') {
      setFields["treatments.$.started_at"] = now;
    } else if (status === 'Completed') {
      setFields["treatments.$.completed_at"] = now;
    }

    let visit = await Visit.findOneAndUpdate(
      { _id: visitId, "treatments._id": treatmentId },
      { $set: setFields },
      { new: true }
    );

    // Backfill started_at when a treatment jumped straight to Completed without ever
    // being In Progress, so the Completed card's timeline has a coherent start date.
    if (visit && status === 'Completed') {
      const t = visit.treatments?.find(x => x._id.toString() === treatmentId);
      if (t && !t.started_at) {
        visit = await Visit.findOneAndUpdate(
          { _id: visitId, "treatments._id": treatmentId },
          { $set: { "treatments.$.started_at": now } },
          { new: true }
        );
      }
    }

    if (!visit) return res.status(404).json({ error: "Visit or Treatment not found" });

    // Fire-and-forget WhatsApp notifications on treatment completion
    if (status === 'Completed' && visit.patient_id) {
      const treatment = visit.treatments?.find(t => t._id.toString() === treatmentId);
      const completedAt = new Date();

      req.tenantModels.Patient.findById(visit.patient_id)
        .select('first_name last_name contact patientId whatsapp_language')
        .lean()
        .then(async patient => {
          if (!patient?.contact?.mobile) return;
          const phone = patient.contact.mobile;
          const firstName = patient.first_name;
          const fullName = `${firstName} ${patient.last_name || ''}`.trim();
          const patientId = patient._id.toString();
          // Post-op language is a property of the patient, not the appointment.
          const lang = patient.whatsapp_language || null;
          const treatingDoctor = visit.doctor_id
            ? await req.tenantModels.Doctor?.findById(visit.doctor_id).select('name').lean()
            : null;
          const data = {
            name: fullName,
            firstName,
            patientId: patient.patientId,
            mobile: phone,
            // Pin the timezone explicitly — without it the date is formatted in the
            // host's zone, so a late-evening IST treatment prints the previous day
            // on a UTC server.
            date: completedAt.toLocaleDateString('en-IN', {
              timeZone: 'Asia/Kolkata', year: 'numeric', month: 'long', day: 'numeric',
            }),
            treatment: treatment?.treatment_name ?? '',
            teethNumbers: treatment?.teeth_numbers?.join(', ') ?? '',
            // Fall back to 'Doctor' like every other event — an empty string would
            // leave a hole mid-sentence in the patient's message.
            doctorName: treatingDoctor?.name || 'Doctor',
          };

          // 1. Immediate treatment-completed message
          triggerWhatsApp(
            req.tenantModels, req.user.tenantId, process.env.WAAPI_BASE_URL,
            'treatmentScheduled', phone, data, patientId,
            lang, null, null, `treatmentCompleted:${visitId}:${treatmentId}`
          );

          // 2. Post-care journey — only if not already started for this treatment
          if (treatment && !treatment.journey_started) {
            // Mark journey_started to prevent duplicate sends on re-complete
            await req.tenantModels.Visit.updateOne(
              { _id: visitId, 'treatments._id': treatmentId },
              { $set: { 'treatments.$.journey_started': true } }
            ).catch(() => {});

            triggerJourney(
              req.tenantModels, req.user.tenantId, process.env.WAAPI_BASE_URL,
              phone, treatment.treatment_name, completedAt, data, patientId, lang
            );
          }
        })
        .catch(() => {});
    }

    res.json(visit);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// PUT /api/visits/:visitId/treatments/:treatmentId
export async function updateTreatment(req, res) {
  const { Visit } = req.tenantModels;
  try {
    const { visitId, treatmentId } = req.params;
    // Teeth are intentionally NOT editable here — changing them can't safely
    // re-map the per-tooth findings/diagnoses, so a wrong tooth is fixed by
    // deleting the treatment and re-adding it. teeth_numbers is ignored.
    const { treatment_name, cost, qty, status, notes } = req.body;

    const visit = await Visit.findById(visitId);
    if (!visit) return res.status(404).json({ error: 'Visit not found' });

    const treatment = (visit.treatments || []).find(t => String(t._id) === String(treatmentId));
    if (!treatment) return res.status(404).json({ error: 'Treatment not found' });

    if (treatment_name !== undefined) treatment.treatment_name = treatment_name;
    if (cost !== undefined) treatment.cost = cost;
    if (qty !== undefined) treatment.qty = qty;
    if (status !== undefined) treatment.status = status;

    // Visit-level field (shared across all treatments in this visit).
    if (notes !== undefined) visit.notes = notes;

    await visit.save();
    res.json(visit);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}


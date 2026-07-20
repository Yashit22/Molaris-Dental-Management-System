// Assessment autofill — dictation → reviewable draft of the assessment tab.
//
// This controller performs NO writes to the clinical record. It returns a draft the
// dentist reviews and edits; committing happens from the frontend through the SAME
// endpoints the manual charting flow uses (POST /visits, PUT /patients), so an
// autofilled treatment is indistinguishable from a hand-charted one and flows into
// the treatment-plan board and the invoice with no extra wiring.

import { buildAssessmentDraft } from '../services/assessmentAutofill.service.js';
import { debit as debitCredits } from '../services/credits.service.js';

// ─── POST /api/assessment/autofill ─────────────────────────────────────────────
// Body: { patient_id, transcript_text, audio_duration_seconds? }
// Returns { history, entries, unplaced, failures }
export async function autofillAssessment(req, res) {
  const { Patient, ClinicalFinding, Diagnosis, SuggestedTreatment } = req.tenantModels;

  try {
    const { patient_id, transcript_text, audio_duration_seconds } = req.body;

    const transcript = (transcript_text || '').trim();
    if (!patient_id) return res.status(400).json({ error: 'patient_id is required' });
    if (!transcript) return res.status(400).json({ error: 'transcript_text is required' });

    const apiKey = req.tenantConfig?.sarvamApiKey;
    if (!apiKey) return res.status(400).json({ error: 'Sarvam API Key not configured for this tenant.' });

    const patient = await Patient.findById(patient_id).select('medical_history dental_history');
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    // Credits — charged per second of dictation (1 credit = 60s), the same way
    // reports and note-beautify charge. The WS relay only gates; this is the debit.
    const durationSeconds = Math.max(0, Math.round(Number(audio_duration_seconds) || 0));
    if (durationSeconds > 0) {
      const ok = await debitCredits(req.user.tenantId, durationSeconds, {
        patientId: patient._id, durationSeconds,
        stage: 'assessment_autofill', createdBy: req.user?.name,
      });
      if (!ok) {
        return res.status(402).json({
          error: 'insufficient_credits',
          message: 'Your clinic has run out of AI credits. Please contact your administrator.',
        });
      }
    }

    // This tenant's own libraries. These are NOT sent to the extraction prompt —
    // they are used afterwards to resolve the extracted terms (exact → acronym →
    // fuzzy → semantic), so prompt size stays constant no matter how large a
    // clinic's catalog grows.
    const [findings, diagnoses, treatments] = await Promise.all([
      ClinicalFinding.find({ is_active: true }).select('name').lean(),
      Diagnosis.find({ is_active: true }).select('name').lean(),
      SuggestedTreatment.find({ is_active: true }).select('name cost').lean(),
    ]);

    const draft = await buildAssessmentDraft({
      apiKey,
      transcript,
      existingHistory: {
        medical_history: patient.medical_history || [],
        dental_history:  patient.dental_history  || '',
      },
      catalogs: { findings, diagnoses, treatments },
    });

    // Every pass failed — nothing to review, so this is an error, not a draft.
    if (!draft.history && draft.entries.length === 0 && draft.failures.length > 0) {
      return res.status(502).json({
        error: 'Extraction failed.',
        detail: draft.failures.map(f => `${f.pass}: ${f.message}`).join('; '),
      });
    }

    return res.json(draft);
  } catch (err) {
    console.error('[Assessment] autofill error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

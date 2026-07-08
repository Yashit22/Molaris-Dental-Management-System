import express from 'express';
const router = express.Router();

import {
  createVisit,
  getVisits,
  getVisitById,
  getPatientHistory,
  updateVisit,
  updateTreatmentStatus,
  updateTreatment,
  markInvoiced,
  addConsultationNote,
  addAdvice,
  updateNote,
  updateAdvice,
  deleteNote,
  deleteAdvice,
  deleteTreatment,
  addPrescription,
  updatePrescription,
  deletePrescription,
  addTreatments,
} from '../controllers/visit.controller.js';

router.post('/', createVisit);
router.get('/', getVisits);
router.get('/:id', getVisitById);
router.patch('/:id', updateVisit);  // generic top-level field updates (chief_complaint, notes, etc.)
router.get('/patient/:id', getPatientHistory);
router.patch('/:visitId/treatments/:treatmentId/status', updateTreatmentStatus);
router.put('/:visitId/treatments/:treatmentId', updateTreatment);
router.post('/mark-invoiced', markInvoiced);

// Notes & Advices — find or create today's visit, then push entry
router.post('/patient/:patientId/note',   addConsultationNote);
router.post('/patient/:patientId/advice', addAdvice);

// Edit existing note / advice
router.patch('/:visitId/notes/:noteId',     updateNote);
router.patch('/:visitId/advices/:adviceId', updateAdvice);

// Delete note / advice / treatment
router.delete('/:visitId/notes/:noteId',         deleteNote);
router.delete('/:visitId/advices/:adviceId',     deleteAdvice);
router.delete('/:visitId/treatments/:treatmentId', deleteTreatment);

// Prescriptions
router.post('/patient/:patientId/prescription', addPrescription);

// AI autofill — bulk add treatments to today's visit
router.post('/patient/:patientId/treatments', addTreatments);
router.patch('/:visitId/prescriptions/:prescriptionId', updatePrescription);
router.delete('/:visitId/prescriptions/:prescriptionId', deletePrescription);

export default router;

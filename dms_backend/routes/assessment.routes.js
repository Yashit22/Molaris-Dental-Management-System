import express from 'express';
import { autofillAssessment } from '../controllers/assessment.controller.js';

const router = express.Router();

// Dictation → reviewable assessment draft. Extraction only — writes nothing.
router.post('/autofill', autofillAssessment);

export default router;

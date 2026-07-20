import express from 'express';
import { generateReport, listTemplates, transcribeAudio, getJobStatus, getLatestReport, editTranscript, cancelGeneration, saveReportToDrive, getReportDeliverySettings, saveReportDeliverySettings, beautifyNote } from '../controllers/report.controller.js';

const router = express.Router();

router.get('/templates',   listTemplates);
// Audio is transcribed live over the WS relay (/api/report/stream); these
// endpoints now take JSON transcript text only — no multipart audio upload.
router.post('/transcribe', transcribeAudio);
router.post('/beautify',   beautifyNote);
router.get('/latest',      getLatestReport);
router.get('/jobs/:jobId', getJobStatus);
router.patch('/jobs/:jobId/transcript', editTranscript);
router.post('/generate', generateReport);

router.get('/delivery-settings',          getReportDeliverySettings);
router.put('/delivery-settings',          saveReportDeliverySettings);
router.patch('/jobs/:jobId/cancel',       cancelGeneration);
router.post('/jobs/:jobId/save-to-drive', saveReportToDrive);

export default router;

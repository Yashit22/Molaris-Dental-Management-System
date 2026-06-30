import express from 'express';
import {
  getSettings,
  updateSettings,
  testSend,
  sendReportEmail,
  getLogs,
} from '../controllers/email.controller.js';

const router = express.Router();

// Settings
router.get('/settings', getSettings);
router.put('/settings', updateSettings);
router.post('/test', testSend);

// Send
router.post('/send-report', sendReportEmail);

// Logs
router.get('/logs', getLogs);

export default router;

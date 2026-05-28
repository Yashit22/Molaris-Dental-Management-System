import express from 'express';
import {
  checkGoogleDriveStatus,
  checkGmailStatus,
  checkWhatsAppStatus,
  getAllIntegrationsStatus,
  sendTestEmail,
  sendTestWhatsApp,
  getStorageInfo,
} from '../controllers/integration.controller.js';

const router = express.Router();

// Check individual integrations
router.get('/status/google-drive', checkGoogleDriveStatus);
router.get('/status/gmail', checkGmailStatus);
router.get('/status/whatsapp', checkWhatsAppStatus);

// Get all integrations status at once
router.get('/status/all', getAllIntegrationsStatus);

// Get storage info
router.get('/storage', getStorageInfo);

// Test integrations
router.post('/test/email', sendTestEmail);
router.post('/test/whatsapp', sendTestWhatsApp);

export default router;

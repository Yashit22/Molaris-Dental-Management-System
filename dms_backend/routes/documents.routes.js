import express from 'express';
import multer from 'multer';
import {
  getDocumentSettings,
  saveDocumentSettings,
  uploadDocumentImage,
  deleteDocumentImage,
  generateDocumentPdf,
  emailDocumentPdf,
} from '../controllers/documents.controller.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/settings',      getDocumentSettings);
router.put('/settings',      saveDocumentSettings);
router.post('/upload-image', upload.single('file'), uploadDocumentImage);
router.delete('/image',      deleteDocumentImage);
router.post('/pdf',          generateDocumentPdf);
router.post('/email',        emailDocumentPdf);

export default router;

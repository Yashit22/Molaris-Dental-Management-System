import express from 'express';
import {
  getBookingSettings,
  saveBookingSettings,
  getDoctorSchedule,
  saveDoctorSchedule,
  getInvoiceSettings,
  saveInvoiceSettings,
  getPrescriptionSettings,
  savePrescriptionSettings,
} from '../controllers/settings.controller.js';

const router = express.Router();

router.get('/booking',                  getBookingSettings);
router.put('/booking',                  saveBookingSettings);
router.get('/invoice',                  getInvoiceSettings);
router.put('/invoice',                  saveInvoiceSettings);
router.get('/prescription',             getPrescriptionSettings);
router.put('/prescription',             savePrescriptionSettings);
router.get('/doctors/:id/schedule',     getDoctorSchedule);
router.put('/doctors/:id/schedule',     saveDoctorSchedule);

export default router;

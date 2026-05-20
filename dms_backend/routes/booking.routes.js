import express from 'express';
import {
  getClinicInfo,
  getServices,
  getAvailability,
  requestBooking,
} from '../controllers/booking.controller.js';

const router = express.Router();

// All routes are public — no JWT auth required
router.get('/:tenantId/clinic-info',  getClinicInfo);
router.get('/:tenantId/services',     getServices);
router.get('/:tenantId/availability', getAvailability);
router.post('/:tenantId/request',     requestBooking);

export default router;

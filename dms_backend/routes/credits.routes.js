import express from 'express';
import { getMyBalance, getMyLedger } from '../controllers/credits.controller.js';

// Mounted with `authenticate` only (no resolveTenant needed — credits live in the
// analytics DB, keyed by req.user.tenantId).
const router = express.Router();

router.get('/balance', getMyBalance);
router.get('/ledger',  getMyLedger);

export default router;

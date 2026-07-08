import express from 'express';
import {
  getMedicines,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  bulkUploadMedicines,
} from '../controllers/medicine.controller.js';

const router = express.Router();

router.get('/', getMedicines);
router.post('/', createMedicine);
router.post('/bulk-upload', bulkUploadMedicines);
router.put('/:id', updateMedicine);
router.delete('/:id', deleteMedicine);

export default router;

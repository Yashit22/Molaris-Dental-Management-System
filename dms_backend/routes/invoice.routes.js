import express from "express";
import {
  createInvoice,
  getInvoices,
  getInvoiceById,
  updateInvoice,
} from "../controllers/invoice.controller.js";

const router = express.Router();

router.get("/invoices", getInvoices);
router.get("/invoices/:id", getInvoiceById);
router.post("/invoices", createInvoice);
router.put("/invoices/:id", updateInvoice);

export default router;
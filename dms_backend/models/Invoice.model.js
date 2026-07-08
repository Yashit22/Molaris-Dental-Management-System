import mongoose from 'mongoose';

const InvoiceSchema = new mongoose.Schema({
  invoice_id: { type: String, unique: true, required: true },

  patient_name:  { type: String, required: true },
  patient_phone: { type: String, default: '' },
  patient_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
  visit_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'Visit', default: null },
  // The appointment this invoice belongs to. This is the single source of truth
  // for matching documents to an appointment (visit_id is kept as a data anchor).
  appointment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },

  date: { type: Date, default: Date.now },

  items: [{
    item_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem' },
    name:     { type: String, required: true },
    type:     { type: String, enum: ['Service', 'Pharmacy', 'Lab'], default: 'Service' },
    quantity: { type: Number, default: 1 },
    rate:     { type: Number, required: true },
    total:    { type: Number, required: true },
  }],

  subtotal:     Number,
  tax:          { type: Number, default: 0 },
  total_amount: { type: Number, required: true },

  notes: String,
}, { timestamps: true });

// One-and-only-one invoice per appointment. Partial index so the many legacy /
// walk-in invoices with a null appointment_id are exempt (only real appointment
// links are uniqued). appointment_id is the single source of truth for linking an
// invoice to an appointment's documents (visit_id is kept only as a data anchor).
InvoiceSchema.index(
  { appointment_id: 1 },
  { unique: true, partialFilterExpression: { appointment_id: { $type: 'objectId' } } }
);

export { InvoiceSchema };
export default mongoose.model('Invoice', InvoiceSchema);

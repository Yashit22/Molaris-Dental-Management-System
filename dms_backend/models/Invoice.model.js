import mongoose from 'mongoose';

const InvoiceSchema = new mongoose.Schema({
  invoice_id: { type: String, unique: true, required: true },

  patient_name:  { type: String, required: true },
  patient_phone: { type: String, default: '' },
  patient_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
  visit_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'Visit', default: null },

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

export { InvoiceSchema };
export default mongoose.model('Invoice', InvoiceSchema);

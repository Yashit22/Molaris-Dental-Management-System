import mongoose from 'mongoose';

const MedicineSchema = new mongoose.Schema({
  name:                 { type: String, required: true, unique: true },
  composition:          { type: String },  // e.g. "Amoxicillin 500mg" — also searchable
  strength:             { type: String },  // e.g. "500mg" — display only
  form:                 { type: String },  // Tablet/Capsule/Syrup/Injection/Ointment/Drops/Mouthwash
  category:             { type: String },  // e.g. "Antibiotic", "Analgesic"
  default_dosage:       { type: String },  // pre-fills prescription; drawn from fixed option list
  default_duration:     { type: String },  // pre-fills prescription; drawn from fixed option list
  default_instructions: { type: String },  // free text, e.g. "After food"
  cost:                 { type: Number, default: 0 },  // → invoice line rate
  is_active:            { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model('Medicine', MedicineSchema);

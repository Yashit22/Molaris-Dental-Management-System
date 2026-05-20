import mongoose from 'mongoose';

// Public clinic info shown on the online booking page and in emails.
// One document per tenant, created lazily on first save.
export const ClinicProfileSchema = new mongoose.Schema({
  name:        { type: String, default: '' },
  tagline:     { type: String, default: '' },
  phone:       { type: String, default: '' },
  email:       { type: String, default: '' },
  address:     { type: String, default: '' },
  city:        { type: String, default: '' },
  logoUrl:     { type: String, default: '' },
  // Booking slot settings
  slot_duration_minutes: { type: Number, default: 30 },
  slot_buffer_minutes:   { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model('ClinicProfile', ClinicProfileSchema);

import mongoose from 'mongoose';

const DoctorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  specialization: { type: String }, // e.g., "Orthodontist", "Pediatric Dentist"
  email: { type: String },
  phone: { type: String },
  license_number: { type: String }, // Professional license/registration number
  qualification: { type: String }, // e.g., "BDS", "MDS"
  experience_years: { type: Number, default: 0 },
  is_active: { type: Boolean, default: true },
  availability: {
    monday: { start: String, end: String }, // e.g., "09:00", "17:00"
    tuesday: { start: String, end: String },
    wednesday: { start: String, end: String },
    thursday: { start: String, end: String },
    friday: { start: String, end: String },
    saturday: { start: String, end: String },
    sunday: { start: String, end: String }
  },
  notes: { type: String },

  // Online booking
  isBookable: { type: Boolean, default: false },
  bookingWorkingHours: {
    monday:    { isOpen: Boolean, start: String, end: String, breaks: [{ start: String, end: String }] },
    tuesday:   { isOpen: Boolean, start: String, end: String, breaks: [{ start: String, end: String }] },
    wednesday: { isOpen: Boolean, start: String, end: String, breaks: [{ start: String, end: String }] },
    thursday:  { isOpen: Boolean, start: String, end: String, breaks: [{ start: String, end: String }] },
    friday:    { isOpen: Boolean, start: String, end: String, breaks: [{ start: String, end: String }] },
    saturday:  { isOpen: Boolean, start: String, end: String, breaks: [{ start: String, end: String }] },
    sunday:    { isOpen: Boolean, start: String, end: String, breaks: [{ start: String, end: String }] },
  },
  holidays:     [{ date: { type: String }, reason: { type: String, default: '' } }],
  blockedSlots: [{ date: { type: String }, startTime: { type: String } }],
}, { timestamps: true });

export default mongoose.model('Doctor', DoctorSchema);

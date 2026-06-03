// models/Appointment.js
import mongoose from 'mongoose';

const AppointmentSchema = new mongoose.Schema({
  patient_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  doctor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  start_time: { type: Date, required: true },
  end_time: { type: Date, required: true },
  
  title: String, // "Root Canal - John Doe"
  type: { type: String, default: 'Consultation' },
  
  status: {
    type: String,
    enum: ['Requested', 'Scheduled', 'Checked In', 'In Progress', 'Completed', 'Cancelled', 'No Show'],
    default: 'Scheduled'
  },
  booking_source: { type: String, enum: ['staff', 'online'], default: 'staff' },
  patient_name_snapshot: String, // for Requested appointments before patient record exists
  patient_phone_snapshot: String,
  
  room_number: String,
  token_number: Number,
  notes: { type: String },
  whatsapp_language: { type: String, enum: ['en', 'hi', 'mr'], default: null },
}, { timestamps: true });

export { AppointmentSchema };
export default mongoose.model('Appointment', AppointmentSchema);
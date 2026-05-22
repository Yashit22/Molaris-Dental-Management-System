import mongoose from 'mongoose';

const BreakSchema = new mongoose.Schema(
  { start: { type: String, default: '' }, end: { type: String, default: '' } },
  { _id: false }
);

const DayScheduleSchema = new mongoose.Schema(
  {
    isOpen: { type: Boolean, default: false },
    start:  { type: String, default: '09:00' },
    end:    { type: String, default: '17:00' },
    breaks: { type: [BreakSchema], default: [] },
  },
  { _id: false }
);

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const workingHoursDefaults = {};
DAYS.forEach(d => { workingHoursDefaults[d] = {}; });

export const BookingSettingsSchema = new mongoose.Schema(
  {
    isBookingEnabled:   { type: Boolean, default: false },
    slotDurationMinutes:{ type: Number,  default: 30 },
    clinicDisplayName:  { type: String,  default: '' },
    clinicTagline:      { type: String,  default: '' },
    clinicLogoUrl:      { type: String,  default: '' },
    workingHours: {
      monday:    { type: DayScheduleSchema, default: () => ({}) },
      tuesday:   { type: DayScheduleSchema, default: () => ({}) },
      wednesday: { type: DayScheduleSchema, default: () => ({}) },
      thursday:  { type: DayScheduleSchema, default: () => ({}) },
      friday:    { type: DayScheduleSchema, default: () => ({}) },
      saturday:  { type: DayScheduleSchema, default: () => ({ isOpen: false, start: '10:00', end: '14:00' }) },
      sunday:    { type: DayScheduleSchema, default: () => ({ isOpen: false }) },
    },
    blockedDates: [
      {
        date:   { type: String, required: true },
        reason: { type: String, default: '' },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model('BookingSettings', BookingSettingsSchema);

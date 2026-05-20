import mongoose from 'mongoose';

export const EmailSettingsSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: false,
    },
    automationEnabled: {
      type: Boolean,
      default: false,
    },
    mode: {
      type: String,
      enum: ['gmail', 'custom'],
      default: 'gmail',
    },
    smtp: {
      host: {
        type: String,
        default: 'smtp.gmail.com',
      },
      port: {
        type: Number,
        default: 465,
      },
      secure: {
        type: Boolean,
        default: true,
      },
      user: String,
      password: String, // encrypted via crypto.util
    },
    fromName: String,
    fromEmail: String,
    replyTo: String,
    events: {
      // Online booking: patient submits request → confirmation to patient + alert to clinic
      bookingReceived: {
        enabled:       { type: Boolean, default: true },
        notifyClinic:  { type: Boolean, default: true }, // send alert to clinic owner email too
        clinicEmail:   { type: String, default: '' },    // override recipient for clinic alerts
      },
      // Staff confirms online booking → patient gets a proper confirmation
      bookingConfirmed: {
        enabled: { type: Boolean, default: true },
      },
      // Appointment reminder: N hours before appointment
      appointmentReminder: {
        enabled:      { type: Boolean, default: true },
        hoursBeforeAppointment: { type: Number, default: 24 },
      },
      // Appointment rescheduled by staff
      appointmentRescheduled: {
        enabled: { type: Boolean, default: true },
      },
      // Appointment cancelled
      appointmentCancelled: {
        enabled: { type: Boolean, default: true },
      },
      // Invoice marked Paid → send receipt PDF to patient
      invoicePaid: {
        enabled:        { type: Boolean, default: true },
        attachInvoice:  { type: Boolean, default: true },
      },
      // Appointment completed → send visit summary / invoice / AI report
      appointmentCompleted: {
        enabled: { type: Boolean, default: false },
        delayMinutes: { type: Number, default: 0 },
        include: {
          smartReport:  { type: Boolean, default: true },
          invoice:      { type: Boolean, default: true },
          aiReport:     { type: Boolean, default: false },
          prescription: { type: Boolean, default: true },
        },
      },
    },
    // Reminder scheduler tracking — store ISO datetime of last scheduled reminder check
    _lastReminderCheck: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

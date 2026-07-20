import mongoose from 'mongoose';

const CONTENT_TYPES = [
  'text', 'image', 'video', 'document', 'audio', 'sticker', 'location', 'contact', 'poll',
];

const WhatsAppTemplateSchema = new mongoose.Schema({
  event: {
    type: String,
    enum: [
      'appointmentBooked',
      'appointmentScheduled',
      'appointmentReminder',
      'appointmentRescheduled',
      'treatmentCompleted',
      'feedbackMessage',
      'feedbackManual',
      'postCare',
    ],
    required: true,
  },
  language:    { type: String, enum: ['en', 'hi', 'mr'], required: true },
  contentType: { type: String, enum: CONTENT_TYPES, default: 'text' },

  // Flexible content object — shape depends on contentType:
  //
  // text:     { text }
  // image:    { url, caption?, mimetype?, width?, height?, viewOnce? }
  // video:    { url, mimetype, caption?, gifPlayback?, ptv? }
  // document: { url, mimetype, fileName?, caption? }
  // audio:    { url, mimetype, ptt?, seconds? }
  // sticker:  { url, isAnimated?, mimetype?, width?, height? }
  // location: { degreesLatitude, degreesLongitude, name?, address? }
  // contact:  { displayName, contacts: [{ vcard }] }
  // poll:     { name, values: [String], selectableCount? }
  content: { type: mongoose.Schema.Types.Mixed, required: true },

  isActive: { type: Boolean, default: true },
}, { timestamps: true });

WhatsAppTemplateSchema.index({ event: 1, language: 1, isActive: 1 });

// Exactly one template per (event, language). These models live in a per-tenant DB,
// so the connection already scopes this to the tenant. Editing a template updates it
// in place — it must never insert a second row for the same event+language.
WhatsAppTemplateSchema.index({ event: 1, language: 1 }, { unique: true });

export { WhatsAppTemplateSchema, CONTENT_TYPES };
export default mongoose.model('WhatsAppTemplate', WhatsAppTemplateSchema);

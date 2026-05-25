import mongoose from 'mongoose';

// Per-tenant templates + defaults for delivering an AI clinical report.
// Single doc per tenant, shared between personal WA (with media) and shared WA (text-only).
// Supported placeholders: {{patientName}}, {{firstName}}, {{doctorName}},
// {{clinicName}}, {{date}}, {{templateName}}.
export const ReportDeliverySettingsSchema = new mongoose.Schema(
  {
    // Email delivery (supported by both systems)
    email: {
      subject: { type: String, default: 'Your visit summary — {{date}}' },
      body: {
        type: String,
        default:
          'Hi {{patientName}},\n\nPlease find your {{templateName}} from your visit attached.\n\nWarm regards,\n{{doctorName}}\n{{clinicName}}',
      },
    },

    // WhatsApp delivery — separate configs for personal vs shared systems
    whatsapp: {
      // Personal WhatsApp — supports media, PDFs, links
      personal: {
        text: {
          type: String,
          default:
            'Hi {{patientName}}, please find your {{templateName}} from {{doctorName}} at {{clinicName}}. Reach out if you have any questions.',
        },
        includeMedia: { type: Boolean, default: false },
        includePdf: { type: Boolean, default: true },
      },
      // Shared WhatsApp — text-only, no media/assets
      shared: {
        text: {
          type: String,
          default:
            'Hi {{patientName}}, your {{templateName}} is ready from {{doctorName}}. Please contact us for details.',
        },
        // No media/asset fields — not supported by shared WA system
      },
    },

    // Which channels are pre-ticked when the delivery step opens
    defaults: {
      cloud: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
      whatsappPersonal: { type: Boolean, default: false },
      whatsappShared: { type: Boolean, default: false },
    },

    // Branded PDF generation (used by both systems for email/cloud)
    pdf: {
      enabled: { type: Boolean, default: false },
      clinicName: { type: String, default: '' },
      clinicTagline: { type: String, default: '' },
      clinicAddress: { type: String, default: '' },
      clinicPhone: { type: String, default: '' },
      clinicEmail: { type: String, default: '' },
      clinicLogoUrl: { type: String, default: '' },
    },

    // Wrap report in a branded HTML email body instead of plain text
    htmlEmail: {
      enabled: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

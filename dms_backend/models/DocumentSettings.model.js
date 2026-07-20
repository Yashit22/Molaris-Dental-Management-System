import mongoose from 'mongoose';

// Canonical per-tenant branding for all generated documents
// (prescription, clinical notes, invoice, AI report).
// Seeded from InvoiceSettings / PrescriptionSettings / tenant on first read.
export const DocumentSettingsSchema = new mongoose.Schema(
  {
    // ── Clinic identity ──────────────────────────────────────────────────────
    clinic_name:   { type: String, default: '' },
    tagline:       { type: String, default: '' },
    address:       { type: String, default: '' },
    city:          { type: String, default: '' },
    state:         { type: String, default: '' },
    pincode:       { type: String, default: '' },
    phone:         { type: String, default: '' },
    email:         { type: String, default: '' },
    website:       { type: String, default: '' },
    reg_number:    { type: String, default: '' },
    clinic_logo_url: { type: String, default: '' },
    currency_symbol: { type: String, default: '₹' },

    // ── GST / tax ────────────────────────────────────────────────────────────
    gstin:        { type: String, default: '' },
    pan_number:   { type: String, default: '' },
    cgst_rate:    { type: Number, default: 0 },
    sgst_rate:    { type: Number, default: 0 },
    igst_rate:    { type: Number, default: 0 },

    // ── Payment info (UPI/QR mode carries a QR image; bank mode carries account details) ──
    payment_modes: {
      type: [
        {
          type:     { type: String, enum: ['upi', 'bank'], default: 'upi' },
          label:    { type: String, default: '' },   // e.g. "UPI", "Bank Transfer"
          details:  { type: String, default: '' },   // e.g. UPI id / account no
          qr_url:   { type: String, default: '' },    // Cloudinary QR image (upi mode)
          // Bank transfer details (bank mode)
          bank_name:   { type: String, default: '' },
          branch:      { type: String, default: '' },
          ifsc:        { type: String, default: '' },
          beneficiary: { type: String, default: '' },
        },
      ],
      default: [],
    },

    // ── Invoice document ─────────────────────────────────────────────────────
    invoice_prefix:        { type: String, default: 'INV' },
    invoice_footer_text:   { type: String, default: '' },
    invoice_show_logo:     { type: Boolean, default: true },
    invoice_show_gst:      { type: Boolean, default: true },
    invoice_show_payment:  { type: Boolean, default: true },
    invoice_show_paid_pending: { type: Boolean, default: true },
    invoice_show_footer:   { type: Boolean, default: true },

    // ── Prescription document ────────────────────────────────────────────────
    prescription_footer_text:       { type: String, default: '' },
    prescription_show_logo:         { type: Boolean, default: true },
    prescription_show_reg:          { type: Boolean, default: true },
    prescription_show_qualification:{ type: Boolean, default: true },
    prescription_show_advice:       { type: Boolean, default: true },
    prescription_show_footer:       { type: Boolean, default: true },
    prescription_show_signature:    { type: Boolean, default: true }, // embed doctor's digital signature/stamp image
    // ── Smart Report (visit summary) document ────────────────────────────────
    smart_show_logo:     { type: Boolean, default: true },
    smart_show_footer:   { type: Boolean, default: true },
    postcare_template:   {
      type: String,
      default: `• Avoid hard foods, very hot or cold drinks for 24 hours\n• Rinse with warm salt water 2–3 times daily if the area feels sore\n• Take prescribed medications as directed — complete the full course\n• Avoid smoking or alcohol for at least 48 hours after treatment\n• If bleeding, swelling, or pain worsens after 24 hours, contact the clinic immediately\n• Attend your next follow-up appointment as scheduled`,
    },

    // ── AI Report document ───────────────────────────────────────────────────
    report_header_text:  { type: String, default: '' },
    report_footer_text:  { type: String, default: '' },
    report_show_logo:    { type: Boolean, default: true },
    report_show_patient: { type: Boolean, default: true },
    report_show_header:  { type: Boolean, default: true },
    report_show_footer:  { type: Boolean, default: true },
  },
  { timestamps: true }
);

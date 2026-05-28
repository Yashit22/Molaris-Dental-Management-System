import mongoose from 'mongoose';

export const IntegrationStatusSchema = new mongoose.Schema(
  {
    integration: {
      type: String,
      enum: ['google_drive', 'gmail', 'whatsapp'],
      required: true,
    },
    isConfigured: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    lastVerified: { type: Date, default: null },
    lastError: { type: String, default: null },
    errorCode: { type: String, default: null },
    testDetails: {
      lastTestDate: { type: Date, default: null },
      testStatus: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
      testMessage: { type: String, default: null },
    },
    metadata: {
      storageQuota: { type: Number, default: null }, // in bytes for Google Drive
      storageUsed: { type: Number, default: null },   // in bytes for Google Drive
      credentialsPresent: { type: [String], default: [] }, // which credentials are set
    },
  },
  { timestamps: true }
);

export default mongoose.model('IntegrationStatus', IntegrationStatusSchema);

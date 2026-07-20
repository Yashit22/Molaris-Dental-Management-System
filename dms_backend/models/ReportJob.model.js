import mongoose from 'mongoose';

const ReportJobSchema = new mongoose.Schema({
  patientId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
  visitId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Visit', default: null },
  status:        { type: String, enum: ['pending', 'transcribing', 'transcribed', 'generating', 'done', 'failed'], default: 'pending' },
  generatingStartedAt: { type: Date, default: null },
  sarvamJobId:   { type: String },
  transcript:    { type: String },
  reportText:    { type: String },
  driveLinks:    { type: mongoose.Schema.Types.Mixed, default: {} },
  driveFileIds:  { type: mongoose.Schema.Types.Mixed, default: {} }, // template.id -> drive_file_id (for overwrite on regenerate)
  templateId:    { type: String },
  detailLevel:   { type: String, enum: ['brief', 'standard', 'detailed'], default: 'standard' },
  saveReport:    { type: Boolean, default: true },
  audioFilename: { type: String },
  audioMimetype: { type: String },
  audioDurationSeconds: { type: Number, default: 0 },
  creditDebited:        { type: Boolean, default: false }, // guards against double-charge on regenerate
  errorMessage:  { type: String },
  createdBy:     { type: String },
}, { timestamps: true });

export { ReportJobSchema };

import mongoose from 'mongoose';

const ServiceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  cost: { type: Number, required: true },
  category: { type: String, default: 'General' },
  description: String,
  duration_minutes: { type: Number, default: null }, // null = use clinic default slot duration
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export { ServiceSchema };
export default mongoose.model('Service', ServiceSchema);
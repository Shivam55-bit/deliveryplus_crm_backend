import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, lowercase: true, trim: true },
  phone: { type: String, required: true, trim: true },
  address: { type: String, trim: true },
  company: { type: String, trim: true },
  notes: { type: String },
  source: { type: String, enum: ['direct', 'referral', 'website', 'phone', 'other'], default: 'direct' },
  totalJobs: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

customerSchema.index({ phone: 1 });
customerSchema.index({ email: 1 });
customerSchema.index({ name: 'text' });

export default mongoose.model('Customer', customerSchema);

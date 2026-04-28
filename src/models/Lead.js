import mongoose from 'mongoose';

const leadSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true },
  phone: { type: String, required: true, trim: true },
  company: { type: String, trim: true },
  source: { type: String, enum: ['website', 'referral', 'phone', 'social', 'other'], default: 'phone' },
  status: { type: String, enum: ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'], default: 'new' },
  estimatedValue: { type: Number, default: 0 },
  notes: { type: String },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  convertedToCustomer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
}, { timestamps: true });

leadSchema.index({ status: 1 });
leadSchema.index({ name: 'text' });

export default mongoose.model('Lead', leadSchema);

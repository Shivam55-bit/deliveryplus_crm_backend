import mongoose from 'mongoose';

const followUpSchema = new mongoose.Schema({
  relatedTo: { type: String, enum: ['lead', 'customer', 'job'], required: true },
  relatedId: { type: mongoose.Schema.Types.ObjectId, required: true },
  type: { type: String, enum: ['call', 'email', 'meeting', 'note', 'task'], default: 'call' },
  subject: { type: String, required: true },
  description: { type: String },
  dueDate: { type: Date },
  status: { type: String, enum: ['pending', 'completed', 'overdue'], default: 'pending' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  completedAt: { type: Date },
}, { timestamps: true });

followUpSchema.index({ relatedTo: 1, relatedId: 1 });
followUpSchema.index({ dueDate: 1, status: 1 });

export default mongoose.model('FollowUp', followUpSchema);

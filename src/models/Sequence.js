import mongoose from 'mongoose';

const sequenceSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  value: { type: Number, required: true, default: 0, min: 0 },
}, { timestamps: true });

sequenceSchema.index({ name: 1 }, { unique: true });

export default mongoose.model('Sequence', sequenceSchema);

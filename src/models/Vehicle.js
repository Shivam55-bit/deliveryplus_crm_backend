import mongoose from 'mongoose';

const vehicleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['van', 'truck', 'ute', 'trailer', 'other'], required: true },
  registration: { type: String, required: true, unique: true, trim: true },
  capacity: { type: String },
  isAvailable: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

vehicleSchema.index({ isAvailable: 1, isActive: 1 });

export default mongoose.model('Vehicle', vehicleSchema);

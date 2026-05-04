import mongoose from 'mongoose';

const driverSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  licenseNumber: { type: String, trim: true },
  vehicleNumber: { type: String, trim: true, default: '' },
  vehicleTypes: [{ type: String }],
  availability: { type: String, enum: ['available', 'busy', 'offline'], default: 'available' },
  currentLocation: {
    lat: { type: Number },
    lng: { type: Number },
  },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  totalJobs: { type: Number, default: 0 },
  completedJobs: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

driverSchema.index({ availability: 1 });

export default mongoose.model('Driver', driverSchema);

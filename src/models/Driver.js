import mongoose from 'mongoose';

const driverSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  licenseNumber: { type: String, trim: true },
  vehicleNumber: { type: String, trim: true, default: '' },
  vehicleTypes: [{ type: String }],
  availability: { type: String, enum: ['available', 'busy', 'offline'], default: 'available' },
  approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected', 'suspended'], default: 'pending' },
  isApproved: { type: Boolean, default: false },
  verificationStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  documents: [{
    type: { type: String },
    status: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
    url: { type: String },
  }],
  currentLocation: {
    lat: { type: Number },
    lng: { type: Number },
  },
  fcmTokens: [{
    token: { type: String, required: true },
    platform: { type: String, enum: ['ios', 'android'], required: true },
    deviceId: { type: String, default: null },
    updatedAt: { type: Date, default: Date.now },
  }],
  rating: { type: Number, default: 0, min: 0, max: 5 },
  totalJobs: { type: Number, default: 0 },
  completedJobs: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

driverSchema.index({ availability: 1 });
driverSchema.index({ 'fcmTokens.token': 1 }, { unique: false, sparse: true });

export default mongoose.model('Driver', driverSchema);

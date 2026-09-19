import mongoose from 'mongoose';

const deviceTokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  token: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  platform: {
    type: String,
    enum: ['ios', 'android'],
    required: true,
  },
  deviceId: {
    type: String,
    default: null,
    trim: true,
  },
  deviceName: {
    type: String,
    default: null,
    trim: true,
  },
  appVersion: {
    type: String,
    default: null,
    trim: true,
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  lastUsedAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

deviceTokenSchema.index({ userId: 1, isActive: 1 });

export default mongoose.model('DeviceToken', deviceTokenSchema);

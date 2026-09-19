import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  recipientDriver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    default: null,
    index: true,
  },
  title: { type: String, required: true },
  body: { type: String, default: null },
  message: { type: String, required: true },
  type: {
    type: String,
    enum: ['NEW_JOB', 'JOB_UPDATED', 'JOB_CANCELLED', 'PAYMENT_RECEIVED', 'REMINDER', 'GENERAL', 'JOB_ASSIGNED', 'JOB_COMPLETED', 'PAYMENT_UPDATED', 'ADMIN_MESSAGE', 'PICKUP_REMINDER', 'DELIVERY_DELAY'],
    default: 'GENERAL',
    required: true,
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    default: null,
  },
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    default: null,
  },
  data: {
    type: Object,
    default: {},
  },
  isRead: { type: Boolean, default: false, index: true },
  readAt: { type: Date, default: null },
  pushStatus: {
    type: String,
    enum: ['pending', 'sent', 'failed', 'no_device'],
    default: 'pending',
  },
  pushError: { type: String, default: null },
  sentStatus: {
    type: String,
    enum: ['pending', 'sent', 'partial', 'failed', 'no_token', 'no_device'],
    default: 'pending',
  },
  sentAt: { type: Date, default: null },
  failureReason: { type: String, default: null },
  deduplicationKey: { type: String, default: null, index: true, sparse: true, unique: true },
}, { timestamps: true });

notificationSchema.index({ recipientDriver: 1, isRead: 1 });
notificationSchema.index({ recipientId: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);

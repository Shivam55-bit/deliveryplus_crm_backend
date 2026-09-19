import mongoose from 'mongoose';

const emailAttachmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    originalName: {
      type: String,
      required: true,
    },

    storedName: {
      type: String,
      required: true,
    },

    filePath: {
      type: String,
      required: true,
    },

    fileUrl: {
      type: String,
      default: null,
    },

    mimeType: {
      type: String,
      required: true,
    },

    fileSize: {
      type: Number,
      required: true,
    },

    category: {
      type: String,
      enum: ['terms', 'insurance', 'moving-guide', 'payment', 'company', 'customer', 'other'],
      default: 'other',
    },

    description: {
      type: String,
      default: '',
    },

    isDefault: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

emailAttachmentSchema.index({ isActive: 1, category: 1 });

export default mongoose.model('EmailAttachment', emailAttachmentSchema);

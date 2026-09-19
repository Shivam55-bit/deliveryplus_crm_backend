import mongoose from 'mongoose';

const versionSnapshotSchema = new mongoose.Schema({
  version: { type: Number, required: true },
  subject: { type: String, required: true },
  useCustomHtml: { type: Boolean, default: false },
  customHtml: { type: String, default: '' },
  contentConfig: { type: mongoose.Schema.Types.Mixed, default: {} },
  designConfig: { type: mongoose.Schema.Types.Mixed, default: {} },
  sectionsConfig: { type: [mongoose.Schema.Types.Mixed], default: [] },
  logoConfig: { type: mongoose.Schema.Types.Mixed, default: {} },
  ctaConfig: { type: mongoose.Schema.Types.Mixed, default: {} },
  savedAt: { type: Date, default: Date.now },
  savedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  savedByName: { type: String },
  changeNote: { type: String },
}, { _id: true });

const emailTemplateSchema = new mongoose.Schema({
  templateKey: {
    type: String,
    required: true,
    unique: true,
    enum: ['quotation', 'booking_confirmation'],
    index: true,
  },
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  subject: {
    type: String,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  useCustomHtml: {
    type: Boolean,
    default: false,
  },
  customHtml: {
    type: String,
    default: '',
  },
  contentConfig: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  designConfig: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  sectionsConfig: {
    type: [mongoose.Schema.Types.Mixed],
    default: [],
  },
  logoConfig: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  ctaConfig: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  version: {
    type: Number,
    default: 1,
  },
  versions: {
    type: [versionSnapshotSchema],
    default: [],
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

emailTemplateSchema.index({ templateKey: 1, isActive: 1 });

export default mongoose.model('EmailTemplate', emailTemplateSchema);

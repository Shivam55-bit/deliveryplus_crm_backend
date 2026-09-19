import mongoose from 'mongoose';
import Sequence from './Sequence.js';

const jobSchema = new mongoose.Schema({
  jobNumber: { type: String, unique: true },

  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
  },

  customerName: {
    type: String,
    required: true,
    trim: true,
  },

  customerPhone: {
    type: String,
    required: true,
    trim: true,
  },

  customerEmail: {
    type: String,
    trim: true,
  },

  // Creator & Ownership Tracking
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  createdByRole: {
    type: String,
    enum: ['super_admin', 'superAdmin', 'admin', 'customer', 'system'],
    default: 'admin',
  },
  createdByName: {
    type: String,
    trim: true,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  updatedByName: {
    type: String,
    trim: true,
  },

  // Pickup
  pickupAddress: {
    type: String,
    required: true,
    trim: true,
  },
  pickupSuburb: { type: String, default: '' },
  pickupState: { type: String, default: '' },
  pickupPostcode: { type: String, default: '' },
  pickupNotes: { type: String, default: '' },

  // Drop-off
  // `dropAddress` is kept for backward compatibility because existing jobs use it.
  dropAddress: {
    type: String,
    required: true,
    trim: true,
  },

  // Canonical field for new API/app/admin code.
  dropoffAddress: {
    type: String,
    trim: true,
    default: null,
  },

  dropSuburb: { type: String, default: '' },
  dropState: { type: String, default: '' },
  dropPostcode: { type: String, default: '' },
  dropNotes: { type: String, default: '' },

  jobType: {
    type: String,
    enum: ['delivery', 'moving'],
    required: true,
  },

  scheduledDate: {
    type: Date,
    required: true,
  },

  scheduledTime: {
    type: String,
    default: null,
  },

  scheduleMode: {
    type: String,
    enum: ['exact', 'window'],
    default: 'exact',
  },

  scheduledStartTime: {
    type: String,
    default: null,
  },

  scheduledEndTime: {
    type: String,
    default: null,
  },

  // Pricing
  estimatedHours: {
    type: Number,
    default: null,
    min: 0,
  },

  fixedQuote: {
    type: Number,
    default: null,
    min: 0,
  },

  fixedPrice: {
    type: Number,
    default: null,
    min: 0,
  },

  hourlyRate: {
    type: Number,
    default: 0,
    min: 0,
  },

  pricingType: {
    type: String,
    enum: ['hourly', 'fixed'],
    default: 'hourly',
  },

  includeGST: {
    type: Boolean,
    default: false,
  },

  gstRate: {
    type: Number,
    default: 10,
  },

  pricingSnapshot: {
    type: Object,
    default: {},
  },

  lineItems: {
    type: String,
    default: '',
  },

  propertySize: {
    type: String,
    default: '',
  },

  minimumChargeHours: {
    type: Number,
    default: 2.5,
    min: 0,
  },

  // Canonical calculated pricing values.
  minimumLaborCost: {
    type: Number,
    default: 0,
    min: 0,
  },

  minimumEstimatedCost: {
    type: Number,
    default: 0,
    min: 0,
  },

  // Truck
  truckSize: {
    type: String,
    trim: true,
    default: null,
  },

  // Legacy only. Do not use this for new UI/API code.
  truckSizeCount: {
    type: Number,
    default: null,
  },

  movers: {
    type: Number,
    default: null,
    min: 0,
  },

  // Canonical Callout fields.
  calloutTimeMinutes: {
    type: Number,
    default: 0,
    min: 0,
  },

  calloutCharge: {
    type: Number,
    default: 0,
    min: 0,
  },

  // Legacy Callout fields.
  callOutFee: {
    type: Number,
    default: null,
    min: 0,
  },

  callOutTimeHr: {
    type: Number,
    default: null,
    min: 0,
  },

  callOutTimeMin: {
    type: Number,
    default: null,
    min: 0,
  },

  // Canonical Travel Back fields.
  travelBackTimeMinutes: {
    type: Number,
    default: 0,
    min: 0,
  },

  travelBackCharge: {
    type: Number,
    default: 0,
    min: 0,
  },

  // Legacy Travel Back fields.
  travelBackFee: {
    type: Number,
    default: null,
    min: 0,
  },

  travelBackTimeHr: {
    type: Number,
    default: null,
    min: 0,
  },

  travelBackTimeMin: {
    type: Number,
    default: null,
    min: 0,
  },

  stairsFee: {
    type: Number,
    default: 0,
    min: 0,
  },

  stairsCharge: {
    type: Number,
    default: 0,
    min: 0,
  },

  notes: {
    type: String,
    default: '',
  },

  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  },

  bookingDepositAmount: {
    type: Number,
    default: 50,
    min: 0,
  },

  // Driver price visibility control
  showDriverPrice: {
    type: Boolean,
    default: false,
  },
  driverPriceType: {
    type: String,
    enum: ['full', 'custom', 'percentage'],
    default: null,
  },
  driverPrice: {
    type: Number,
    default: null,
    min: 0,
  },
  driverPricePercentage: {
    type: Number,
    default: null,
    min: 0,
    max: 100,
  },

  items: [{
    description: String,
    quantity: Number,
    unitPrice: Number,
    total: Number,
  }],

  bookingStatus: {
    type: String,
    enum: ['quotation', 'confirmed'],
    default: 'quotation',
    index: true,
  },

  quotation: {
    status: {
      type: String,
      enum: ['draft', 'pending', 'sent', 'viewed', 'accepted', 'rejected', 'expired'],
      default: 'draft',
    },
    sentAt: { type: Date, default: null },
    viewedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
  },

  confirmation: {
    confirmedAt: { type: Date, default: null },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    emailSent: { type: Boolean, default: false },
    emailSentAt: { type: Date, default: null },
    messageId: { type: String, default: null },
    error: { type: String, default: null },
  },

  status: {
    type: String,
    enum: [
      'pending',
      'assigned',
      'accepted',
      'inTransit',
      'in_transit',
      'arrived',
      'started',
      'paused',
      'awaitingCompletion',
      'completed',
      'cancelled',
      'inProgress',
      'progress',
      'in_progress',
    ],
    default: 'pending',
  },

  startedAt: {
    type: Date,
    default: null,
  },

  completedAt: {
    type: Date,
    default: null,
  },

  endedAt: {
    type: Date,
    default: null,
  },

  assignedDrivers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],

  driverAssignments: [{
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['primary', 'helper', 'driver'],
      default: 'primary',
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status: {
      type: String,
      enum: ['assigned', 'in_progress', 'completed', 'cancelled', 'removed'],
      default: 'assigned',
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    totalWorkedMinutes: {
      type: Number,
      default: null,
    },
    startAgreement: {
      termsRead: { type: Boolean, default: false },
      termsAccepted: { type: Boolean, default: false },
      stairsAtProperty: { type: Boolean, default: false },
      stairsOption: { type: String, enum: ['yes', 'no', null], default: null },
      customerSignature: { type: String, default: null },
      customerSignatureName: { type: String, default: null },
      agreementVersion: { type: String, default: '1.0' },
      acceptedAt: { type: Date, default: null },
      startedAt: { type: Date, default: null },
      driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      driverName: { type: String, default: null },
      ipAddress: { type: String, default: '' },
      userAgent: { type: String, default: '' },
    },
    pricingSnapshot: {
      type: Object,
      default: null,
    },
    removedAt: {
      type: Date,
      default: null,
    },
  }],

  assignedVehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
  },

  // Timer data
  timerStarted: {
    type: Date,
    default: null,
  },

  timerEnded: {
    type: Date,
    default: null,
  },

  pauseIntervals: [{
    pausedAt: { type: Date },
    resumedAt: { type: Date },
  }],

  totalWorkedMinutes: {
    type: Number,
    default: 0,
  },

  billableHours: {
    type: Number,
    default: 0,
  },

  // Start Agreement Evidence
  startAgreement: {
    termsRead: { type: Boolean, default: false },
    termsAccepted: { type: Boolean, default: false },
    stairsAtProperty: { type: Boolean, default: false },
    stairsOption: { type: String, enum: ['yes', 'no', null], default: null },
    customerSignature: { type: String, default: null },
    customerSignatureName: { type: String, default: null },
    agreementVersion: { type: String, default: '1.0' },
    acceptedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    driverName: { type: String, default: null },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },

  // Completion Evidence
  completion: {
    termsRead: { type: Boolean, default: false },
    termsAccepted: { type: Boolean, default: false },
    deliveryConfirmed: { type: Boolean, default: false },
    stairsAtProperty: { type: Boolean, default: false },
    stairsWaiverAccepted: { type: Boolean, default: false },
    hasDamage: { type: Boolean, default: false },
    damageReport: { type: String, default: 'None' },
    damagePhotos: [{ type: String }],
    customerSignature: { type: String, default: null },
    customerSignatureName: { type: String, default: null },
    driverCompletionSignature: { type: String, default: null },
    photos: [{ type: String }],
    paymentMethod: { type: String, default: 'cash' },
    amountReceived: { type: Number, default: null },
    paymentProofUrl: { type: String, default: null },
    transactionReference: { type: String, default: null },
    otherPaymentDetails: { type: String, default: null },
    completionNotes: { type: String, default: '' },
    notes: { type: String, default: '' },
    completedAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    driverName: { type: String, default: null },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },

  // Proof of delivery
  signature: {
    type: String,
    default: null,
  },

  startSignature: {
    type: String,
    default: null,
  },

  // Single definition only.
  endSignature: {
    type: String,
    default: null,
  },

  customerEndSignature: {
    type: String,
    default: null,
  },

  customerSignature: {
    type: String,
    default: null,
  },

  customerSignatureName: {
    type: String,
    default: null,
  },

  customerSignatureDate: {
    type: Date,
    default: null,
  },

  driverName: {
    type: String,
    default: null,
  },

  driverCompletionSignature: {
    type: String,
    default: null,
  },

  completedByDriverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },

  photos: [{
    type: String,
  }],

  hasDamage: {
    type: Boolean,
    default: false,
  },

  damageReport: {
    type: String,
    default: 'None',
  },

  damagePhotos: [{
    type: String,
  }],

  completionNotes: {
    type: String,
    default: '',
  },

  termsAccepted: {
    type: Boolean,
    default: false,
  },

  termsAcceptedAt: {
    type: Date,
    default: null,
  },

  termsReadAt: {
    type: Date,
    default: null,
  },

  deliveryConfirmed: {
    type: Boolean,
    default: false,
  },

  stairsAtProperty: {
    type: Boolean,
    default: false,
  },

  stairsWaiverAccepted: {
    type: Boolean,
    default: false,
  },

  termsVersion: {
    type: String,
    default: null,
  },

  paymentMethod: {
    type: String,
    enum: ['cash', 'online', 'other'],
    default: 'cash',
  },

  paymentProof: {
    type: String,
    default: null,
  },

  paymentProofUrl: {
    type: String,
    default: null,
  },

  paymentTransactionReference: {
    type: String,
    default: null,
  },

  transactionReference: {
    type: String,
    default: null,
  },

  otherPaymentDetails: {
    type: String,
    default: null,
  },

  amountReceived: {
    type: Number,
    default: null,
    min: 0,
  },

  paymentNotes: {
    type: String,
    default: null,
  },

  // Billing
  billing: {
    laborCost: { type: Number, default: 0 },
    extraCharges: { type: Number, default: 0 },
    fuelCharges: { type: Number, default: 0 },
    tollCharges: { type: Number, default: 0 },
    gst: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    extraChargeNotes: { type: String },
  },

  quotationSent: {
    type: Boolean,
    default: false,
  },

  quotationSentAt: {
    type: Date,
  },

  confirmationSent: {
    type: Boolean,
    default: false,
  },

  confirmationSentAt: {
    type: Date,
  },

  completionDocuments: {
    type: Object,
    default: {
      manifestVersion: '1.0',
      status: 'pending',
      sentAt: null,
      recipientCount: 0,
      recipients: [],
      checksum: null,
      summary: null,
      messageId: null,
    },
  },

  completionDocumentsSentAt: {
    type: Date,
  },

  completionDocumentsStatus: {
    type: String,
    default: 'pending',
    enum: ['pending', 'sent', 'failed', 'resend'],
  },

  selectedEmailAttachments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EmailAttachment',
  }],

  quotationEmailAttachments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EmailAttachment',
  }],

  bookingConfirmationEmailAttachments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EmailAttachment',
  }],

  emailAttachmentSnapshot: [{
    attachmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmailAttachment',
    },
    name: String,
    originalName: String,
    mimeType: String,
    fileSize: Number,
  }],

  emailAttachmentOptions: {
    quotation: { type: Boolean, default: true },
    bookingConfirmation: { type: Boolean, default: false },
  },

  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
  },

  // Timeline
  timeline: [{
    action: { type: String },
    timestamp: { type: Date, default: Date.now },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    notes: { type: String },
  }],

  // Completed Job Adjustments Audit Trail
  adjustments: [{
    adjustedAt: { type: Date, default: Date.now },
    adjustedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    adjustedByName: { type: String, default: null },
    adjustedByRole: { type: String, default: null },
    reason: { type: String, required: true },
    changes: [{
      field: { type: String, required: true },
      label: { type: String, default: '' },
      oldValue: { type: mongoose.Schema.Types.Mixed },
      newValue: { type: mongoose.Schema.Types.Mixed },
    }],
    recalculatedPricing: {
      totalWorkedMinutes: { type: Number, default: 0 },
      overtimeMinutes: { type: Number, default: 0 },
      overtimeAmount: { type: Number, default: 0 },
      finalDriverAmount: { type: Number, default: 0 },
      customerTotalAmount: { type: Number, default: 0 },
    },
  }],
}, {
  timestamps: true,
});

jobSchema.index({ status: 1, scheduledDate: 1 });
jobSchema.index({ bookingStatus: 1, scheduledDate: 1 });
jobSchema.index({ 'quotation.status': 1 });
jobSchema.index({ customerId: 1 });
jobSchema.index({ assignedDrivers: 1 });
jobSchema.index({ customerName: 'text', customerPhone: 'text' });

// Keep legacy + canonical drop-off fields synchronized.
jobSchema.pre('validate', function syncDropoffAddress(next) {
  if (!this.dropAddress && this.dropoffAddress) {
    this.dropAddress = this.dropoffAddress;
  }

  if (!this.dropoffAddress && this.dropAddress) {
    this.dropoffAddress = this.dropAddress;
  }

  next();
});

// Auto-generate job number.
jobSchema.pre('save', async function generateJobNumber(next) {
  if (this.jobNumber) {
    return next();
  }

  const sequence = await Sequence.findOneAndUpdate(
    { name: 'jobNumber' },
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  const maxJob = await mongoose.model('Job')
    .findOne({ jobNumber: /^JOB-\d{5}$/ })
    .sort({ jobNumber: -1 })
    .lean();

  const maxExistingNumber = maxJob
    ? Number(String(maxJob.jobNumber).replace(/^JOB-/, '')) || 0
    : 0;

  const nextValue = Math.max(sequence.value, maxExistingNumber + 1);
  if (nextValue !== sequence.value) {
    const updatedSequence = await Sequence.findOneAndUpdate(
      { _id: sequence._id },
      { $max: { value: nextValue } },
      { new: true },
    );
    this.jobNumber = `JOB-${String(updatedSequence.value).padStart(5, '0')}`;
  } else {
    this.jobNumber = `JOB-${String(sequence.value).padStart(5, '0')}`;
  }

  next();
});

jobSchema.index({ 'driverAssignments.driverId': 1 });

export default mongoose.model('Job', jobSchema);

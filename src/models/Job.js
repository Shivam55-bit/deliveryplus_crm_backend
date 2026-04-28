import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema({
  jobNumber: { type: String, unique: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName: { type: String, required: true, trim: true },
  customerPhone: { type: String, required: true, trim: true },
  customerEmail: { type: String, trim: true },

  pickupAddress: { type: String, required: true },
  pickupSuburb: { type: String },
  pickupState: { type: String },
  pickupPostcode: { type: String },
  pickupNotes: { type: String },

  dropAddress: { type: String, required: true },
  dropSuburb: { type: String },
  dropState: { type: String },
  dropPostcode: { type: String },
  dropNotes: { type: String },

  jobType: { type: String, enum: ['delivery', 'moving'], required: true },
  scheduledDate: { type: Date, required: true },
  scheduledTime: { type: String },

  estimatedHours: { type: Number },
  fixedQuote: { type: Number },
  hourlyRate: { type: Number, default: 0 },
  pricingType: { type: String, enum: ['hourly', 'fixed'], default: 'hourly' },

  notes: { type: String },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },

  status: {
    type: String,
    enum: ['pending', 'assigned', 'in_transit', 'started', 'paused', 'completed', 'cancelled'],
    default: 'pending',
  },

  assignedDrivers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  assignedVehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },

  // Timer data
  timerStarted: { type: Date },
  timerEnded: { type: Date },
  pauseIntervals: [{
    pausedAt: { type: Date },
    resumedAt: { type: Date },
  }],
  totalWorkedMinutes: { type: Number, default: 0 },
  billableHours: { type: Number, default: 0 },

  // Proof of delivery
  startSignature: { type: String },
  endSignature: { type: String },
  photos: [{ type: String }],
  damageReport: { type: String },
  completionNotes: { type: String },
  termsAccepted: { type: Boolean, default: false },

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

  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },

  // Timeline
  timeline: [{
    action: { type: String },
    timestamp: { type: Date, default: Date.now },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String },
  }],
}, { timestamps: true });

jobSchema.index({ status: 1, scheduledDate: 1 });
jobSchema.index({ customerId: 1 });
jobSchema.index({ assignedDrivers: 1 });
jobSchema.index({ jobNumber: 1 });
jobSchema.index({ customerName: 'text', customerPhone: 'text' });

// Auto-generate job number
jobSchema.pre('save', async function (next) {
  if (!this.jobNumber) {
    const count = await mongoose.model('Job').countDocuments();
    this.jobNumber = `JOB-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

export default mongoose.model('Job', jobSchema);

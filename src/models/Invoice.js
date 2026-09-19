import mongoose from 'mongoose';
import Sequence from './Sequence.js';

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, unique: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName: { type: String, required: true },
  customerPhone: { type: String },
  customerEmail: { type: String },

  items: [{
    description: { type: String },
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  }],

  pricingSnapshot: {
    type: Object,
    default: {},
  },

  laborCost: { type: Number, default: 0 },
  extraCharges: { type: Number, default: 0 },
  fuelCharges: { type: Number, default: 0 },
  tollCharges: { type: Number, default: 0 },
  subtotal: { type: Number, default: 0 },
  gstRate: { type: Number, default: 10 },
  gst: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  amountPaid: { type: Number, default: 0 },

  status: { type: String, enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'], default: 'draft' },
  dueDate: { type: Date },
  paidDate: { type: Date },
  notes: { type: String },
}, { timestamps: true });

invoiceSchema.index({ jobId: 1 });
invoiceSchema.index({ status: 1, createdAt: -1 });
invoiceSchema.index({ customerName: 'text', invoiceNumber: 'text', customerEmail: 'text', customerPhone: 'text' });

invoiceSchema.pre('save', async function (next) {
  if (this.invoiceNumber) {
    return next();
  }

  try {
    const sequence = await Sequence.findOneAndUpdate(
      { name: 'invoiceNumber' },
      { $inc: { value: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    const maxInvoice = await mongoose.model('Invoice')
      .findOne({ invoiceNumber: /^INV-\d{5}$/ })
      .sort({ invoiceNumber: -1 })
      .lean();

    const maxExistingNumber = maxInvoice
      ? Number(String(maxInvoice.invoiceNumber).replace(/^INV-/, '')) || 0
      : 0;

    const nextValue = Math.max(sequence.value, maxExistingNumber + 1);
    if (nextValue !== sequence.value) {
      const updatedSequence = await Sequence.findOneAndUpdate(
        { _id: sequence._id },
        { $max: { value: nextValue } },
        { new: true },
      );
      this.invoiceNumber = `INV-${String(updatedSequence.value).padStart(5, '0')}`;
    } else {
      this.invoiceNumber = `INV-${String(sequence.value).padStart(5, '0')}`;
    }
  } catch {
    this.invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
  }

  next();
});

export default mongoose.model('Invoice', invoiceSchema);


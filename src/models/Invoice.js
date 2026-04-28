import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, unique: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
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

  laborCost: { type: Number, default: 0 },
  extraCharges: { type: Number, default: 0 },
  fuelCharges: { type: Number, default: 0 },
  tollCharges: { type: Number, default: 0 },
  subtotal: { type: Number, default: 0 },
  gstRate: { type: Number, default: 10 },
  gst: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },

  status: { type: String, enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'], default: 'draft' },
  dueDate: { type: Date },
  paidDate: { type: Date },
  notes: { type: String },
}, { timestamps: true });

invoiceSchema.index({ jobId: 1 });
invoiceSchema.index({ status: 1 });

invoiceSchema.pre('save', async function (next) {
  if (!this.invoiceNumber) {
    const count = await mongoose.model('Invoice').countDocuments();
    this.invoiceNumber = `INV-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

export default mongoose.model('Invoice', invoiceSchema);

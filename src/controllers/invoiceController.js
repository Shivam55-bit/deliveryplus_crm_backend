import PDFDocument from 'pdfkit';
import Job from '../models/Job.js';
import Invoice from '../models/Invoice.js';
import { sendResponse, sendError } from '../utils/response.js';

export const generateInvoice = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.jobId).populate('customerId');
    if (!job) return sendError(res, 404, 'Job not found.');
    if (job.status !== 'completed') return sendError(res, 400, 'Job must be completed to generate invoice.');

    // Check if invoice already exists
    if (job.invoiceId) {
      const existingInvoice = await Invoice.findById(job.invoiceId);
      if (existingInvoice) {
        return sendResponse(res, 200, { invoice: existingInvoice }, 'Invoice already exists.');
      }
    }

    const items = [];
    if (job.pricingType === 'hourly') {
      items.push({
        description: `Labor - ${job.billableHours} hours @ $${job.hourlyRate}/hr`,
        quantity: job.billableHours,
        unitPrice: job.hourlyRate,
        total: job.billing.laborCost,
      });
    } else {
      items.push({
        description: 'Fixed Quote',
        quantity: 1,
        unitPrice: job.fixedQuote,
        total: job.fixedQuote,
      });
    }

    if (job.billing.extraCharges > 0) {
      items.push({
        description: job.billing.extraChargeNotes || 'Extra Charges',
        quantity: 1,
        unitPrice: job.billing.extraCharges,
        total: job.billing.extraCharges,
      });
    }

    if (job.billing.fuelCharges > 0) {
      items.push({ description: 'Fuel Charges', quantity: 1, unitPrice: job.billing.fuelCharges, total: job.billing.fuelCharges });
    }

    if (job.billing.tollCharges > 0) {
      items.push({ description: 'Toll Charges', quantity: 1, unitPrice: job.billing.tollCharges, total: job.billing.tollCharges });
    }

    const subtotal = items.reduce((sum, item) => sum + item.total, 0) - (job.billing.discount || 0);
    const gst = Math.round(subtotal * 0.1 * 100) / 100;

    const invoice = await Invoice.create({
      jobId: job._id,
      customerId: job.customerId,
      customerName: job.customerName,
      customerPhone: job.customerPhone,
      customerEmail: job.customerEmail,
      items,
      laborCost: job.billing.laborCost,
      extraCharges: job.billing.extraCharges,
      fuelCharges: job.billing.fuelCharges,
      tollCharges: job.billing.tollCharges,
      subtotal,
      gst,
      discount: job.billing.discount || 0,
      totalAmount: subtotal + gst,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });

    job.invoiceId = invoice._id;
    await job.save();

    sendResponse(res, 201, { invoice }, 'Invoice generated.');
  } catch (error) {
    next(error);
  }
};

export const getInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate('jobId');
    if (!invoice) return sendError(res, 404, 'Invoice not found.');
    sendResponse(res, 200, { invoice });
  } catch (error) {
    next(error);
  }
};

export const getInvoices = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const total = await Invoice.countDocuments(filter);
    const invoices = await Invoice.find(filter)
      .populate('jobId', 'jobNumber customerName')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort({ createdAt: -1 });

    sendResponse(res, 200, { invoices, pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    next(error);
  }
};

export const updateInvoiceStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      { status, ...(status === 'paid' ? { paidDate: new Date() } : {}) },
      { new: true }
    );
    if (!invoice) return sendError(res, 404, 'Invoice not found.');
    sendResponse(res, 200, { invoice }, 'Invoice status updated.');
  } catch (error) {
    next(error);
  }
};

export const downloadInvoicePDF = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate('jobId');
    if (!invoice) return sendError(res, 404, 'Invoice not found.');

    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice-${invoice.invoiceNumber}.pdf"`);
    doc.pipe(res);

    // ─── Header ───────────────────────────────────────────────
    doc.fontSize(24).font('Helvetica-Bold').text('HUB CRM', 50, 50);
    doc.fontSize(10).font('Helvetica').fillColor('#555555')
      .text('Moving & Delivery Services', 50, 78);

    doc.fontSize(20).font('Helvetica-Bold').fillColor('#000000')
      .text('INVOICE', 400, 50, { align: 'right' });
    doc.fontSize(10).font('Helvetica').fillColor('#555555')
      .text(`Invoice #: ${invoice.invoiceNumber}`, 400, 78, { align: 'right' })
      .text(`Date: ${new Date(invoice.createdAt).toLocaleDateString('en-AU')}`, 400, 92, { align: 'right' })
      .text(`Due: ${new Date(invoice.dueDate).toLocaleDateString('en-AU')}`, 400, 106, { align: 'right' });

    const statusColors = { paid: '#27ae60', draft: '#95a5a6', sent: '#2980b9', overdue: '#e74c3c', cancelled: '#7f8c8d' };
    const statusColor = statusColors[invoice.status] || '#000';
    doc.roundedRect(400, 122, 145, 22, 4).fill(statusColor);
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#ffffff')
      .text(invoice.status.toUpperCase(), 400, 128, { width: 145, align: 'center' });

    // ─── Divider ──────────────────────────────────────────────
    doc.moveTo(50, 158).lineTo(545, 158).strokeColor('#cccccc').stroke();

    // ─── Bill To ──────────────────────────────────────────────
    doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold').text('BILL TO:', 50, 170);
    doc.font('Helvetica').fontSize(10).fillColor('#333333')
      .text(invoice.customerName || '-', 50, 185)
      .text(invoice.customerPhone || '', 50, 199)
      .text(invoice.customerEmail || '', 50, 213);

    if (invoice.jobId) {
      doc.font('Helvetica-Bold').fillColor('#000000').text('JOB DETAILS:', 300, 170);
      doc.font('Helvetica').fillColor('#333333')
        .text(`Job #: ${invoice.jobId.jobNumber || '-'}`, 300, 185)
        .text(`Type: ${invoice.jobId.jobType || '-'}`, 300, 199)
        .text(`Date: ${invoice.jobId.scheduledDate ? new Date(invoice.jobId.scheduledDate).toLocaleDateString('en-AU') : '-'}`, 300, 213);
    }

    // ─── Items Table ──────────────────────────────────────────
    const tableTop = 248;
    doc.moveTo(50, tableTop - 4).lineTo(545, tableTop - 4).strokeColor('#cccccc').stroke();

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#ffffff');
    doc.rect(50, tableTop, 495, 20).fill('#2c3e50');
    doc.text('DESCRIPTION', 58, tableTop + 5);
    doc.text('QTY', 330, tableTop + 5, { width: 60, align: 'right' });
    doc.text('UNIT PRICE', 390, tableTop + 5, { width: 80, align: 'right' });
    doc.text('TOTAL', 470, tableTop + 5, { width: 70, align: 'right' });

    let y = tableTop + 28;
    doc.font('Helvetica').fillColor('#333333').fontSize(9);

    invoice.items.forEach((item, i) => {
      if (i % 2 === 0) {
        doc.rect(50, y - 4, 495, 18).fill('#f9f9f9');
      }
      doc.fillColor('#333333')
        .text(item.description, 58, y, { width: 265 })
        .text(String(item.quantity), 330, y, { width: 60, align: 'right' })
        .text(`$${Number(item.unitPrice).toFixed(2)}`, 390, y, { width: 80, align: 'right' })
        .text(`$${Number(item.total).toFixed(2)}`, 470, y, { width: 70, align: 'right' });
      y += 22;
    });

    // ─── Totals ───────────────────────────────────────────────
    y += 10;
    doc.moveTo(350, y).lineTo(545, y).strokeColor('#cccccc').stroke();
    y += 12;

    const addRow = (label, value, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(bold ? '#000000' : '#555555').fontSize(9);
      doc.text(label, 350, y, { width: 110, align: 'right' });
      doc.text(value, 470, y, { width: 70, align: 'right' });
      y += 18;
    };

    addRow('Subtotal:', `$${Number(invoice.subtotal).toFixed(2)}`);
    if (invoice.discount > 0) addRow('Discount:', `-$${Number(invoice.discount).toFixed(2)}`);
    addRow(`GST (${invoice.gstRate || 10}%):`, `$${Number(invoice.gst).toFixed(2)}`);

    doc.moveTo(350, y).lineTo(545, y).strokeColor('#2c3e50').lineWidth(1.5).stroke();
    doc.lineWidth(1);
    y += 8;
    addRow('TOTAL:', `$${Number(invoice.totalAmount).toFixed(2)}`, true);

    // ─── Notes ────────────────────────────────────────────────
    if (invoice.notes) {
      y += 20;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000').text('NOTES:', 50, y);
      doc.font('Helvetica').fontSize(9).fillColor('#555555').text(invoice.notes, 50, y + 14, { width: 495 });
    }

    // ─── Footer ───────────────────────────────────────────────
    doc.moveTo(50, 760).lineTo(545, 760).strokeColor('#cccccc').stroke();
    doc.fontSize(8).font('Helvetica').fillColor('#999999')
      .text('Thank you for your business!', 50, 768, { align: 'center', width: 495 });

    doc.end();
  } catch (error) {
    next(error);
  }
};

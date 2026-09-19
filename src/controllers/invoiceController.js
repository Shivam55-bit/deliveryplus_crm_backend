import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import Job from '../models/Job.js';
import Invoice from '../models/Invoice.js';
import { sendResponse, sendError } from '../utils/response.js';
import { buildPricingSnapshot } from '../services/pricingService.js';

export const createInvoice = async (req, res, next) => {
  try {
    const {
      jobId,
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      items = [],
      laborCost = 0,
      extraCharges = 0,
      fuelCharges = 0,
      tollCharges = 0,
      gstRate = 10,
      includeGST = true,
      discount = 0,
      notes = '',
      status = 'draft',
      dueDate,
      paidDate,
      amountPaid = 0,
    } = req.body;

    if (!customerName || !customerName.trim()) {
      return sendError(res, 400, 'Customer name is required.');
    }

    let linkedJob = null;
    let cleanJobId = null;
    if (jobId && typeof jobId === 'string' && mongoose.Types.ObjectId.isValid(jobId)) {
      linkedJob = await Job.findById(jobId);
      if (linkedJob) {
        cleanJobId = linkedJob._id;
      }
    }

    const cleanItems = (Array.isArray(items) ? items : []).map((item) => {
      const quantity = Number(item.quantity || 1);
      const unitPrice = Number(item.unitPrice || 0);
      const total = item.total !== undefined ? Number(item.total) : quantity * unitPrice;
      return {
        description: item.description || '',
        quantity,
        unitPrice,
        total,
      };
    });

    const itemsTotal = cleanItems.reduce((acc, it) => acc + (it.total || 0), 0);
    const numLabor = Number(laborCost || 0);
    const numExtra = Number(extraCharges || 0);
    const numFuel = Number(fuelCharges || 0);
    const numToll = Number(tollCharges || 0);
    const calculatedSubtotal = itemsTotal + numLabor + numExtra + numFuel + numToll;

    const subtotal = req.body.subtotal !== undefined ? Number(req.body.subtotal) : calculatedSubtotal;
    const effectiveGstRate = Number(gstRate !== undefined ? gstRate : 10);
    const rateMultiplier = effectiveGstRate > 1 ? effectiveGstRate / 100 : effectiveGstRate;
    const gst = req.body.gst !== undefined ? Number(req.body.gst) : (includeGST ? subtotal * rateMultiplier : 0);
    const numDiscount = Number(discount || 0);
    const totalAmount = req.body.totalAmount !== undefined ? Number(req.body.totalAmount) : (subtotal + gst - numDiscount);

    const invoice = await Invoice.create({
      jobId: cleanJobId || undefined,
      customerId: customerId && mongoose.Types.ObjectId.isValid(customerId) ? customerId : (linkedJob?.customerId || undefined),
      customerName: customerName.trim(),
      customerPhone: customerPhone || linkedJob?.customerPhone || '',
      customerEmail: customerEmail || linkedJob?.customerEmail || '',
      items: cleanItems,
      laborCost: numLabor,
      extraCharges: numExtra,
      fuelCharges: numFuel,
      tollCharges: numToll,
      subtotal,
      gstRate: effectiveGstRate,
      gst,
      discount: numDiscount,
      totalAmount,
      amountPaid: Number(amountPaid || 0),
      status: status || 'draft',
      dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      paidDate: paidDate ? new Date(paidDate) : (status === 'paid' ? new Date() : undefined),
      notes: notes || '',
    });

    if (linkedJob) {
      linkedJob.invoiceId = invoice._id;
      await linkedJob.save();
    }

    sendResponse(res, 201, { invoice }, 'Invoice created successfully.');
  } catch (error) {
    next(error);
  }
};

export const updateInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return sendError(res, 404, 'Invoice not found.');

    const {
      customerName,
      customerPhone,
      customerEmail,
      items,
      laborCost,
      extraCharges,
      fuelCharges,
      tollCharges,
      gstRate,
      includeGST,
      discount,
      status,
      dueDate,
      paidDate,
      notes,
      amountPaid,
      jobId,
    } = req.body;

    if (customerName !== undefined) invoice.customerName = customerName.trim();
    if (customerPhone !== undefined) invoice.customerPhone = customerPhone;
    if (customerEmail !== undefined) invoice.customerEmail = customerEmail;
    if (notes !== undefined) invoice.notes = notes;
    if (amountPaid !== undefined) invoice.amountPaid = Number(amountPaid);

    if (jobId !== undefined) {
      if (jobId && typeof jobId === 'string' && mongoose.Types.ObjectId.isValid(jobId)) {
        invoice.jobId = jobId;
        await Job.findByIdAndUpdate(jobId, { invoiceId: invoice._id });
      } else if (!jobId) {
        if (invoice.jobId) {
          await Job.findByIdAndUpdate(invoice.jobId, { $unset: { invoiceId: 1 } });
        }
        invoice.jobId = undefined;
      }
    }

    if (items !== undefined) {
      invoice.items = (Array.isArray(items) ? items : []).map((item) => ({
        description: item.description || '',
        quantity: Number(item.quantity || 1),
        unitPrice: Number(item.unitPrice || 0),
        total: item.total !== undefined ? Number(item.total) : Number(item.quantity || 1) * Number(item.unitPrice || 0),
      }));
    }

    if (laborCost !== undefined) invoice.laborCost = Number(laborCost);
    if (extraCharges !== undefined) invoice.extraCharges = Number(extraCharges);
    if (fuelCharges !== undefined) invoice.fuelCharges = Number(fuelCharges);
    if (tollCharges !== undefined) invoice.tollCharges = Number(tollCharges);
    if (discount !== undefined) invoice.discount = Number(discount);
    if (gstRate !== undefined) invoice.gstRate = Number(gstRate);

    // Recalculate totals
    const itemsTotal = (invoice.items || []).reduce((acc, it) => acc + (it.total || 0), 0);
    const subtotal = req.body.subtotal !== undefined
      ? Number(req.body.subtotal)
      : (itemsTotal + Number(invoice.laborCost || 0) + Number(invoice.extraCharges || 0) + Number(invoice.fuelCharges || 0) + Number(invoice.tollCharges || 0));
    invoice.subtotal = subtotal;

    const effectiveGstRate = Number(invoice.gstRate ?? 10);
    const rateMultiplier = effectiveGstRate > 1 ? effectiveGstRate / 100 : effectiveGstRate;
    const gst = req.body.gst !== undefined
      ? Number(req.body.gst)
      : (includeGST === false ? 0 : subtotal * rateMultiplier);
    invoice.gst = gst;

    const totalAmount = req.body.totalAmount !== undefined
      ? Number(req.body.totalAmount)
      : (subtotal + gst - Number(invoice.discount || 0));
    invoice.totalAmount = totalAmount;

    if (status !== undefined) {
      invoice.status = status;
      if (status === 'paid' && !invoice.paidDate) {
        invoice.paidDate = new Date();
      }
    }

    if (dueDate !== undefined) invoice.dueDate = dueDate ? new Date(dueDate) : undefined;
    if (paidDate !== undefined) invoice.paidDate = paidDate ? new Date(paidDate) : undefined;

    await invoice.save();
    const populated = await Invoice.findById(invoice._id).populate('jobId');

    sendResponse(res, 200, { invoice: populated }, 'Invoice updated successfully.');
  } catch (error) {
    next(error);
  }
};

export const deleteInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return sendError(res, 404, 'Invoice not found.');

    if (invoice.jobId) {
      await Job.findByIdAndUpdate(invoice.jobId, { $unset: { invoiceId: 1 } });
    }

    await Invoice.findByIdAndDelete(req.params.id);
    sendResponse(res, 200, {}, 'Invoice deleted successfully.');
  } catch (error) {
    next(error);
  }
};

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

    const pricingSnapshot = buildPricingSnapshot({
      ...(job.toObject ? job.toObject() : job),
      pricing: job.pricing ?? job.pricingSnapshot,
      totalWorkedMinutes: job.totalWorkedMinutes ?? job.actualDurationMinutes ?? 0,
      billing: job.billing ?? {},
    });

    const items = [];
    if (job.pricingType === 'hourly') {
      items.push({
        description: 'Minimum Labour Charge',
        quantity: pricingSnapshot.minimumChargeHours || 2,
        unitPrice: pricingSnapshot.hourlyRate || 0,
        total: pricingSnapshot.minimumLaborCharge || 0,
      });

      if (pricingSnapshot.calloutCharge > 0) {
        items.push({
          description: 'Callout Charge',
          quantity: 1,
          unitPrice: pricingSnapshot.calloutCharge,
          total: pricingSnapshot.calloutCharge,
        });
      }

      if (pricingSnapshot.travelBackCharge > 0) {
        items.push({
          description: 'Travel Back Charge',
          quantity: 1,
          unitPrice: pricingSnapshot.travelBackCharge,
          total: pricingSnapshot.travelBackCharge,
        });
      }

      if (pricingSnapshot.extraTimeCharge > 0) {
        items.push({
          description: `Extra Time Charge (${pricingSnapshot.extraTimeBlocks || 0} x ${pricingSnapshot.extraTimeBlockMinutes || 15} mins)`,
          quantity: pricingSnapshot.extraTimeBlocks || 1,
          unitPrice: pricingSnapshot.extraTimeRatePerBlock || 0,
          total: pricingSnapshot.extraTimeCharge,
        });
      }
    } else {
      items.push({
        description: 'Fixed Quote',
        quantity: 1,
        unitPrice: job.fixedQuote || 0,
        total: job.fixedQuote || 0,
      });
    }

    if (Number(job.billing?.fuelCharges || 0) > 0) {
      items.push({ description: 'Fuel Charges', quantity: 1, unitPrice: job.billing.fuelCharges, total: job.billing.fuelCharges });
    }

    if (Number(job.billing?.tollCharges || 0) > 0) {
      items.push({ description: 'Toll Charges', quantity: 1, unitPrice: job.billing.tollCharges, total: job.billing.tollCharges });
    }

    const subtotal = Number(pricingSnapshot.subtotal || 0);
    const gst = Number(pricingSnapshot.gst || 0);
    const totalAmount = Number(pricingSnapshot.grandTotal || 0);
    const amountPaid = Number(pricingSnapshot.amountPaid || job.amountReceived || 0);

    const invoice = await Invoice.create({
      jobId: job._id,
      customerId: job.customerId?._id || job.customerId,
      customerName: job.customerName,
      customerPhone: job.customerPhone,
      customerEmail: job.customerEmail,
      items,
      pricingSnapshot,
      laborCost: pricingSnapshot.minimumLaborCharge || 0,
      extraCharges: pricingSnapshot.extraTimeCharge || 0,
      fuelCharges: Number(job.billing?.fuelCharges || 0),
      tollCharges: Number(job.billing?.tollCharges || 0),
      subtotal,
      gst,
      discount: Number(job.billing?.discount || 0),
      totalAmount,
      amountPaid,
      status: amountPaid >= totalAmount && totalAmount > 0 ? 'paid' : 'draft',
      paidDate: amountPaid >= totalAmount && totalAmount > 0 ? new Date() : undefined,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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
    const { page = 1, limit = 20, status, search, jobId } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (jobId && mongoose.Types.ObjectId.isValid(jobId)) filter.jobId = jobId;

    if (search && search.trim()) {
      const s = search.trim();
      filter.$or = [
        { invoiceNumber: { $regex: s, $options: 'i' } },
        { customerName: { $regex: s, $options: 'i' } },
        { customerEmail: { $regex: s, $options: 'i' } },
        { customerPhone: { $regex: s, $options: 'i' } },
      ];
    }

    const total = await Invoice.countDocuments(filter);
    const invoices = await Invoice.find(filter)
      .populate('jobId', 'jobNumber customerName customerPhone customerEmail jobType scheduledDate scheduledStartTime pickupAddress dropAddress')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort({ createdAt: -1 });

    sendResponse(res, 200, {
      invoices,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
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
    ).populate('jobId');
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
    res.setHeader('Content-Disposition', `attachment; filename="Invoice-${invoice.invoiceNumber || 'INV'}.pdf"`);
    doc.pipe(res);

    // ─── Header ───────────────────────────────────────────────
    doc.fontSize(24).font('Helvetica-Bold').text('HUB CRM', 50, 50);
    doc.fontSize(10).font('Helvetica').fillColor('#555555')
      .text('Moving & Delivery Services', 50, 78);

    doc.fontSize(20).font('Helvetica-Bold').fillColor('#000000')
      .text('INVOICE', 400, 50, { align: 'right' });
    doc.fontSize(10).font('Helvetica').fillColor('#555555')
      .text(`Invoice #: ${invoice.invoiceNumber || 'N/A'}`, 400, 78, { align: 'right' })
      .text(`Date: ${invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString('en-AU') : '-' }`, 400, 92, { align: 'right' })
      .text(`Due: ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-AU') : '-'}`, 400, 106, { align: 'right' });

    const statusColors = { paid: '#27ae60', draft: '#95a5a6', sent: '#2980b9', overdue: '#e74c3c', cancelled: '#7f8c8d' };
    const statusColor = statusColors[invoice.status] || '#000';
    doc.roundedRect(400, 122, 145, 22, 4).fill(statusColor);
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#ffffff')
      .text((invoice.status || 'draft').toUpperCase(), 400, 128, { width: 145, align: 'center' });

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

    const isMovingInvoice = invoice.jobId?.jobType === 'moving';
    if (isMovingInvoice && invoice.jobId) {
      const movingJob = invoice.jobId;
      const movingItems = [
        movingJob.items,
        movingJob.lineItems,
        movingJob.itemList,
        movingJob.lineItemsText,
        movingJob.movingItems,
        movingJob.inventory,
        movingJob.jobItems,
      ].find((value) => (
        (Array.isArray(value) && value.length > 0) ||
        (typeof value === 'string' && value.trim().length > 0)
      ));
      const itemList = Array.isArray(movingItems)
        ? movingItems.map((item) => {
          const description = String(item?.description ?? item?.name ?? item?.title ?? item?.item ?? '').trim();
          const quantity = Number(item?.quantity);
          return description
            ? `${description}${Number.isFinite(quantity) && quantity > 1 ? ` x ${quantity}` : ''}`
            : '';
        }).filter(Boolean).join(', ')
        : typeof movingItems === 'string'
          ? movingItems.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean).join(', ')
          : '';
      const movingValue = (value) => value === null || value === undefined || value === '' ? 'Not provided' : String(value);

      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000').text('MOVING SERVICE', 50, 230);
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#555555').text('MOVING DETAILS', 50, 244);
      doc.font('Helvetica').fillColor('#333333')
        .text(`TRUCK SIZE: ${movingValue(movingJob.truckSize ?? movingJob.truckSizeCount ?? movingJob.vehicleSize ?? movingJob.truckType)}`, 50, 260)
        .text(`MOVERS: ${movingValue(movingJob.movers ?? movingJob.numberOfMovers ?? movingJob.moverCount)}`, 300, 260)
        .text(`SIZE OF PROPERTY: ${movingValue(movingJob.propertySize ?? movingJob.sizeOfProperty ?? movingJob.bedrooms ?? movingJob.houseSize ?? movingJob.moveSize)}`, 50, 276)
        .text(`LIST OF ITEMS: ${movingValue(itemList)}`, 300, 276, { width: 245 });
    }

    // ─── Items Table ──────────────────────────────────────────
    const tableTop = isMovingInvoice ? 310 : 248;
    let y = tableTop + 28;

    if (!isMovingInvoice) {
      doc.moveTo(50, tableTop - 4).lineTo(545, tableTop - 4).strokeColor('#cccccc').stroke();

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#ffffff');
      doc.rect(50, tableTop, 495, 20).fill('#2c3e50');
      doc.text('DESCRIPTION', 58, tableTop + 5);
      doc.text('QTY', 330, tableTop + 5, { width: 60, align: 'right' });
      doc.text('UNIT PRICE', 390, tableTop + 5, { width: 80, align: 'right' });
      doc.text('TOTAL', 470, tableTop + 5, { width: 70, align: 'right' });

      doc.font('Helvetica').fillColor('#333333').fontSize(9);
      (invoice.items || []).forEach((item, i) => {
        if (i % 2 === 0) {
          doc.rect(50, y - 4, 495, 18).fill('#f9f9f9');
        }
        doc.fillColor('#333333')
          .text(item.description || '-', 58, y, { width: 265 })
          .text(String(item.quantity || 1), 330, y, { width: 60, align: 'right' })
          .text(`$${Number(item.unitPrice || 0).toFixed(2)}`, 390, y, { width: 80, align: 'right' })
          .text(`$${Number(item.total || 0).toFixed(2)}`, 470, y, { width: 70, align: 'right' });
        y += 22;
      });
    }

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

    const pricingSnapshot = invoice.pricingSnapshot || {};
    const invoiceSubtotal = Number(pricingSnapshot.subtotal ?? invoice.subtotal ?? 0);
    const invoiceGST = Number(pricingSnapshot.gst ?? invoice.gst ?? 0);
    const invoiceTotal = Number(pricingSnapshot.grandTotal ?? invoice.totalAmount ?? 0);
    const invoiceAmountPaid = Number(pricingSnapshot.amountPaid ?? invoice.amountPaid ?? 0);
    const invoiceBalanceDue = Math.max(0, invoiceTotal - invoiceAmountPaid);

    if (invoice.laborCost > 0) addRow('Labor Cost:', `$${Number(invoice.laborCost).toFixed(2)}`);
    if (invoice.extraCharges > 0) addRow('Extra Charges:', `$${Number(invoice.extraCharges).toFixed(2)}`);
    if (invoice.fuelCharges > 0) addRow('Fuel Charges:', `$${Number(invoice.fuelCharges).toFixed(2)}`);
    if (invoice.tollCharges > 0) addRow('Toll Charges:', `$${Number(invoice.tollCharges).toFixed(2)}`);
    addRow('Subtotal:', `$${invoiceSubtotal.toFixed(2)}`);
    if (invoice.discount > 0) addRow('Discount:', `-$${Number(invoice.discount).toFixed(2)}`);
    addRow('GST:', `$${invoiceGST.toFixed(2)}`);

    doc.moveTo(350, y).lineTo(545, y).strokeColor('#2c3e50').lineWidth(1.5).stroke();
    doc.lineWidth(1);
    y += 8;
    addRow('TOTAL:', `$${invoiceTotal.toFixed(2)}`, true);
    if (invoiceAmountPaid > 0) {
      addRow('Amount Paid:', `$${invoiceAmountPaid.toFixed(2)}`);
      addRow('Balance Due:', `$${invoiceBalanceDue.toFixed(2)}`, true);
    }

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

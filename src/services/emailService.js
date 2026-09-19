import { sendMail } from '../utils/mailer.js';
import { buildQuotationEmail, buildBookingConfirmationEmail } from '../utils/emailTemplates.js';
import { renderEmailTemplate } from './templateRenderer.js';

const resolveAdminRecipients = () => {
  const raw = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
};

const buildCompletionDocumentEmailBody = (job) => {
  const safeValue = (value, fallback = 'N/A') => (value === undefined || value === null || value === '' ? fallback : String(value));
  const formatDate = (value) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return safeValue(value);
    return date.toISOString().slice(0, 10);
  };

  const summary = job.completionDocuments?.summary || {
    jobNumber: job.jobNumber,
    customerName: job.customerName,
    customerPhone: job.customerPhone,
    customerEmail: job.customerEmail,
    completedAt: job.completedAt,
    paymentMethod: job.paymentMethod,
    amountReceived: job.amountReceived,
    paymentProofUrl: job.paymentProofUrl,
    paymentTransactionReference: job.paymentTransactionReference,
  };

  return {
    subject: `Completion documents for job ${job.jobNumber}`,
    text: [
      `Job completion documents received for ${job.jobNumber}.`,
      `Customer: ${safeValue(summary.customerName)}`,
      `Phone: ${safeValue(summary.customerPhone)}`,
      `Email: ${safeValue(summary.customerEmail)}`,
      `Completed: ${formatDate(summary.completedAt)}`,
      `Payment Method: ${safeValue(summary.paymentMethod)}`,
      `Amount Received: ${safeValue(summary.amountReceived, '0')}`,
      `Signature: ${safeValue(job.endSignature, 'Not uploaded')}`,
      `Payment Proof: ${safeValue(job.paymentProofUrl, 'Not uploaded')}`,
      `Transaction Reference: ${safeValue(summary.paymentTransactionReference, 'Not provided')}`,
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;">
        <h2 style="margin:0 0 12px;">Completion documents received</h2>
        <p style="margin:0 0 12px;">Job <strong>${safeValue(job.jobNumber)}</strong> has been completed and the admin completion document packet is ready for review.</p>
        <ul style="padding-left:18px;">
          <li><strong>Customer:</strong> ${safeValue(summary.customerName)}</li>
          <li><strong>Phone:</strong> ${safeValue(summary.customerPhone)}</li>
          <li><strong>Email:</strong> ${safeValue(summary.customerEmail)}</li>
          <li><strong>Completed:</strong> ${formatDate(summary.completedAt)}</li>
          <li><strong>Payment Method:</strong> ${safeValue(summary.paymentMethod)}</li>
          <li><strong>Amount Received:</strong> ${safeValue(summary.amountReceived, '0')}</li>
          <li><strong>Signature:</strong> ${safeValue(job.endSignature, 'Not uploaded')}</li>
          <li><strong>Payment Proof:</strong> ${safeValue(job.paymentProofUrl, 'Not uploaded')}</li>
          <li><strong>Transaction Reference:</strong> ${safeValue(summary.paymentTransactionReference, 'Not provided')}</li>
        </ul>
      </div>
    `,
  };
};

export const verifyEmailTransport = async () => {
  try {
    const verified = await import('../utils/mailer.js').then((module) => module.verifyMailer());
    return verified;
  } catch (error) {
    console.error('Email transport verification failed', {
      code: error.code,
      message: error.message,
    });
    return false;
  }
};

export const sendQuotationEmail = async ({ job, to, attachments = [] }) => {
  let template;
  try {
    template = await renderEmailTemplate('quotation', job, { attachments });
  } catch (renderError) {
    console.error('Template renderer error in sendQuotationEmail, using default fallback', renderError);
    template = buildQuotationEmail(job, { attachments });
  }

  try {
    const info = await sendMail({
      to,
      subject: template.subject,
      text: template.text,
      html: template.html,
      attachments: template.attachments,
    });

    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error('Quotation email failed', {
      message: error.message,
      code: error.code,
      responseCode: error.responseCode,
    });

    throw new Error(error.message || 'Unable to send quotation email');
  }
};

export const sendBookingConfirmationEmail = async ({ job, to, bookingDepositAmount, attachments = [] }) => {
  let template;
  try {
    template = await renderEmailTemplate('booking_confirmation', { ...job, bookingDepositAmount }, { attachments });
  } catch (renderError) {
    console.error('Template renderer error in sendBookingConfirmationEmail, using default fallback', renderError);
    template = buildBookingConfirmationEmail({ ...job, bookingDepositAmount }, { attachments });
  }

  try {
    const info = await sendMail({
      to,
      subject: template.subject,
      text: template.text,
      html: template.html,
      attachments: template.attachments,
    });

    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error('Booking confirmation email failed', {
      message: error.message,
      code: error.code,
      responseCode: error.responseCode,
    });

    throw new Error(error.message || 'Unable to send booking confirmation email');
  }
};

export const sendCompletionDocumentsEmail = async ({ job, to }) => {
  const recipients = Array.isArray(to)
    ? to
    : String(to || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

  if (recipients.length === 0) {
    const fallback = resolveAdminRecipients();
    if (fallback.length === 0) {
      throw new Error('No admin recipient configured for completion document email');
    }
    recipients.push(...fallback);
  }

  const payload = buildCompletionDocumentEmailBody(job);

  try {
    const info = await sendMail({
      to: recipients.join(','),
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });

    return { sent: true, messageId: info.messageId, recipients };
  } catch (error) {
    console.error('Completion document email failed', {
      jobId: job?._id,
      jobNumber: job?.jobNumber,
      message: error.message,
      code: error.code,
      responseCode: error.responseCode,
    });

    throw new Error(error.message || 'Unable to send completion document email');
  }
};

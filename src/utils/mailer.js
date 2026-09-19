import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const normalizeEmailPassword = () => {
  const password = process.env.EMAIL_PASS;
  if (typeof password !== 'string') return '';
  return password.replace(/\s+/g, '').trim();
};

const getSenderAddress = () => process.env.EMAIL_FROM_EMAIL || process.env.EMAIL_USER || 'deliveryplus09@gmail.com';
const getReplyToAddress = () => process.env.EMAIL_FROM_EMAIL || process.env.EMAIL_USER || 'deliveryplus09@gmail.com';
const getPort = () => Number.parseInt(process.env.EMAIL_PORT || '587', 10);
const isSecure = () => String(process.env.EMAIL_SECURE || 'false').toLowerCase() === 'true';

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: getPort(),
  secure: isSecure(),
  auth: {
    user: process.env.EMAIL_USER || '',
    pass: normalizeEmailPassword(),
  },
  pool: {
    maxConnections: 1,
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: 5,
  },
});

export const verifyMailer = async () => {
  try {
    await transporter.verify();
    console.log('Email transporter is ready');
    return true;
  } catch (error) {
    console.error('Email transporter verification failed:', error);
    return false;
  }
};

export const sendMail = async ({
  to,
  subject,
  text,
  html,
  cc,
  bcc,
  attachments,
}) => {
  if (!to) {
    throw new Error('Email recipient is required');
  }

  const senderAddress = getSenderAddress();
  const senderName = process.env.EMAIL_FROM_NAME || 'Delivery Plus';
  const replyToAddress = getReplyToAddress();
  const emailPassword = normalizeEmailPassword();
  const emailUser = String(process.env.EMAIL_USER || '').trim();

  if (!emailUser || !senderAddress || !emailPassword) {
    const error = new Error('SMTP credentials are not configured');
    error.code = 'ECONFIG';
    throw error;
  }

  const fromAddress = senderAddress;
  const mailOptions = {
    from: {
      name: senderName,
      address: fromAddress,
    },
    replyTo: replyToAddress,
    to,
    subject: subject || 'Delivery Plus Notification',
    text,
    html,
    cc,
    bcc,
    envelope: {
      from: emailUser,
      to,
    },
    attachments: Array.isArray(attachments) && attachments.length > 0 ? attachments : undefined,
  };

  if (fromAddress !== emailUser) {
    mailOptions.sender = emailUser;
  }

  Object.keys(mailOptions).forEach((key) => {
    if (mailOptions[key] === undefined) {
      delete mailOptions[key];
    }
  });

  try {
    return await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('SMTP send failed:', error);
    const smtpError = new Error('SMTP connection failed. Unable to send email.');
    smtpError.code = error?.code || 'ESMTP';
    smtpError.responseCode = error?.responseCode;
    smtpError.originalError = error;
    throw smtpError;
  }
};

export default transporter;

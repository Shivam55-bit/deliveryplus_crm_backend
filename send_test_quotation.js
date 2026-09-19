import { buildQuotationEmail } from './src/utils/emailTemplates.js';
import { sendMail } from './src/utils/mailer.js';

const run = async () => {
  try {
    const job = {
      customerName: 'Test Recipient',
      customerPhone: '0412345678',
      customerEmail: 'shivamshishodia5541@gmail.com',
      pickupAddress: '123 Test St, Melbourne VIC 3000',
      dropAddress: '456 Demo Rd, Melbourne VIC 3000',
      jobType: 'moving',
      scheduledDate: '2026-08-22T00:00:00Z',
      scheduledTime: '09:00',
      hourlyRate: 65,
      truckSize: '4.5 Tonne (2-Bedroom Moving Truck)',
      movers: 2,
      propertySize: '2 Bedroom Home',
      callOutFee: 50,
      callOutTimeHr: 1,
      callOutTimeMin: 30,
      items: [
        { description: 'Boxes (Packed)', quantity: 10 },
        { description: 'Sofa 3-Seater', quantity: 1 },
        { description: 'Queen Bed & Mattress', quantity: 1 },
        { description: 'Dining Table + 4 Chairs', quantity: 1 }
      ],
      quoteRef: 'TEST-EMAIL-001',
    };

    const { subject, html, attachments, text } = buildQuotationEmail(job, { attachments: [] });

    console.log('Sending test quotation to:', job.customerEmail);

    const info = await sendMail({
      to: job.customerEmail,
      subject,
      text,
      html,
      attachments,
    });

    console.log('Email send result:', info && info.messageId ? info.messageId : info);
  } catch (err) {
    console.error('Failed to send test quotation:', err);
    process.exitCode = 1;
  }
};

run();

import dotenv from 'dotenv';
import { sendMail } from '../src/utils/mailer.js';

dotenv.config();

const run = async () => {
  try {
    const to = process.env.EMAIL_TEST_TO || process.env.EMAIL_USER;
    if (!to) {
      throw new Error('No test recipient configured');
    }

    const result = await sendMail({
      to,
      subject: 'Delivery Plus Email Test',
      text: 'Delivery Plus email configuration is working.',
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>Delivery Plus</h2>
          <p>Email configuration is working successfully.</p>
        </div>
      `,
    });

    console.log('Email test sent successfully', { messageId: result.messageId });
  } catch (error) {
    console.error('Email test failed', {
      code: error.code,
      message: error.message,
    });
    process.exitCode = 1;
  }
};

run();

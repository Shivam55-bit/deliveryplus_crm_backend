import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Job from '../src/models/Job.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const check = async () => {
  const mongoUri = 'mongodb://localhost:27017/hub-crm';
  console.log('Connecting to', mongoUri);
  await mongoose.connect(mongoUri);

  try {
    const jobs = await Job.find({}).lean();
    console.log('=== TOTAL JOBS IN DB ===', jobs.length);
    for (const j of jobs) {
      console.log({
        jobNumber: j.jobNumber,
        customerName: j.customerName,
        bookingStatus: j.bookingStatus,
        status: j.status,
        quotationStatus: j.quotation?.status,
        quotationSent: j.quotationSent,
        confirmationSent: j.confirmationSent,
      });
    }
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
};

check();

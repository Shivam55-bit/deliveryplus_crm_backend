import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Job from '../src/models/Job.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const migrate = async () => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/hub_crm';
  console.log('[MIGRATION] Connecting to MongoDB:', mongoUri);
  await mongoose.connect(mongoUri);

  try {
    const totalJobs = await Job.countDocuments();
    console.log(`[MIGRATION] Total jobs in database: ${totalJobs}`);

    // Update jobs without bookingStatus
    const unmigrated = await Job.find({
      $or: [
        { bookingStatus: { $exists: false } },
        { bookingStatus: null },
      ],
    });

    console.log(`[MIGRATION] Jobs needing migration: ${unmigrated.length}`);

    let quotationCount = 0;
    let confirmedCount = 0;

    for (const job of unmigrated) {
      const isQuotation = job.quotationSent && !job.confirmationSent && (!job.assignedDrivers || job.assignedDrivers.length === 0) && job.status === 'pending';
      const bookingStatus = isQuotation ? 'quotation' : 'confirmed';

      job.bookingStatus = bookingStatus;
      job.quotation = job.quotation || {
        status: job.quotationSent ? 'sent' : 'draft',
        sentAt: job.quotationSentAt || null,
        viewedAt: null,
        expiresAt: null,
        acceptedAt: isQuotation ? null : job.createdAt,
        rejectedAt: null,
      };
      job.confirmation = job.confirmation || {
        confirmedAt: isQuotation ? null : (job.confirmationSentAt || job.createdAt),
        confirmedBy: null,
        emailSent: Boolean(job.confirmationSent),
        emailSentAt: job.confirmationSentAt || null,
        messageId: null,
        error: null,
      };

      await job.save();

      if (isQuotation) {
        quotationCount++;
      } else {
        confirmedCount++;
      }
    }

    console.log(`[MIGRATION] Completed! Quotations: ${quotationCount}, Confirmed: ${confirmedCount}`);

    const finalQuotations = await Job.countDocuments({ bookingStatus: 'quotation' });
    const finalConfirmed = await Job.countDocuments({ bookingStatus: 'confirmed' });
    console.log(`[MIGRATION] Final DB state -> Quotation jobs: ${finalQuotations}, Confirmed jobs: ${finalConfirmed}`);
  } catch (error) {
    console.error('[MIGRATION] Error during migration:', error);
  } finally {
    await mongoose.disconnect();
    console.log('[MIGRATION] Disconnected from MongoDB');
  }
};

migrate();

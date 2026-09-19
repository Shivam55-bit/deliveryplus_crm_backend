import mongoose from 'mongoose';
import config from '../src/config/index.js';
import Sequence from '../src/models/Sequence.js';
import Job from '../src/models/Job.js';

const run = async () => {
  try {
    await mongoose.connect(config.mongoUri);
    console.log('Connected to', config.mongoUri);
    const seq = await Sequence.findOne({ name: 'jobNumber' }).lean();
    console.log('Sequence:', seq);
    const maxJob = await Job.find({ jobNumber: /^JOB-\d{5}$/ }).sort({ jobNumber: -1 }).limit(10).lean();
    console.log('Latest jobs:');
    maxJob.forEach((j) => console.log(j.jobNumber, j._id.toString()));
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
};

run();

import mongoose from 'mongoose';
import config from './index.js';
import User from '../models/User.js';

const ensureDefaultAdmin = async () => {
  const email = 'admin@hubcrm.com';
  const existingAdmin = await User.findOne({ email });

  if (!existingAdmin) {
    console.log('[AUTH] Default admin missing, creating admin@hubcrm.com');
    await User.create({
      name: 'Super Admin',
      email,
      password: 'admin123',
      role: 'super_admin',
      phone: '0400000000',
      isActive: true,
    });
    console.log('[AUTH] Default admin created successfully');
  } else {
    console.log('[AUTH] Default admin already exists');
  }
};

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongoUri);
    console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
    await ensureDefaultAdmin();
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;

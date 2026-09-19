import mongoose from 'mongoose';
import config from '../config/index.js';
import User from '../models/User.js';

const seed = async () => {
  try {
    await mongoose.connect(config.mongoUri);
    console.log('Connected to MongoDB');

    const defaultAdmin = {
      name: 'Super Admin',
      email: 'admin@hubcrm.com',
      password: 'admin123',
      role: 'admin',
      phone: '0400000000',
      isActive: true,
    };

    const existingAdmin = await User.findOne({ email: defaultAdmin.email });
    if (!existingAdmin) {
      await User.create(defaultAdmin);
      console.log('Default admin created: admin@hubcrm.com / admin123');
    } else {
      console.log('Default admin already exists, no changes made.');
    }

    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

seed();

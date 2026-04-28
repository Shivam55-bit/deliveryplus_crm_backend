import mongoose from 'mongoose';
import config from '../config/index.js';
import User from '../models/User.js';
import Driver from '../models/Driver.js';
import Customer from '../models/Customer.js';
import Vehicle from '../models/Vehicle.js';
import Job from '../models/Job.js';

const seed = async () => {
  try {
    await mongoose.connect(config.mongoUri);
    console.log('Connected to MongoDB');

    // Clear existing data
    await Promise.all([
      User.deleteMany({}),
      Driver.deleteMany({}),
      Customer.deleteMany({}),
      Vehicle.deleteMany({}),
      Job.deleteMany({}),
    ]);

    // Create admin
    const admin = await User.create({
      name: 'Admin User',
      email: 'admin@hubcrm.com',
      password: 'admin123',
      role: 'admin',
      phone: '0400000000',
    });

    // Create drivers
    const driverUsers = await User.create([
      { name: 'John Driver', email: 'john@hubcrm.com', password: 'driver123', role: 'driver', phone: '0411111111' },
      { name: 'Mike Driver', email: 'mike@hubcrm.com', password: 'driver123', role: 'driver', phone: '0422222222' },
      { name: 'Sarah Driver', email: 'sarah@hubcrm.com', password: 'driver123', role: 'driver', phone: '0433333333' },
    ]);

    const drivers = await Driver.create(
      driverUsers.map(u => ({
        userId: u._id,
        licenseNumber: `DL${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        vehicleTypes: ['van', 'truck'],
        availability: 'available',
      }))
    );

    // Create customers
    const customers = await Customer.create([
      { name: 'Alice Johnson', email: 'alice@example.com', phone: '0455551234', address: '123 Main St, Sydney', source: 'website' },
      { name: 'Bob Smith', email: 'bob@example.com', phone: '0455555678', address: '456 Oak Ave, Melbourne', source: 'referral' },
      { name: 'Carol White', email: 'carol@example.com', phone: '0455559012', address: '789 Pine Rd, Brisbane', source: 'phone' },
      { name: 'David Brown', email: 'david@example.com', phone: '0455553456', address: '321 Elm St, Perth', source: 'direct' },
    ]);

    // Create vehicles
    const vehicles = await Vehicle.create([
      { name: 'Van 1', type: 'van', registration: 'VAN001', capacity: '1.5 ton' },
      { name: 'Truck 1', type: 'truck', registration: 'TRK001', capacity: '5 ton' },
      { name: 'Ute 1', type: 'ute', registration: 'UTE001', capacity: '0.5 ton' },
    ]);

    // Create sample jobs (sequentially to avoid jobNumber race condition)
    const now = new Date();
    await Job.create({
      customerName: 'Alice Johnson', customerPhone: '0455551234', customerId: customers[0]._id,
      pickupAddress: '123 Main St, Sydney', dropAddress: '789 George St, Sydney',
      jobType: 'delivery', scheduledDate: new Date(now.getTime() + 86400000),
      pricingType: 'hourly', hourlyRate: 85, estimatedHours: 3, status: 'pending',
      notes: 'Fragile items - handle with care',
    });
    await Job.create({
      customerName: 'Bob Smith', customerPhone: '0455555678', customerId: customers[1]._id,
      pickupAddress: '456 Oak Ave, Melbourne', dropAddress: '100 Collins St, Melbourne',
      jobType: 'moving', scheduledDate: new Date(now.getTime() + 172800000),
      pricingType: 'fixed', fixedQuote: 650, status: 'assigned',
      assignedDrivers: [driverUsers[0]._id], assignedVehicle: vehicles[1]._id,
      notes: '3rd floor, no elevator. Stairs access.',
    });
    await Job.create({
      customerName: 'Carol White', customerPhone: '0455559012', customerId: customers[2]._id,
      pickupAddress: '789 Pine Rd, Brisbane', dropAddress: '50 Queen St, Brisbane',
      jobType: 'delivery', scheduledDate: now,
      pricingType: 'hourly', hourlyRate: 75, estimatedHours: 2, status: 'completed',
      assignedDrivers: [driverUsers[1]._id], assignedVehicle: vehicles[0]._id,
      timerStarted: new Date(now.getTime() - 7200000), timerEnded: new Date(now.getTime() - 200000),
      billableHours: 1.97, totalWorkedMinutes: 118,
      billing: { laborCost: 147.75, extraCharges: 0, fuelCharges: 15, tollCharges: 0, gst: 16.28, totalAmount: 179.03 },
    });
    await Job.create({
      customerName: 'David Brown', customerPhone: '0455553456', customerId: customers[3]._id,
      pickupAddress: '321 Elm St, Perth', dropAddress: '200 Hay St, Perth',
      jobType: 'moving', scheduledDate: new Date(now.getTime() + 259200000),
      pricingType: 'hourly', hourlyRate: 95, estimatedHours: 5, status: 'pending',
      priority: 'high',
      notes: 'Large furniture items. 2 drivers needed.',
    });

    console.log('Seed data created successfully!');
    console.log('Admin: admin@hubcrm.com / admin123');
    console.log('Driver: john@hubcrm.com / driver123');
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

seed();

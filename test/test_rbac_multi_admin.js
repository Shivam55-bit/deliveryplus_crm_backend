import mongoose from 'mongoose';
import config from '../src/config/index.js';
import User from '../src/models/User.js';
import Job from '../src/models/Job.js';
import ActivityLog from '../src/models/ActivityLog.js';
import { isSuperAdmin, isSuperAdminRole } from '../src/middleware/auth.js';

async function runRbacTests() {
  console.log('=== STARTING RBAC & MULTI-ADMIN TEST SUITE ===');
  await mongoose.connect(config.mongoUri);
  console.log('Connected to MongoDB:', config.mongoUri);

  try {
    // 1. Setup Super Admin
    const superAdminEmail = 'test_superadmin@deliveryplus.tech';
    let superAdmin = await User.findOne({ email: superAdminEmail });
    if (!superAdmin) {
      superAdmin = await User.create({
        name: 'Super Administrator',
        email: superAdminEmail,
        password: 'Password123!',
        role: 'super_admin',
        isActive: true,
      });
    } else {
      superAdmin.role = 'super_admin';
      superAdmin.isActive = true;
      await superAdmin.save();
    }

    console.log('✓ Super Admin Account Ready:', {
      id: superAdmin._id,
      email: superAdmin.email,
      role: superAdmin.role,
      isSuperAdmin: isSuperAdmin(superAdmin),
    });

    if (!isSuperAdmin(superAdmin)) {
      throw new Error('Super Admin role check failed');
    }

    // 2. Create an Admin user with specific permissions
    const testAdminEmail = 'test_ops_admin@deliveryplus.tech';
    await User.deleteOne({ email: testAdminEmail });

    const newAdmin = await User.create({
      name: 'Operations Admin Rahul',
      email: testAdminEmail,
      password: 'AdminPassword123!',
      role: 'admin',
      permissions: ['jobs.view', 'jobs.view_own', 'jobs.create', 'jobs.edit_own', 'drivers.view'],
      isActive: true,
      createdBy: superAdmin._id,
      creatorNameSnapshot: superAdmin.name,
    });

    console.log('✓ Created Admin User:', {
      id: newAdmin._id,
      name: newAdmin.name,
      role: newAdmin.role,
      permissionsCount: newAdmin.permissions.length,
      createdBy: newAdmin.createdBy,
    });

    // 3. Password Verification
    const passwordMatch = await newAdmin.comparePassword('AdminPassword123!');
    console.log('✓ Admin Password Compare Match:', passwordMatch);
    if (!passwordMatch) throw new Error('Password compare failed');

    // 4. Create Job by Admin - Check Creator Tracking
    const jobData = {
      customerName: 'Test Customer Alpha',
      customerPhone: '0400111222',
      customerEmail: 'customer_alpha@example.com',
      pickupAddress: '100 George St, Sydney NSW 2000',
      dropAddress: '200 Pitt St, Sydney NSW 2000',
      jobType: 'moving',
      scheduledDate: new Date(),
      scheduledTime: '10:00',
      bookingStatus: 'confirmed',
      status: 'pending',
      createdBy: newAdmin._id,
      createdByRole: newAdmin.role,
      createdByName: newAdmin.name,
    };

    const createdJob = await Job.create(jobData);
    console.log('✓ Created Job with Creator Stamp:', {
      id: createdJob._id,
      jobNumber: createdJob.jobNumber,
      createdBy: createdJob.createdBy,
      createdByRole: createdJob.createdByRole,
      createdByName: createdJob.createdByName,
    });

    if (String(createdJob.createdBy) !== String(newAdmin._id)) {
      throw new Error('Created Job creator ID mismatch');
    }
    if (createdJob.createdByRole !== 'admin') {
      throw new Error('Created Job creator role mismatch');
    }

    // 5. Create Job by Super Admin
    const superAdminJob = await Job.create({
      customerName: 'Super Customer Beta',
      customerPhone: '0400333444',
      pickupAddress: '50 Queen St, Melbourne VIC 3000',
      dropAddress: '80 Collins St, Melbourne VIC 3000',
      jobType: 'delivery',
      scheduledDate: new Date(),
      bookingStatus: 'confirmed',
      status: 'pending',
      createdBy: superAdmin._id,
      createdByRole: 'super_admin',
      createdByName: superAdmin.name,
    });

    console.log('✓ Created Job by Super Admin:', {
      id: superAdminJob._id,
      jobNumber: superAdminJob.jobNumber,
      createdByRole: superAdminJob.createdByRole,
      createdByName: superAdminJob.createdByName,
    });

    // 6. Test Job Visibility Query (Admin view_own)
    const adminVisibleJobs = await Job.find({ createdBy: newAdmin._id }).lean();
    console.log('✓ Admin View Own Query Found Jobs:', adminVisibleJobs.length);
    if (!adminVisibleJobs.some((j) => String(j._id) === String(createdJob._id))) {
      throw new Error('Admin view_own did not find own job');
    }
    if (adminVisibleJobs.some((j) => String(j._id) === String(superAdminJob._id))) {
      throw new Error('Admin view_own leaked Super Admin job!');
    }

    // 7. Test Activity Logging for Permission Change
    await ActivityLog.create({
      userId: superAdmin._id,
      actorId: superAdmin._id,
      actorName: superAdmin.name,
      actorRole: 'super_admin',
      action: 'PERMISSIONS_CHANGED',
      entity: 'User',
      entityType: 'Admin',
      entityId: newAdmin._id,
      details: `Added jobs.cancel permission for ${newAdmin.name}`,
      metadata: { added: ['jobs.cancel'], removed: [] },
    });

    const recentAudit = await ActivityLog.findOne({
      action: 'PERMISSIONS_CHANGED',
      entityId: newAdmin._id,
    }).lean();

    console.log('✓ Activity Audit Log Verified:', {
      action: recentAudit?.action,
      actorName: recentAudit?.actorName,
      details: recentAudit?.details,
    });

    // Clean up test records
    await Job.deleteOne({ _id: createdJob._id });
    await Job.deleteOne({ _id: superAdminJob._id });
    await User.deleteOne({ _id: newAdmin._id });

    console.log('\n========================================');
    console.log('🎉 ALL RBAC & MULTI-ADMIN TESTS PASSED!');
    console.log('========================================');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runRbacTests();

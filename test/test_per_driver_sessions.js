import assert from 'node:assert/strict';
import { normalizeJobForResponse } from '../src/controllers/jobController.js';

console.log('=== RUNNING PER-DRIVER WORK SESSION TESTS ===\n');

// 1. Setup Mock Job matching the exact prompt scenario:
// JOB01
// Shivam: Assigned 08:50, Start 09:00, End 13:00 -> 4 Hr (240 min)
// Vikash: Assigned 08:50, Start 09:30, End 13:15 -> 3 Hr 45 Min (225 min)
// Garvita: Assigned Later 09:45, Start 10:00, End 12:30 -> 2 Hr 30 Min (150 min)

const shivamId = '650000000000000000000001';
const vikashId = '650000000000000000000002';
const garvitaId = '650000000000000000000003';

const baseDate = '2026-09-17';

const mockJob = {
  _id: '659999999999999999999999',
  jobNumber: 'JOB01',
  jobCode: 'JOB01',
  customerName: 'Acme Logistics',
  status: 'completed',
  scheduledDate: new Date(`${baseDate}T09:00:00Z`),
  startedAt: new Date(`${baseDate}T09:00:00Z`),
  completedAt: new Date(`${baseDate}T13:15:00Z`),
  totalWorkedMinutes: 255,
  assignedDrivers: [shivamId, vikashId, garvitaId],
  driverAssignments: [
    {
      driverId: { _id: shivamId, name: 'Shivam', phone: '0400000001' },
      role: 'Lead Driver',
      assignedAt: new Date(`${baseDate}T08:50:00Z`),
      startedAt: new Date(`${baseDate}T09:00:00Z`),
      completedAt: new Date(`${baseDate}T13:00:00Z`),
      totalWorkedMinutes: 240,
      status: 'completed',
      startAgreement: {
        termsRead: true,
        termsAccepted: true,
        stairsAtProperty: false,
        customerSignatureName: 'Customer A',
        customerSignature: 'data:image/png;base64,sampleSigShivam',
        agreementVersion: '1.0',
        acceptedAt: new Date(`${baseDate}T09:00:00Z`),
      },
    },
    {
      driverId: { _id: vikashId, name: 'Vikash', phone: '0400000002' },
      role: 'Driver',
      assignedAt: new Date(`${baseDate}T08:50:00Z`),
      startedAt: new Date(`${baseDate}T09:30:00Z`),
      completedAt: new Date(`${baseDate}T13:15:00Z`),
      totalWorkedMinutes: 225,
      status: 'completed',
      startAgreement: {
        termsRead: true,
        termsAccepted: true,
        stairsAtProperty: true,
        customerSignatureName: 'Customer B',
        customerSignature: 'data:image/png;base64,sampleSigVikash',
        agreementVersion: '1.0',
        acceptedAt: new Date(`${baseDate}T09:30:00Z`),
      },
    },
    {
      driverId: { _id: garvitaId, name: 'Garvita', phone: '0400000003' },
      role: 'Driver',
      assignedAt: new Date(`${baseDate}T09:45:00Z`), // Assigned Later!
      startedAt: new Date(`${baseDate}T10:00:00Z`), // Started Later!
      completedAt: new Date(`${baseDate}T12:30:00Z`), // Completed Earlier!
      totalWorkedMinutes: 150,
      status: 'completed',
      startAgreement: {
        termsRead: true,
        termsAccepted: true,
        stairsAtProperty: false,
        customerSignatureName: 'Customer C',
        customerSignature: 'data:image/png;base64,sampleSigGarvita',
        agreementVersion: '1.0',
        acceptedAt: new Date(`${baseDate}T10:00:00Z`),
      },
    },
  ],
};

// TEST 1: Normalize for Admin view
console.log('Test 1: Admin Serialization...');
const adminNormalized = normalizeJobForResponse(mockJob);
assert.equal(adminNormalized.driverAssignments.length, 3, 'Should have 3 driver assignments');
assert.equal(adminNormalized.driverAssignments[0].totalWorkedMinutes, 240, 'Shivam worked 240 mins (4h)');
assert.equal(adminNormalized.driverAssignments[1].totalWorkedMinutes, 225, 'Vikash worked 225 mins (3h 45m)');
assert.equal(adminNormalized.driverAssignments[2].totalWorkedMinutes, 150, 'Garvita worked 150 mins (2h 30m)');
console.log('✓ Admin serialization passed!');

// TEST 2: Normalize for Garvita (Driver app view)
console.log('\nTest 2: Garvita Driver App Serialization (myAssignment)...');
const garvitaNormalized = normalizeJobForResponse(mockJob, { forDriver: true, driverId: garvitaId });
assert.ok(garvitaNormalized.myAssignment, 'myAssignment should exist for Garvita');
assert.equal(garvitaNormalized.myAssignment.totalWorkedMinutes, 150, 'Garvita myAssignment worked 150 mins');
assert.equal(
  new Date(garvitaNormalized.myAssignment.startedAt).toISOString(),
  new Date(`${baseDate}T10:00:00Z`).toISOString(),
  'Garvita MUST NEVER inherit Shivam 09:00 start time'
);
assert.equal(
  new Date(garvitaNormalized.myAssignment.assignedAt).toISOString(),
  new Date(`${baseDate}T09:45:00Z`).toISOString(),
  'Garvita assignedAt is 09:45'
);
console.log('✓ Garvita driver app serialization passed!');

// TEST 3: Backward compatibility for legacy jobs without driverAssignments
console.log('\nTest 3: Backward compatibility for legacy jobs...');
const legacyJob = {
  _id: '658888888888888888888888',
  jobNumber: 'LEGACY01',
  customerName: 'Old Customer',
  status: 'completed',
  startedAt: new Date(`${baseDate}T08:00:00Z`),
  completedAt: new Date(`${baseDate}T10:00:00Z`),
  totalWorkedMinutes: 120,
  assignedDrivers: [shivamId],
};
const legacyNormalized = normalizeJobForResponse(legacyJob);
assert.equal(legacyNormalized.driverAssignments.length, 1, 'Should backfill 1 assignment');
assert.equal(legacyNormalized.driverAssignments[0].totalWorkedMinutes, 120, 'Should derive 120 minutes from legacy job');
console.log('✓ Backward compatibility passed!');

console.log('\n========================================');
console.log('ALL PER-DRIVER SESSION TESTS PASSED! ✅');
console.log('========================================');

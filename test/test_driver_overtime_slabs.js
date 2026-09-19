import assert from 'node:assert/strict';
import {
  calculateDriverSessionPricing,
  createDriverStartPricingSnapshot,
  finalizeDriverSessionPricing,
  deriveLegacyDriverPricing,
} from '../src/services/driverPricingService.js';
import { normalizeJobForResponse } from '../src/controllers/jobController.js';

console.log('=== RUNNING AUTHORITATIVE DRIVER HOURLY & 30-MIN OVERTIME TESTS ===\n');

// -------------------------------------------------------------
// 1. EXACT OVERTIME TEST MATRIX
// -------------------------------------------------------------
console.log('1. Testing Exact 30-Minute Overtime Slab Matrix ($100/hr, 2 Hr Base)...');

const testMatrix100 = [
  { mins: 0, expectedAmt: 200, otMins: 0, otBlocks: 0, otAmt: 0 },
  { mins: 60, expectedAmt: 200, otMins: 0, otBlocks: 0, otAmt: 0 },
  { mins: 119, expectedAmt: 200, otMins: 0, otBlocks: 0, otAmt: 0 },
  { mins: 120, expectedAmt: 200, otMins: 0, otBlocks: 0, otAmt: 0 },
  { mins: 121, expectedAmt: 250, otMins: 1, otBlocks: 1, otAmt: 50 },
  { mins: 149, expectedAmt: 250, otMins: 29, otBlocks: 1, otAmt: 50 },
  { mins: 150, expectedAmt: 250, otMins: 30, otBlocks: 1, otAmt: 50 },
  { mins: 151, expectedAmt: 300, otMins: 31, otBlocks: 2, otAmt: 100 },
  { mins: 180, expectedAmt: 300, otMins: 60, otBlocks: 2, otAmt: 100 },
  { mins: 181, expectedAmt: 350, otMins: 61, otBlocks: 3, otAmt: 150 },
];

for (const tc of testMatrix100) {
  const res = calculateDriverSessionPricing({
    pricingType: 'hourly',
    hourlyRate: 100,
    baseHours: 2,
    totalWorkedMinutes: tc.mins,
    isCompleted: true,
  });

  assert.equal(res.baseAmount, 200, `Base amount should be $200 at ${tc.mins}m`);
  assert.equal(res.overtimeMinutes, tc.otMins, `Overtime minutes should be ${tc.otMins} at ${tc.mins}m`);
  assert.equal(res.overtimeBlocks, tc.otBlocks, `Overtime blocks should be ${tc.otBlocks} at ${tc.mins}m`);
  assert.equal(res.overtimeAmount, tc.otAmt, `Overtime amount should be $${tc.otAmt} at ${tc.mins}m`);
  assert.equal(res.finalDriverAmount, tc.expectedAmt, `Final amount should be $${tc.expectedAmt} at ${tc.mins}m (got ${res.finalDriverAmount})`);
  console.log(`  ✓ ${tc.mins} min -> Base $200 + OT ${tc.otMins}m (${tc.otBlocks} blocks = $${tc.otAmt}) => Final $${res.finalDriverAmount}`);
}

console.log('\n2. Testing $200/hr Rate Matrix (2 Hr Base)...');
const testMatrix200 = [
  { mins: 120, expectedAmt: 400, otBlocks: 0, otAmt: 0 },
  { mins: 150, expectedAmt: 500, otBlocks: 1, otAmt: 100 },
  { mins: 180, expectedAmt: 600, otBlocks: 2, otAmt: 200 },
];

for (const tc of testMatrix200) {
  const res = calculateDriverSessionPricing({
    pricingType: 'hourly',
    hourlyRate: 200,
    baseHours: 2,
    totalWorkedMinutes: tc.mins,
    isCompleted: true,
  });

  assert.equal(res.baseAmount, 400);
  assert.equal(res.overtimeBlocks, tc.otBlocks);
  assert.equal(res.overtimeAmount, tc.otAmt);
  assert.equal(res.finalDriverAmount, tc.expectedAmt);
  console.log(`  ✓ ${tc.mins} min -> Base $400 + OT (${tc.otBlocks} blocks = $${tc.otAmt}) => Final $${res.finalDriverAmount}`);
}

// -------------------------------------------------------------
// 2. MULTI-DRIVER INDEPENDENT SESSIONS (JOB01 Scenario)
// -------------------------------------------------------------
console.log('\n3. Testing Multi-Driver Independent Sessions Scenario...');
// Shivam: 09:00 -> 11:30 (150 min) -> $250
// Vikash: 09:30 -> 12:30 (180 min) -> $300
// Garvita: 10:00 -> 12:00 (120 min) -> $200

const shivamPricing = calculateDriverSessionPricing({
  pricingType: 'hourly',
  hourlyRate: 100,
  baseHours: 2,
  totalWorkedMinutes: 150,
  isCompleted: true,
});
assert.equal(shivamPricing.finalDriverAmount, 250, 'Shivam should earn $250');

const vikashPricing = calculateDriverSessionPricing({
  pricingType: 'hourly',
  hourlyRate: 100,
  baseHours: 2,
  totalWorkedMinutes: 180,
  isCompleted: true,
});
assert.equal(vikashPricing.finalDriverAmount, 300, 'Vikash should earn $300');

const garvitaPricing = calculateDriverSessionPricing({
  pricingType: 'hourly',
  hourlyRate: 100,
  baseHours: 2,
  totalWorkedMinutes: 120,
  isCompleted: true,
});
assert.equal(garvitaPricing.finalDriverAmount, 200, 'Garvita should earn $200');

console.log(`  ✓ Shivam (150m): $${shivamPricing.finalDriverAmount}`);
console.log(`  ✓ Vikash (180m): $${vikashPricing.finalDriverAmount}`);
console.log(`  ✓ Garvita (120m): $${garvitaPricing.finalDriverAmount}`);

// -------------------------------------------------------------
// 3. IMMUTABILITY OF COMPLETED SESSIONS
// -------------------------------------------------------------
console.log('\n4. Testing Historical Immutability (Rate edited after completion)...');

const completedSnapshot = {
  pricingType: 'hourly',
  hourlyRate: 100,
  baseHours: 2,
  baseMinutes: 120,
  baseAmount: 200,
  halfHourRate: 50,
  totalWorkedMinutes: 150,
  overtimeMinutes: 30,
  overtimeBlocks: 1,
  overtimeAmount: 50,
  finalDriverAmount: 250,
  isFinal: true,
  calculatedAt: new Date().toISOString(),
};

// Admin changes job rate to $200/hr later
const recalculatedWithNewRate = calculateDriverSessionPricing({
  pricingType: 'hourly',
  hourlyRate: 200,
  baseHours: 2,
  totalWorkedMinutes: 150,
  existingSnapshot: completedSnapshot,
});

assert.equal(
  recalculatedWithNewRate.finalDriverAmount,
  250,
  'Completed session MUST retain its immutable $250 earnings even when admin changes rate to $200'
);
assert.equal(
  recalculatedWithNewRate.hourlyRate,
  100,
  'Completed snapshot must retain original hourly rate'
);
console.log('  ✓ Completed session remained immutable ($250 maintained despite job rate change to $200)');

// -------------------------------------------------------------
// 4. API SERIALIZATION & MASKING (showDriverPrice = true vs false)
// -------------------------------------------------------------
console.log('\n5. Testing API Response Masking (showDriverPrice)...');

const mockMultiDriverJob = {
  _id: '659999999999999999999999',
  jobNumber: 'JOB01',
  status: 'completed',
  pricingType: 'hourly',
  hourlyRate: 100,
  estimatedHours: 2,
  showDriverPrice: true,
  driverAssignments: [
    {
      driverId: '650000000000000000000001',
      role: 'Lead Driver',
      status: 'completed',
      startedAt: new Date('2026-09-17T09:00:00Z'),
      completedAt: new Date('2026-09-17T11:30:00Z'),
      totalWorkedMinutes: 150,
      pricingSnapshot: completedSnapshot,
    },
    {
      driverId: '650000000000000000000002',
      role: 'Driver',
      status: 'completed',
      startedAt: new Date('2026-09-17T09:30:00Z'),
      completedAt: new Date('2026-09-17T12:30:00Z'),
      totalWorkedMinutes: 180,
      pricingSnapshot: { ...completedSnapshot, totalWorkedMinutes: 180, overtimeMinutes: 60, overtimeBlocks: 2, overtimeAmount: 100, finalDriverAmount: 300 },
    },
  ],
};

// Case A: Driver View with showDriverPrice = true
const driverVisibleRes = normalizeJobForResponse(mockMultiDriverJob, {
  forDriver: true,
  driverId: '650000000000000000000001',
});

assert.ok(driverVisibleRes.myAssignment, 'myAssignment exists');
assert.equal(driverVisibleRes.myAssignment.pricingSnapshot.finalDriverAmount, 250);
assert.equal(driverVisibleRes.driverPrice, 250);
assert.equal(driverVisibleRes.driverAssignments[1].pricingSnapshot, null, 'Other driver earnings must be masked for privacy');
console.log('  ✓ Driver role with showDriverPrice=true receives own payout ($250) while other drivers masked');

// Case B: Driver View with showDriverPrice = false
const hiddenJob = { ...mockMultiDriverJob, showDriverPrice: false };
const driverHiddenRes = normalizeJobForResponse(hiddenJob, {
  forDriver: true,
  driverId: '650000000000000000000001',
});

assert.equal(driverHiddenRes.driverPrice, null, 'driverPrice must be null when hidden');
assert.equal(driverHiddenRes.myAssignment.pricingSnapshot, null, 'pricingSnapshot must be null when hidden');
assert.equal(driverHiddenRes.showDriverPrice, false);
console.log('  ✓ Driver role with showDriverPrice=false has all pricing stripped');

// Case C: Admin View with showDriverPrice = false (Admin MUST see everything)
const adminRes = normalizeJobForResponse(hiddenJob, { forDriver: false });
assert.equal(adminRes.driverAssignments[0].pricingSnapshot.finalDriverAmount, 250, 'Admin must see driver 1 earnings');
assert.equal(adminRes.driverAssignments[1].pricingSnapshot.finalDriverAmount, 300, 'Admin must see driver 2 earnings');
console.log('  ✓ Admin role receives full pricing snapshots regardless of showDriverPrice setting');

// -------------------------------------------------------------
// 5. FIXED PRICING MODE TEST
// -------------------------------------------------------------
console.log('\n6. Testing Fixed Pricing Mode...');
const fixedJobRes = calculateDriverSessionPricing({
  pricingType: 'fixed',
  fixedPrice: 350,
  driverPriceType: 'custom',
  driverPrice: 280,
  totalWorkedMinutes: 200,
  isCompleted: true,
});
assert.equal(fixedJobRes.finalDriverAmount, 280, 'Fixed custom price should be 280');
assert.equal(fixedJobRes.overtimeMinutes, 0, 'Fixed job must not have overtime minutes');
assert.equal(fixedJobRes.overtimeBlocks, 0, 'Fixed job must not have overtime blocks');
console.log('  ✓ Fixed pricing mode works properly without 30-min overtime slab');

// -------------------------------------------------------------
// 6. LEGACY JOBS COMPATIBILITY TEST
// -------------------------------------------------------------
console.log('\n7. Testing Legacy Job Derived Pricing...');
const legacyDerived = deriveLegacyDriverPricing({
  hourlyRate: 100,
  estimatedHours: 2,
  pricingType: 'hourly',
  status: 'completed',
}, 150);
assert.equal(legacyDerived.finalDriverAmount, 250);
assert.equal(legacyDerived.isLegacy, true);
console.log('  ✓ Legacy derived pricing calculation works safely');

console.log('\n======================================================');
console.log('ALL AUTHORITATIVE DRIVER PRICING TESTS PASSED! ✅');
console.log('======================================================');

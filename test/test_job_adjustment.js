import { calculateDriverSessionPricing } from '../src/services/driverPricingService.js';

// Test Live Adjustment Calculation Logic
console.log('=== RUNNING JOB ADJUSTMENT RECALCULATION TESTS ===\n');

// 1. Hourly recalculation with 2.5 hrs worked (150 mins) with 2 hrs minimum @ $85/hr
const pricing1 = calculateDriverSessionPricing({
  pricingType: 'hourly',
  hourlyRate: 85,
  baseHours: 2,
  totalWorkedMinutes: 150, // 2.5 hours -> 2 hrs base + 1x 30min OT block
});

console.log('Test 1: Hourly Driver Session Recalculation (150 mins @ $85/hr, 2h base):');
console.log('Base Amount:', pricing1.baseAmount);
console.log('Half Hour Rate:', pricing1.halfHourRate);
console.log('Overtime Minutes:', pricing1.overtimeMinutes);
console.log('Overtime Blocks:', pricing1.overtimeBlocks);
console.log('Overtime Amount:', pricing1.overtimeAmount);
console.log('Final Driver Amount:', pricing1.finalDriverAmount);

if (
  pricing1.baseAmount === 170 &&
  pricing1.halfHourRate === 42.5 &&
  pricing1.overtimeMinutes === 30 &&
  pricing1.overtimeBlocks === 1 &&
  pricing1.overtimeAmount === 42.5 &&
  pricing1.finalDriverAmount === 212.5
) {
  console.log('✓ Test 1 Passed!\n');
} else {
  console.error('❌ Test 1 Failed!', pricing1);
  process.exit(1);
}

// 2. Fixed Price calculation
const pricing2 = calculateDriverSessionPricing({
  pricingType: 'fixed',
  fixedPrice: 350,
  totalWorkedMinutes: 240,
});

console.log('Test 2: Fixed Price Session (240 mins @ $350 fixed):');
console.log('Final Driver Amount:', pricing2.finalDriverAmount);

if (pricing2.finalDriverAmount === 350) {
  console.log('✓ Test 2 Passed!\n');
} else {
  console.error('❌ Test 2 Failed!', pricing2);
  process.exit(1);
}

console.log('========================================');
console.log('ALL JOB ADJUSTMENT TESTS PASSED! ✅');
console.log('========================================');

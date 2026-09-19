import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { buildJobFilterQuery, calculateJobSummaryStats } from '../src/services/jobFilterService.js';
import { generateJobsCsv, sanitizeCsvCell, buildCsvExportFilename } from '../src/services/csvExportService.js';

console.log('=== RUNNING JOB FILTERS, SUMMARY STATS & CSV EXPORT TESTS ===\n');

// -------------------------------------------------------------
// 1. QUERY BUILDER TESTS
// -------------------------------------------------------------
console.log('1. Testing buildJobFilterQuery for various filter combinations...');

// Test 1A: Default Confirmed Jobs
const defaultQuery = buildJobFilterQuery({});
assert.deepEqual(defaultQuery, { $and: [{ bookingStatus: 'confirmed' }] }, 'Default should filter confirmed jobs');
console.log('  ✓ Default query targets confirmed jobs');

// Test 1B: Status = completed
const completedQuery = buildJobFilterQuery({ status: 'completed' });
assert.ok(
  JSON.stringify(completedQuery).includes('"status":"completed"'),
  'Query must include status completed'
);
console.log('  ✓ Completed jobs filter correctly formed');

// Test 1C: Driver Filter (ObjectId query matches driverAssignments and assignedDrivers)
const driverId = '650000000000000000000001';
const driverQuery = buildJobFilterQuery({ driverId });
const driverQueryStr = JSON.stringify(driverQuery);
assert.ok(driverQueryStr.includes('driverAssignments.driverId'), 'Should query driverAssignments.driverId');
assert.ok(driverQueryStr.includes('assignedDrivers'), 'Should query assignedDrivers');
console.log('  ✓ Driver filter queries canonical driverAssignments & assignedDrivers');

// Test 1D: Created By Admin Filter
const createdByQuery = buildJobFilterQuery({ createdBy: 'super_admin' });
assert.ok(JSON.stringify(createdByQuery).includes('createdByRole'), 'Should query createdByRole for super_admin');
console.log('  ✓ Created By filter works for Super Admin role');

// Test 1E: Date Range + Driver + Status + Search Combination
const multiFilter = buildJobFilterQuery({
  status: 'completed',
  driverId,
  dateFrom: '2026-09-01',
  dateTo: '2026-09-30',
  search: 'John',
  jobType: 'moving',
  createdBy: 'super_admin',
});
const multiStr = JSON.stringify(multiFilter);
assert.ok(multiStr.includes('"status":"completed"'));
assert.ok(multiStr.includes('driverAssignments.driverId'));
assert.ok(multiStr.includes('$gte'));
assert.ok(multiStr.includes('$lte'));
assert.ok(multiStr.includes('customerName'));
assert.ok(multiStr.includes('"jobType":"moving"'));
console.log('  ✓ Multi-filter combination correctly parsed');

// -------------------------------------------------------------
// 2. CSV CELL FORMULA SANITIZATION
// -------------------------------------------------------------
console.log('\n2. Testing CSV Formula Injection Sanitization (OWASP)...');

assert.equal(sanitizeCsvCell('=SUM(A1:A10)'), "'=SUM(A1:A10)");
assert.equal(sanitizeCsvCell('+12345'), "'+12345");
assert.equal(sanitizeCsvCell('-cmd|/C calc'), "'-cmd|/C calc");
assert.equal(sanitizeCsvCell('@test'), "'@test");
assert.equal(sanitizeCsvCell('Normal Text'), 'Normal Text');
assert.equal(sanitizeCsvCell('123 George St, Sydney'), '"123 George St, Sydney"');
assert.equal(sanitizeCsvCell('He said "Hello"'), '"He said ""Hello"""');
console.log('  ✓ Formula injection characters (=, +, -, @) safely escaped');
console.log('  ✓ Commas and quotes safely encapsulated');

// -------------------------------------------------------------
// 3. CSV EXPORT GENERATION
// -------------------------------------------------------------
console.log('\n3. Testing CSV Generation (Standard vs Driver Sessions)...');

const shivamId = '650000000000000000000001';
const vikashId = '650000000000000000000002';
const garvitaId = '650000000000000000000003';

const mockJob01 = {
  _id: '659999999999999999999999',
  jobNumber: 'JOB01',
  customerName: 'Acme Corp',
  customerPhone: '0412345678',
  customerEmail: 'acme@example.com',
  pickupAddress: '123 Pitt St, Sydney',
  dropAddress: '456 George St, Sydney',
  scheduledDate: new Date('2026-09-25T09:00:00Z'),
  scheduledStartTime: '09:00 AM',
  scheduledEndTime: '01:00 PM',
  status: 'completed',
  hourlyRate: 100,
  pricingType: 'hourly',
  billing: { totalAmount: 750 },
  createdByName: 'Shivam Admin',
  driverAssignments: [
    {
      driverId: { _id: shivamId, name: 'Shivam' },
      driverName: 'Shivam',
      role: 'Lead Driver',
      assignedAt: new Date('2026-09-25T08:50:00Z'),
      startedAt: new Date('2026-09-25T09:00:00Z'),
      completedAt: new Date('2026-09-25T13:00:00Z'),
      totalWorkedMinutes: 240,
      status: 'completed',
      pricingSnapshot: {
        pricingType: 'hourly',
        hourlyRate: 100,
        baseHours: 2,
        baseAmount: 200,
        overtimeMinutes: 120,
        overtimeBlocks: 4,
        overtimeAmount: 200,
        finalDriverAmount: 400,
      },
    },
    {
      driverId: { _id: vikashId, name: 'Vikash' },
      driverName: 'Vikash',
      role: 'Driver',
      assignedAt: new Date('2026-09-25T08:50:00Z'),
      startedAt: new Date('2026-09-25T09:30:00Z'),
      completedAt: new Date('2026-09-25T13:15:00Z'),
      totalWorkedMinutes: 225,
      status: 'completed',
      pricingSnapshot: {
        pricingType: 'hourly',
        hourlyRate: 100,
        baseHours: 2,
        baseAmount: 200,
        overtimeMinutes: 105,
        overtimeBlocks: 4,
        overtimeAmount: 200,
        finalDriverAmount: 400,
      },
    },
    {
      driverId: { _id: garvitaId, name: 'Garvita' },
      driverName: 'Garvita',
      role: 'Driver',
      assignedAt: new Date('2026-09-25T09:45:00Z'),
      startedAt: new Date('2026-09-25T10:00:00Z'),
      completedAt: new Date('2026-09-25T12:30:00Z'),
      totalWorkedMinutes: 150,
      status: 'completed',
      pricingSnapshot: {
        pricingType: 'hourly',
        hourlyRate: 100,
        baseHours: 2,
        baseAmount: 200,
        overtimeMinutes: 30,
        overtimeBlocks: 1,
        overtimeAmount: 50,
        finalDriverAmount: 250,
      },
    },
  ],
};

// Test Standard Export
const standardCsv = generateJobsCsv({
  jobs: [mockJob01],
  filterParams: {},
  reqUser: { role: 'admin', permissions: ['*'] },
  exportMode: 'standard',
});

assert.ok(standardCsv.includes('Job Code,Job Type'), 'Standard CSV header exists');
assert.ok(standardCsv.includes('JOB01'), 'Standard CSV contains JOB01');
assert.ok(standardCsv.includes('$750.00'), 'Standard CSV contains customer amount');
assert.ok(standardCsv.includes('Shivam, Vikash, Garvita'), 'Standard CSV lists assigned drivers');
console.log('  ✓ Standard CSV export correctly formats single job row');

// Test Driver Sessions Export (Multi-Driver 1 row per driver session!)
const driverSessionsCsv = generateJobsCsv({
  jobs: [mockJob01],
  filterParams: {},
  reqUser: { role: 'admin', permissions: ['*'] },
  exportMode: 'driver_sessions',
});

const driverRows = driverSessionsCsv.split('\r\n').filter(Boolean);
// 1 header row + 3 driver session rows = 4 rows
assert.equal(driverRows.length, 4, 'Driver work session export must split JOB01 into 3 distinct driver rows');
assert.ok(driverRows[1].includes('Shivam') && driverRows[1].includes('240') && driverRows[1].includes('$400.00'), 'Shivam row accurate');
assert.ok(driverRows[2].includes('Vikash') && driverRows[2].includes('225') && driverRows[2].includes('3 Hr 45 Min'), 'Vikash row accurate');
assert.ok(driverRows[3].includes('Garvita') && driverRows[3].includes('150') && driverRows[3].includes('$250.00'), 'Garvita row accurate');
console.log('  ✓ Driver work session CSV correctly splits multi-driver job into independent rows');

// Test Driver Filtering on Driver Sessions Export
const shivamOnlyCsv = generateJobsCsv({
  jobs: [mockJob01],
  filterParams: { driverId: shivamId },
  reqUser: { role: 'admin', permissions: ['*'] },
  exportMode: 'driver_sessions',
});
const shivamRows = shivamOnlyCsv.split('\r\n').filter(Boolean);
assert.equal(shivamRows.length, 2, 'When filtered by Shivam, only Shivam session is exported');
assert.ok(shivamRows[1].includes('Shivam'), 'Shivam row present');
console.log('  ✓ Driver filter on CSV export restricts output to selected driver only');

// Test Driver Price Permission Masking in CSV
const maskedCsv = generateJobsCsv({
  jobs: [mockJob01],
  filterParams: {},
  reqUser: { role: 'admin', createdBy: 'super_admin_123', permissions: ['jobs.view'] }, // Lacks jobs.view_driver_price
  exportMode: 'driver_sessions',
});
assert.ok(maskedCsv.includes('Masked'), 'Sensitive driver prices must be Masked when permission missing');
assert.ok(!maskedCsv.includes('$400.00'), 'Masked CSV must not leak driver earnings');
console.log('  ✓ Sensitive driver earnings masked in CSV when permission is not granted');

// Test Export Filename Generator
const fname1 = buildCsvExportFilename({ status: 'completed', dateFrom: '2026-09-01', dateTo: '2026-09-30' });
assert.equal(fname1, 'completed-jobs-2026-09-01-to-2026-09-30.csv');
const fname2 = buildCsvExportFilename({ driverName: 'Shivam' }, 'driver_sessions');
assert.ok(fname2.includes('driver-work-sessions-driver-shivam'));
console.log('  ✓ Descriptive CSV filenames generated correctly');

console.log('\n======================================================');
console.log('ALL JOB FILTERS & CSV EXPORT TESTS PASSED! ✅');
console.log('======================================================');

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Job from '../src/models/Job.js';

const validJobFields = {
  customerName: 'Test Customer',
  customerPhone: '0400000000',
  customerEmail: 'test@example.com',
  pickupAddress: '123 Main St, Sydney NSW 2000',
  dropAddress: '456 High St, Sydney NSW 2000',
  jobType: 'moving',
  scheduledDate: new Date('2026-08-30'),
};

test('Job schema has bookingStatus and quotation/confirmation subdocuments', () => {
  assert.ok(Job.schema.path('bookingStatus'), 'missing bookingStatus schema field');
  assert.ok(Job.schema.path('quotation.status'), 'missing quotation.status schema field');
  assert.ok(Job.schema.path('quotation.sentAt'), 'missing quotation.sentAt schema field');
  assert.ok(Job.schema.path('quotation.acceptedAt'), 'missing quotation.acceptedAt schema field');
  assert.ok(Job.schema.path('confirmation.confirmedAt'), 'missing confirmation.confirmedAt schema field');
  assert.ok(Job.schema.path('confirmation.emailSent'), 'missing confirmation.emailSent schema field');
});

test('Job default bookingStatus is quotation and default quotation.status is draft', () => {
  const job = new Job({ ...validJobFields });
  assert.equal(job.bookingStatus, 'quotation');
  assert.equal(job.quotation.status, 'draft');
  assert.equal(job.confirmation.emailSent, false);
});

test('Job allows setting bookingStatus to confirmed', () => {
  const job = new Job({ ...validJobFields, bookingStatus: 'confirmed' });
  assert.equal(job.bookingStatus, 'confirmed');
  assert.equal(job.validateSync(), undefined);
});

test('routes/jobs.js includes confirm-booking, send-quotation, send-confirmation, and stats endpoints', () => {
  const routes = fs.readFileSync(new URL('../src/routes/jobs.js', import.meta.url), 'utf8');
  assert.match(routes, /router\.post\('\/:id\/confirm-booking'/);
  assert.match(routes, /router\.post\('\/:id\/send-quotation'/);
  assert.match(routes, /router\.post\('\/:id\/send-confirmation'/);
  assert.match(routes, /router\.get\('\/quotations\/stats'/);
});

test('jobController.js guards duplicate confirmation', () => {
  const controller = fs.readFileSync(new URL('../src/controllers/jobController.js', import.meta.url), 'utf8');
  assert.match(controller, /Booking is already confirmed/);
  assert.match(controller, /QUOTATION_CONVERTED_TO_BOOKING/);
  assert.match(controller, /bookingStatus:\s*\{\s*\$ne:\s*'quotation'\s*\}/);
  assert.match(controller, /pickupAddress:\s*searchRegex/);
  assert.match(controller, /dropAddress:\s*searchRegex/);
});

test('dashboardController.js counts only confirmed jobs', () => {
  const dashboard = fs.readFileSync(new URL('../src/controllers/dashboardController.js', import.meta.url), 'utf8');
  assert.match(dashboard, /bookingStatus:\s*\{\s*\$ne:\s*'quotation'\s*\}/);
  assert.match(dashboard, /Job\.countDocuments\(confirmedFilter\)/);
});


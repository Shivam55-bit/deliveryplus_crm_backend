import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Job from '../src/models/Job.js';
import { normalizeMediaUrl, normalizeUrlValue } from '../src/controllers/jobController.js';

const validJobFields = {
  customerName: 'Test Customer',
  customerPhone: '0400000000',
  pickupAddress: 'Pickup address',
  dropAddress: 'Drop address',
  jobType: 'moving',
  scheduledDate: new Date('2026-08-10'),
};

test('Job schema persists completion fields on the same job record', () => {
  const completionFields = [
    'termsAccepted',
    'termsReadAt',
    'termsAcceptedAt',
    'termsVersion',
    'deliveryConfirmed',
    'stairsAtProperty',
    'stairsWaiverAccepted',
    'customerEndSignature',
    'customerSignature',
    'customerSignatureName',
    'customerSignatureDate',
    'driverName',
    'driverCompletionSignature',
    'signature',
    'paymentMethod',
    'paymentTransactionReference',
    'transactionReference',
    'otherPaymentDetails',
    'paymentNotes',
    'completionNotes',
    'damageReport',
    'amountReceived',
    'paymentProofUrl',
    'paymentProof',
    'completedByDriverId',
    'completedAt',
  ];

  for (const field of completionFields) {
    assert.ok(Job.schema.path(field), `missing Job schema field: ${field}`);
  }
});

test('job completion route updates the existing job endpoint', () => {
  const routes = fs.readFileSync(new URL('../src/routes/jobs.js', import.meta.url), 'utf8');
  assert.match(routes, /router\.post\('\/:id\/complete'/);
  assert.match(routes, /completeJob/);
});

test('cash completion accepts missing payment proof', () => {
  const job = new Job({ ...validJobFields, paymentMethod: 'cash', amountReceived: null, paymentProof: null, paymentProofUrl: null });
  assert.equal(job.validateSync(), undefined);
});

test('online completion normalizes the uploaded photo response to its URL', () => {
  const uploadedPhotoResponse = { success: true, data: { url: 'http://api.test/uploads/proof.jpg' }, file: { url: 'http://api.test/uploads/proof.jpg' } };
  assert.equal(normalizeUrlValue(uploadedPhotoResponse), 'http://api.test/uploads/proof.jpg');
});

test('job media responses use an absolute HTTPS API URL', () => {
  const previousEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  assert.equal(normalizeMediaUrl('/uploads/proof.jpg'), 'https://api.deliveryplus.tech/uploads/proof.jpg');
  assert.equal(normalizeMediaUrl('http://api.deliveryplus.tech/uploads/proof.jpg'), 'https://api.deliveryplus.tech/uploads/proof.jpg');
  process.env.NODE_ENV = previousEnvironment;
});

test('other payment accepts payment details and customer signature fields', () => {
  const job = new Job({
    ...validJobFields,
    paymentMethod: 'other',
    otherPaymentDetails: 'Cheque',
    customerEndSignature: 'data:image/png;base64,signature',
    customerSignature: 'data:image/png;base64,signature',
    driverCompletionSignature: 'data:image/png;base64,driver',
    completionNotes: '',
    damageReport: '',
    amountReceived: null,
  });
  assert.equal(job.validateSync(), undefined);
  assert.notEqual(job.customerEndSignature, job.driverCompletionSignature);
});

test('invalid job IDs and unauthorized drivers are guarded by the route/controller', () => {
  const routes = fs.readFileSync(new URL('../src/routes/jobs.js', import.meta.url), 'utf8');
  const controller = fs.readFileSync(new URL('../src/controllers/jobController.js', import.meta.url), 'utf8');
  assert.match(controller, /Invalid job ID/);
  assert.match(controller, /You are not assigned to this job/);
  assert.match(routes, /router\.post\('\/:id\/photos'/);
});

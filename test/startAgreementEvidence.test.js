import test from 'node:test';
import assert from 'node:assert/strict';
import Job from '../src/models/Job.js';
import { normalizeJobForResponse } from '../src/controllers/jobController.js';

test('Job schema contains startAgreement and completion subdocuments and fields', () => {
  const startAgreementFields = [
    'startAgreement.termsRead',
    'startAgreement.termsAccepted',
    'startAgreement.stairsAtProperty',
    'startAgreement.stairsOption',
    'startAgreement.customerSignature',
    'startAgreement.customerSignatureName',
    'startAgreement.agreementVersion',
    'startAgreement.acceptedAt',
    'startAgreement.startedAt',
    'startAgreement.driverId',
    'startSignature',
  ];

  for (const field of startAgreementFields) {
    assert.ok(Job.schema.path(field), `Missing schema field: ${field}`);
  }

  const completionFields = [
    'completion.termsRead',
    'completion.termsAccepted',
    'completion.customerSignature',
    'completion.customerSignatureName',
    'completion.driverCompletionSignature',
    'completion.hasDamage',
    'completion.damageReport',
    'completion.paymentMethod',
    'completion.amountReceived',
    'completion.completedAt',
  ];

  for (const field of completionFields) {
    assert.ok(Job.schema.path(field), `Missing schema field: ${field}`);
  }
});

test('normalizeJobForResponse correctly normalizes both startAgreement and completion objects', () => {
  const sampleStartSig = 'data:image/png;base64,startSigData1234567890';
  const sampleEndSig = 'data:image/png;base64,endSigData9876543210';
  const startTimestamp = new Date('2026-09-17T09:00:00.000Z');
  const endTimestamp = new Date('2026-09-17T11:30:00.000Z');

  const mockJob = {
    _id: '507f1f77bcf86cd799439020',
    jobNumber: 'JOB-START-001',
    customerName: 'David Miller',
    customerPhone: '0412999888',
    jobType: 'moving',
    status: 'completed',
    startedAt: startTimestamp,
    completedAt: endTimestamp,
    startSignature: sampleStartSig,
    startAgreement: {
      termsRead: true,
      termsAccepted: true,
      stairsAtProperty: true,
      stairsOption: 'yes',
      customerSignature: sampleStartSig,
      customerSignatureName: 'David Miller',
      agreementVersion: '1.0',
      acceptedAt: startTimestamp,
      startedAt: startTimestamp,
    },
    customerSignature: sampleEndSig,
    customerEndSignature: sampleEndSig,
    customerSignatureName: 'David Miller',
    hasDamage: false,
    damageReport: 'None',
    paymentMethod: 'cash',
    amountReceived: 350,
    completion: {
      termsRead: true,
      termsAccepted: true,
      customerSignature: sampleEndSig,
      customerSignatureName: 'David Miller',
      hasDamage: false,
      damageReport: 'None',
      paymentMethod: 'cash',
      amountReceived: 350,
      completedAt: endTimestamp,
    },
  };

  const normalized = normalizeJobForResponse(mockJob);

  // Assert Start Evidence
  assert.ok(normalized.startAgreement, 'startAgreement should be present');
  assert.equal(normalized.startAgreement.termsAccepted, true);
  assert.equal(normalized.startAgreement.stairsOption, 'yes');
  assert.equal(normalized.startAgreement.stairsAtProperty, true);
  assert.equal(normalized.startAgreement.customerSignature, sampleStartSig);
  assert.equal(normalized.startAgreement.customerSignatureName, 'David Miller');
  assert.equal(normalized.startSignature, sampleStartSig);

  // Assert Completion Evidence (Completely separate from start signature)
  assert.ok(normalized.completion, 'completion should be present');
  assert.equal(normalized.completion.customerSignature, sampleEndSig);
  assert.equal(normalized.customerSignature, sampleEndSig);
  assert.equal(normalized.completion.paymentMethod, 'cash');
  assert.equal(normalized.completion.amountReceived, 350);

  // Ensure Start Signature != Completion Signature
  assert.notEqual(normalized.startAgreement.customerSignature, normalized.completion.customerSignature);
});

test('normalizeJobForResponse handles legacy jobs without startAgreement gracefully', () => {
  const legacyJob = {
    _id: '507f1f77bcf86cd799439021',
    jobNumber: 'JOB-LEGACY-002',
    customerName: 'Sarah Connor',
    jobType: 'delivery',
    status: 'completed',
    startedAt: new Date('2026-09-10T10:00:00.000Z'),
    completedAt: new Date('2026-09-10T11:00:00.000Z'),
    customerSignature: 'data:image/png;base64,onlyEndSigCapturedHere',
    termsAccepted: true,
  };

  const normalized = normalizeJobForResponse(legacyJob);

  assert.equal(normalized.startAgreement, null, 'startAgreement should be null for legacy jobs');
  assert.ok(normalized.completion, 'completion should have graceful legacy fallback for completed jobs');
  assert.equal(normalized.completion.customerSignature, 'data:image/png;base64,onlyEndSigCapturedHere');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import Job from '../src/models/Job.js';
import { normalizeJobForResponse } from '../src/controllers/jobController.js';

test('Job schema contains canonical timing and scheduling fields', () => {
  const canonicalFields = [
    'scheduledDate',
    'scheduleMode',
    'scheduledTime',
    'scheduledStartTime',
    'scheduledEndTime',
    'startedAt',
    'completedAt',
    'totalWorkedMinutes',
    'billableHours',
  ];

  for (const field of canonicalFields) {
    assert.ok(Job.schema.path(field), `Missing canonical Job schema field: ${field}`);
  }
});

test('normalizeJobForResponse correctly populates canonical timing fields', () => {
  const mockJob = {
    _id: '507f1f77bcf86cd799439011',
    jobNumber: 'JOB-00123',
    customerName: 'Alice Smith',
    customerPhone: '0412345678',
    jobType: 'moving',
    scheduledDate: new Date('2026-09-25T00:00:00.000Z'),
    scheduleMode: 'exact',
    scheduledTime: '09:00',
    startedAt: new Date('2026-09-25T09:18:00.000Z'),
    completedAt: new Date('2026-09-25T12:47:00.000Z'),
    status: 'completed',
  };

  const normalized = normalizeJobForResponse(mockJob);

  assert.equal(normalized.scheduledTime, '09:00');
  assert.equal(normalized.scheduleMode, 'exact');
  assert.equal(new Date(normalized.startedAt).toISOString(), '2026-09-25T09:18:00.000Z');
  assert.equal(new Date(normalized.completedAt).toISOString(), '2026-09-25T12:47:00.000Z');
  // 12:47 - 09:18 = 3 hours 29 minutes = 209 minutes
  assert.equal(normalized.totalWorkedMinutes, 209);
  assert.equal(normalized.billableHours, 3.48);
});

test('normalizeJobForResponse falls back gracefully for legacy jobs', () => {
  const legacyJob = {
    _id: '507f1f77bcf86cd799439012',
    jobNumber: 'JOB-00099',
    customerName: 'Bob Jones',
    customerPhone: '0487654321',
    jobType: 'delivery',
    scheduledDate: new Date('2026-09-20T00:00:00.000Z'),
    scheduleMode: 'window',
    scheduledStartTime: '09:00',
    scheduledEndTime: '12:00',
    timerStarted: new Date('2026-09-20T09:30:00.000Z'),
    timerEnded: new Date('2026-09-20T11:45:00.000Z'),
    status: 'completed',
  };

  const normalized = normalizeJobForResponse(legacyJob);

  assert.equal(normalized.scheduleMode, 'window');
  assert.equal(normalized.scheduledStartTime, '09:00');
  assert.equal(normalized.scheduledEndTime, '12:00');
  assert.equal(new Date(normalized.startedAt).toISOString(), '2026-09-20T09:30:00.000Z');
  assert.equal(new Date(normalized.completedAt).toISOString(), '2026-09-20T11:45:00.000Z');
  // 11:45 - 09:30 = 2 hours 15 minutes = 135 minutes
  assert.equal(normalized.totalWorkedMinutes, 135);
  assert.equal(normalized.billableHours, 2.25);
});

test('totalWorkedMinutes calculation never produces negative or NaN values', () => {
  const invalidJob = {
    _id: '507f1f77bcf86cd799439013',
    jobNumber: 'JOB-00050',
    jobType: 'moving',
    scheduledDate: new Date('2026-09-25T00:00:00.000Z'),
    totalWorkedMinutes: null,
    startedAt: null,
    completedAt: null,
    status: 'pending',
  };

  const normalized = normalizeJobForResponse(invalidJob);
  assert.equal(normalized.totalWorkedMinutes, 0);
  assert.equal(normalized.billableHours, 0);
});

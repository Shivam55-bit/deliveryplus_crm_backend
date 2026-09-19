import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TRUCK_SPECS } from '../src/controllers/truckDimensionController.js';

test('DEFAULT_TRUCK_SPECS contains complete fleet coverage with all required specification fields', () => {
  assert.equal(DEFAULT_TRUCK_SPECS.length >= 5, true);

  const keys = DEFAULT_TRUCK_SPECS.map((item) => item.truckKey);
  assert.equal(keys.includes('van'), true);
  assert.equal(keys.includes('4.5'), true);
  assert.equal(keys.includes('6.5') || keys.includes('6'), true);
  assert.equal(keys.includes('8'), true);
  assert.equal(keys.includes('10'), true);
  assert.equal(keys.includes('14'), true);

  DEFAULT_TRUCK_SPECS.forEach((item) => {
    assert.ok(item.name, 'Truck name is required');
    assert.ok(item.sizeInTon, 'sizeInTon is required');
    assert.ok(item.capacity, 'capacity is required');
    assert.ok(item.dimensions, 'dimensions is required');
    assert.ok(item.heightClearance, 'heightClearance is required');
    assert.ok(item.parkingClearance, 'parkingClearance is required');
    assert.ok(item.tailgateCapacity, 'tailgateCapacity is required');
    assert.ok(item.roomCapacity, 'roomCapacity is required');
  });
});

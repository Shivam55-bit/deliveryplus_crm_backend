import test from 'node:test';
import assert from 'node:assert/strict';
import { getCustomerJobTotal, resolveDriverPrice } from '../src/services/driverPriceService.js';

test('resolves full driver price from the active customer total', () => {
  const total = getCustomerJobTotal({ minimumEstimatedCost: 477, finalTotal: 477 }, { status: 'assigned' });
  assert.equal(total, 477);
  assert.deepEqual(resolveDriverPrice({ showDriverPrice: true, driverPriceType: 'full' }, total), {
    showDriverPrice: true,
    driverPriceType: 'full',
    driverPrice: 477,
    driverPricePercentage: null,
  });
});

test('resolves custom and percentage driver prices', () => {
  assert.equal(resolveDriverPrice({ showDriverPrice: true, driverPriceType: 'custom', driverPrice: 200 }, 477).driverPrice, 200);
  assert.equal(resolveDriverPrice({ showDriverPrice: true, driverPriceType: 'percentage', driverPricePercentage: 50 }, 500).driverPrice, 250);
});

test('returns no driver price when visibility is off', () => {
  assert.deepEqual(resolveDriverPrice({ showDriverPrice: false, driverPriceType: 'full', driverPrice: 477 }, 477), {
    showDriverPrice: false,
    driverPriceType: null,
    driverPrice: null,
    driverPricePercentage: null,
  });
});

test('uses the authoritative customer total for full price mode', () => {
  const customerTotal = getCustomerJobTotal({ minimumEstimatedCost: 120 }, { status: 'assigned' });
  const response = resolveDriverPrice({ showDriverPrice: true, driverPriceType: 'full' }, customerTotal);

  assert.equal(response.driverPrice, 120);
  assert.equal(response.driverPriceType, 'full');
  assert.equal(response.showDriverPrice, true);
});

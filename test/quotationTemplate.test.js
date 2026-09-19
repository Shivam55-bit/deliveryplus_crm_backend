import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuotationEmail, buildBookingConfirmationEmail } from '../src/utils/emailTemplates.js';
import { normalizeEmailAttachmentIds, mergeEmailAttachmentIds } from '../src/utils/emailAttachmentSelection.js';

test('confirm-booking attachment IDs are normalized from strings and nested objects', () => {
  const values = [
    '64a7d01e3f7d01a2b8e0d111',
    { _id: '64a7d01e3f7d01a2b8e0d222' },
    { id: '64a7d01e3f7d01a2b8e0d333' },
    null,
    undefined,
  ];

  assert.deepEqual(normalizeEmailAttachmentIds(values), [
    '64a7d01e3f7d01a2b8e0d111',
    '64a7d01e3f7d01a2b8e0d222',
    '64a7d01e3f7d01a2b8e0d333',
  ]);

  assert.deepEqual(mergeEmailAttachmentIds(
    ['64a7d01e3f7d01a2b8e0d111'],
    [{ _id: '64a7d01e3f7d01a2b8e0d222' }, '64a7d01e3f7d01a2b8e0d111'],
    ['64a7d01e3f7d01a2b8e0d333']
  ), [
    '64a7d01e3f7d01a2b8e0d111',
    '64a7d01e3f7d01a2b8e0d222',
    '64a7d01e3f7d01a2b8e0d333',
  ]);
});

test('moving quotation does not render the service line-item table', () => {
  const quotation = buildQuotationEmail({
    _id: 'job-1',
    jobNumber: 'J-1',
    jobType: 'moving',
    customerName: 'Test Customer',
    lineItems: '',
    items: [{
      description: 'Packing Service',
      quantity: 0,
      unitPrice: 0,
      total: 0,
    }],
  });

  assert.doesNotMatch(quotation.html, />Service</);
  assert.doesNotMatch(quotation.html, /Moving Services/);
  assert.doesNotMatch(quotation.html, /Service Details/);
  assert.doesNotMatch(quotation.html, />Quantity</);
  assert.doesNotMatch(quotation.html, />Unit Price</);
  assert.doesNotMatch(quotation.html, />Total</);
  assert.doesNotMatch(quotation.html, /Service details are not available/);
  assert.doesNotMatch(quotation.text, /Packing Service \| Qty 0/);
});

test('moving quotation keeps all details fields visible when values are empty', () => {
  const quotation = buildQuotationEmail({
    _id: 'job-2',
    jobNumber: 'J-2',
    jobType: 'moving',
    customerName: 'Test Customer',
    lineItems: '',
    items: [],
  });

  assert.equal((quotation.html.match(/>Moving Service</g) || []).length, 1);
  assert.equal((quotation.html.match(/>Moving Details</g) || []).length, 1);
  assert.match(quotation.html, /Truck Size/);
  assert.match(quotation.html, /Movers/);
  assert.match(quotation.html, /Size of Property/);
  assert.match(quotation.html, /List of Items/);
  assert.match(quotation.html, /Not provided/);
});

test('quotation renders moving details from the populated job fields', () => {
  const quotation = buildQuotationEmail({
    _id: 'job-3',
    jobNumber: 'J-3',
    jobType: 'moving',
    customerName: 'Test Customer',
    truckSize: '4T',
    movers: 2,
    propertySize: '3 bedroom',
    lineItems: '',
    items: [{ description: 'Sofa', quantity: 1, unitPrice: 100, total: 100 }],
  });

  assert.equal((quotation.html.match(/>Moving Service</g) || []).length, 1);
  assert.equal((quotation.html.match(/>Moving Details</g) || []).length, 1);
  assert.match(quotation.html, /4 Tonne/);
  assert.match(quotation.html, />2</);
  assert.match(quotation.html, /3 bedroom/);
  assert.match(quotation.html, /Sofa/);
  assert.doesNotMatch(quotation.html, />Service</);
  assert.doesNotMatch(quotation.html, /Property Size.*Cost Breakdown/);
  assert.match(quotation.text, /List of Items: Sofa/);
});

test('delivery quotation keeps its pricing structure without moving details', () => {
  const quotation = buildQuotationEmail({
    _id: 'job-4',
    jobNumber: 'J-4',
    jobType: 'delivery',
    customerName: 'Test Customer',
    items: [{ description: 'Delivery', quantity: 1, unitPrice: 50, total: 50 }],
  });

  assert.doesNotMatch(quotation.html, />Moving Service</);
  assert.doesNotMatch(quotation.html, />Moving Details</);
  assert.match(quotation.html, />Cost Breakdown</);
});

test('quotation email includes the whats included section and booking confirmation omits it', () => {
  const quotation = buildQuotationEmail({
    _id: 'job-5',
    jobNumber: 'J-5',
    jobType: 'moving',
    customerName: 'Test Customer',
    hourlyRate: 32,
    estimatedHours: 2,
    callOutFee: 2,
    travelBackFee: 2,
  });

  assert.match(quotation.html, /WHAT’S INCLUDED IN YOUR QUOTE/i);
  assert.match(quotation.html, /PROFESSIONAL MOVING TEAM.*TRUCK/i);
  assert.match(quotation.text, /What’s Included in Your Quote/i);

  const booking = buildBookingConfirmationEmail({
    _id: 'job-booking-1',
    jobNumber: 'BK-1',
    jobType: 'moving',
    customerName: 'Test Customer',
    hourlyRate: 32,
    estimatedHours: 2,
    bookingDepositAmount: 50,
  });

  assert.doesNotMatch(booking.html, /WHAT’S INCLUDED IN YOUR QUOTE/i);
});

test('quotation email renders the minimum estimated cost amount', () => {
  const quotation = buildQuotationEmail({
    _id: 'job-5a',
    jobNumber: 'J-5a',
    jobType: 'moving',
    customerName: 'Test Customer',
    hourlyRate: 32,
    estimatedHours: 2,
    callOutFee: 2,
    travelBackFee: 2,
  });

  assert.match(quotation.html, /Minimum Estimated Cost/);
  assert.match(quotation.html, /\$68\.00/);
  assert.match(quotation.text, /Minimum Estimated Cost: \$68\.00/);
});

test('quotation email renders the moving truck banner when GIF URL is provided', () => {
  const quotation = buildQuotationEmail({
    _id: 'job-6',
    jobNumber: 'J-6',
    jobType: 'moving',
    customerName: 'Test Customer',
    movingTruckGifUrl: 'https://deliveryplus.tech/email-assets/deliveryplus-moving-truck.gif',
  });

  assert.match(quotation.html, /moving-truck-banner/);
  assert.match(quotation.html, /https:\/\/deliveryplus\.tech\/email-assets\/deliveryplus-moving-truck\.gif/);
  assert.match(quotation.html, /alt="Delivery Plus [Mm]oving [Tt]ruck/i);
});

test('quotation email cleanly omits the moving truck banner when GIF URL is empty or disabled', () => {
  const quotation = buildQuotationEmail({
    _id: 'job-7',
    jobNumber: 'J-7',
    jobType: 'moving',
    customerName: 'Test Customer',
    movingTruckGifUrl: false,
  });

  assert.doesNotMatch(quotation.html, /<img[^>]*moving-truck-banner/);
  assert.doesNotMatch(quotation.html, /alt="Delivery Plus [Mm]oving [Tt]ruck/i);
});

test('quotation email omits travel back row and fee when travel back is not provided', () => {
  const quotation = buildQuotationEmail({
    _id: 'job-8',
    jobNumber: 'J-8',
    jobType: 'moving',
    customerName: 'Test Customer',
    hourlyRate: 30,
    estimatedHours: 2,
    callOutFee: 20,
    // No travelBackFee or travelBackTime provided
  });

  // HTML checks
  assert.doesNotMatch(quotation.html, /Travel Back/);
  assert.match(quotation.html, /Includes minimum charge \+ callout fees/);
  assert.doesNotMatch(quotation.html, /travel back fees/);
  // Cost should be exactly 30 * 2 + 20 = 80.00
  assert.match(quotation.html, /\$80\.00/);

  // Text checks
  assert.doesNotMatch(quotation.text, /Travel Back:/);
  assert.match(quotation.text, /Callout: \d+ Mins \| \$20\.00/);
});

test('quotation email renders travel back row when travel back fee is provided', () => {
  const quotation = buildQuotationEmail({
    _id: 'job-9',
    jobNumber: 'J-9',
    jobType: 'moving',
    customerName: 'Test Customer',
    hourlyRate: 30,
    estimatedHours: 2,
    callOutFee: 20,
    travelBackFee: 15,
  });

  // HTML checks
  assert.match(quotation.html, /Travel Back/);
  assert.match(quotation.html, /\$15\.00/);
  assert.match(quotation.html, /Includes minimum charge \+ callout \+ travel back fees/);
  // Cost should be 30 * 2 + 20 + 15 = 95.00
  assert.match(quotation.html, /\$95\.00/);

  // Text checks
  assert.match(quotation.text, /Travel Back:/);
});

test('quotation email renders stairs charge row and includes it in minimum estimated cost when provided', () => {
  const quotation = buildQuotationEmail({
    _id: 'job-10',
    jobNumber: 'J-10',
    jobType: 'moving',
    customerName: 'Test Customer',
    hourlyRate: 30,
    estimatedHours: 2,
    callOutFee: 20,
    travelBackFee: 15,
    stairsFee: 25,
  });

  // HTML checks
  assert.match(quotation.html, /Stairs Charge/);
  assert.match(quotation.html, /\$25\.00/);
  assert.match(quotation.html, /Stair navigation fee/);
  assert.match(quotation.html, /Includes minimum charge \+ callout \+ travel back \+ stairs fees/);
  // Cost should be 30 * 2 + 20 + 15 + 25 = 120.00
  assert.match(quotation.html, /\$120\.00/);

  // Text checks
  assert.match(quotation.text, /Stairs Charge: \$25\.00/);
});

test('quotation email cleanly omits stairs charge row when not provided or 0', () => {
  const quotation = buildQuotationEmail({
    _id: 'job-11',
    jobNumber: 'J-11',
    jobType: 'moving',
    customerName: 'Test Customer',
    hourlyRate: 30,
    estimatedHours: 2,
    callOutFee: 20,
    stairsFee: 0,
  });

  assert.doesNotMatch(quotation.html, /Stairs Charge/);
  assert.doesNotMatch(quotation.text, /Stairs Charge:/);
});

test('quotation email calculates GST on total cost when includeGST is true, keeping line item rates clean', () => {
  const quotation = buildQuotationEmail({
    _id: 'job-12',
    jobNumber: 'J-12',
    jobType: 'moving',
    customerName: 'Test Customer',
    hourlyRate: 30,
    estimatedHours: 2,
    callOutFee: 20,
    travelBackFee: 10,
    stairsFee: 10,
    includeGST: true,
    gstRate: 10,
  });

  // Base items: Labor (60) + Callout (20) + Travel Back (10) + Stairs (10) = 100
  // GST: 10% on 100 = 10.00
  // Total Minimum Estimated Cost: 110.00

  // Line items show clean base rates (not pre-inflated)
  assert.match(quotation.html, />\$30\.00 \/ hour</);
  assert.doesNotMatch(quotation.html, />\$33\.00 \/ hour</);

  // Subtotal and GST rows are rendered
  assert.match(quotation.html, /Subtotal \(Excl\. GST\)/);
  assert.match(quotation.html, /\$100\.00/);
  assert.match(quotation.html, /GST \(10%\)/);
  assert.match(quotation.html, /\+\$10\.00/);

  // Total Card reflects total inc. GST
  assert.match(quotation.html, /\$110\.00/);
  assert.match(quotation.html, /Includes minimum charge \+ callout \+ travel back \+ stairs fees \+ GST \(10%\)/);

  // Plain text checks
  assert.match(quotation.text, /Subtotal \(Excl\. GST\): \$100\.00/);
  assert.match(quotation.text, /GST \(10%\): \+\$10\.00/);
  assert.match(quotation.text, /Minimum Estimated Cost \(Total Inc\. GST\): \$110\.00/);

  // Scenario 1 (2.5 Hours): (30 * 2.5 + 20) = 95 base. With GST = 104.50
  assert.match(quotation.html, /\$104\.50/);
});

test('booking confirmation email renders stairs charge and GST on total', () => {
  const confirmation = buildBookingConfirmationEmail({
    _id: 'job-13',
    jobNumber: 'J-13',
    jobType: 'moving',
    customerName: 'Test Customer',
    hourlyRate: 40,
    estimatedHours: 2,
    callOutFee: 20,
    stairsFee: 20,
    bookingDepositAmount: 50,
    includeGST: true,
    gstRate: 10,
  });

  // Base: Labor (80) + Callout (20) + Stairs (20) = 120.00
  // GST (10%): 12.00
  // Total: 132.00
  assert.match(confirmation.html, /Stairs Charge/);
  assert.match(confirmation.html, /\$20\.00/);
  assert.match(confirmation.html, /Subtotal \(Excl\. GST\)/);
  assert.match(confirmation.html, /\$120\.00/);
  assert.match(confirmation.html, /GST \(10%\)/);
  assert.match(confirmation.html, /\+\$12\.00/);
  assert.match(confirmation.html, /\$132\.00/);

  // Plain text checks
  assert.match(confirmation.text, /Stairs Charge: \$20\.00/);
  assert.match(confirmation.text, /Subtotal \(Excl\. GST\): \$120\.00/);
  assert.match(confirmation.text, /Minimum Estimated Cost \(Total Inc\. GST\): \$132\.00/);
});

test('rough estimate scenarios display 2.5h, 3h, and 4h and omit 1h', () => {
  const quotation = buildQuotationEmail({
    _id: 'job-14',
    jobNumber: 'J-14',
    jobType: 'moving',
    customerName: 'Test Customer',
    hourlyRate: 50,
    callOutFee: 25,
  });

  assert.match(quotation.html, /If your job takes 2\.5 hours/);
  assert.match(quotation.html, /If your job takes 3 hours/);
  assert.match(quotation.html, /If your job takes 4 hours/);
  assert.doesNotMatch(quotation.html, /If your job completes within 1 hr/);
});

test('Important Booking Information is only rendered in booking confirmation and omitted from quotation', () => {
  const quotation = buildQuotationEmail({
    _id: 'job-15',
    jobNumber: 'J-15',
    jobType: 'moving',
    customerName: 'Test Customer',
    hourlyRate: 50,
  });

  const confirmation = buildBookingConfirmationEmail({
    _id: 'job-16',
    jobNumber: 'J-16',
    jobType: 'moving',
    customerName: 'Test Customer',
    hourlyRate: 50,
    bookingDepositAmount: 50,
  });

  assert.doesNotMatch(quotation.html, /Important Booking Information/);
  assert.doesNotMatch(quotation.html, /Please Review Before Confirming/);

  assert.match(confirmation.html, /Important Booking Information/);
  assert.match(confirmation.html, /Please Review Before Confirming/);
  assert.doesNotMatch(confirmation.html, /Glass, mirrors, stone items including marble and granite, paintings, artwork, composite materials, and similar fragile items are not covered under our insurance due to their extremely fragile nature\. We will take reasonable care and precautions when handling these items, provided they can be safely moved\./);
});



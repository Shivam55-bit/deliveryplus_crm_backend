import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderEmailTemplate,
  renderTemplatePreview,
  buildJobVariablesMap,
  replaceVariables,
} from '../src/services/templateRenderer.js';
import {
  getDefaultTemplateConfig,
  DEFAULT_QUOTATION_TEMPLATE,
  DEFAULT_BOOKING_CONFIRMATION_TEMPLATE,
} from '../src/utils/defaultTemplateConfigs.js';

test('replaceVariables safely substitutes known variables and removes unknown ones', () => {
  const map = {
    '{{customer_name}}': 'Shivam Sharma',
    '{{job_id}}': 'JOB-999',
  };

  const templateStr = 'Hello {{customer_name}}, your booking reference is {{job_id}}. Unknown: {{unknown_variable}}';
  const result = replaceVariables(templateStr, map);

  assert.equal(result, 'Hello Shivam Sharma, your booking reference is JOB-999. Unknown: ');
});

test('buildJobVariablesMap correctly parses mock job data', () => {
  const mockJob = {
    jobNumber: 'JOB-00100',
    customerName: 'Alice Smith',
    customerPhone: '0400111222',
    customerEmail: 'alice@example.com',
    jobType: 'Moving',
    pickupAddress: '10 King St',
    dropoffAddress: '20 Queen St',
    scheduledDate: '2026-09-01',
    scheduledTime: '10:00',
    bookingDepositAmount: 150,
    hourlyRate: 140,
  };

  const vars = buildJobVariablesMap(mockJob);
  assert.equal(vars['{{job_id}}'], 'JOB-00100');
  assert.equal(vars['{{customer_name}}'], 'Alice Smith');
  assert.equal(vars['{{pickup_location}}'], '10 King St');
  assert.equal(vars['{{dropoff_location}}'], '20 Queen St');
  assert.equal(vars['{{deposit_amount}}'], '$150.00');
});

test('renderTemplatePreview generates valid HTML for quotation with customized subject and colors', () => {
  const customConfig = {
    ...DEFAULT_QUOTATION_TEMPLATE,
    subject: 'Special Quote for {{customer_name}} - {{job_id}}',
    designConfig: {
      ...DEFAULT_QUOTATION_TEMPLATE.designConfig,
      primaryColor: '#7C3AED',
      emailWidth: '650px',
    },
  };

  const preview = renderTemplatePreview('quotation', customConfig, {
    '{{customer_name}}': 'Bob Vance',
    '{{job_id}}': 'JOB-777',
  });

  assert.ok(preview.subject.includes('Special Quote for Bob Vance - JOB-777'));
  assert.ok(preview.html.includes('#7C3AED'));
  assert.ok(preview.html.includes('650px'));
  assert.ok(preview.html.includes('Bob Vance'));
});

test('renderTemplatePreview respects disabled sections', () => {
  const customConfig = {
    ...DEFAULT_QUOTATION_TEMPLATE,
    sectionsConfig: DEFAULT_QUOTATION_TEMPLATE.sectionsConfig.map((sec) =>
      sec.id === 'paymentNotice' ? { ...sec, enabled: false } : sec
    ),
  };

  const preview = renderTemplatePreview('quotation', customConfig);
  assert.ok(!preview.html.includes('Important Payment Notice'));
});

test('renderTemplatePreview respects reordered sections', () => {
  const customConfig = {
    ...DEFAULT_QUOTATION_TEMPLATE,
    sectionsConfig: [
      { id: 'footer', name: 'Footer', enabled: true, order: 1 },
      { id: 'header', name: 'Header', enabled: true, order: 2 },
    ],
  };

  const preview = renderTemplatePreview('quotation', customConfig);
  const footerIdx = preview.html.indexOf('Delivery Plus Australia');
  const headerIdx = preview.html.indexOf('CALL US');

  assert.ok(footerIdx !== -1);
  assert.ok(headerIdx !== -1);
  assert.ok(footerIdx < headerIdx, 'Footer should render before Header when reordered');
});

test('renderTemplatePreview generates booking confirmation email HTML', () => {
  const preview = renderTemplatePreview('booking_confirmation', DEFAULT_BOOKING_CONFIRMATION_TEMPLATE, {
    '{{customer_name}}': 'Jane Doe',
    '{{deposit_amount}}': '$200.00',
  });

  assert.ok(preview.subject.includes('Delivery Plus Booking Confirmation'));
  assert.ok(preview.html.includes('Jane Doe'));
  assert.ok(preview.html.includes('$200.00'));
});

test('renderEmailTemplate falls back safely to default when database template is not found', async () => {
  const job = {
    jobNumber: 'JOB-99999',
    customerName: 'Fallback Tester',
    customerEmail: 'test@example.com',
    customerPhone: '0412345678',
    jobType: 'delivery',
    pickupAddress: '1 Test Way',
    dropoffAddress: '2 Test St',
    fixedPrice: 300,
    depositAmount: 50,
  };

  const result = await renderEmailTemplate('quotation', job);
  assert.ok(result.subject.includes('JOB-99999'));
  assert.ok(result.html.includes('Fallback Tester') || result.html.includes('Delivery Plus'));
});

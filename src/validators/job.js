import { body } from 'express-validator';

const parseBoolean = (value) => {
  if (value === true) {
    return true;
  }

  if (value === false) {
    return false;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'on'].includes(normalized);
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  return false;
};

export const createJobValidator = [
  body('customerName').trim().notEmpty().withMessage('Customer name is required'),
  body('customerPhone').trim().notEmpty().withMessage('Customer phone is required'),
  body('pickupAddress').trim().notEmpty().withMessage('Pickup address is required'),
  body('dropAddress').trim().notEmpty().withMessage('Drop-off address is required'),
  body('jobType')
    .trim()
    .toLowerCase()
    .isIn(['delivery', 'moving'])
    .withMessage('Job type must be delivery or moving'),
  body('scheduledDate').isISO8601().withMessage('Valid scheduled date is required'),
  body('pricingType')
    .if((value, { req }) => String(req.body.jobType || '').trim().toLowerCase() === 'moving')
    .isIn(['hourly', 'fixed'])
    .withMessage('Invalid pricing type'),
  body('hourlyRate')
    .if((value, { req }) => String(req.body.jobType || '').trim().toLowerCase() === 'moving' && String(req.body.pricingType || '').trim().toLowerCase() === 'hourly')
    .notEmpty().withMessage('Hourly rate is required for moving jobs')
    .bail()
    .isNumeric().withMessage('Hourly rate must be a number'),
  body('fixedPrice')
    .if((value, { req }) => String(req.body.jobType || '').trim().toLowerCase() === 'moving' && String(req.body.pricingType || '').trim().toLowerCase() === 'fixed')
    .notEmpty().withMessage('Fixed price is required for moving jobs')
    .bail()
    .isNumeric().withMessage('Fixed price must be a number'),
  body('movers')
    .if((value, { req }) => String(req.body.jobType || '').trim().toLowerCase() === 'moving')
    .notEmpty().withMessage('Movers count is required for moving jobs')
    .bail()
    .isNumeric().withMessage('Movers must be a number'),
  body('estimatedHours').optional().isNumeric().withMessage('Estimated hours must be a number'),
  body('fixedQuote').optional().isNumeric().withMessage('Fixed quote must be a number'),
  body('showDriverPrice').optional().isBoolean().withMessage('showDriverPrice must be a boolean'),
  body('driverPriceType')
    .optional()
    .if((value, { req }) => req.body.showDriverPrice === true || req.body.showDriverPrice === 'true')
    .isIn(['full', 'custom', 'percentage'])
    .withMessage('driverPriceType must be full, custom, or percentage'),
  body('driverPrice')
    .optional()
    .if((value, { req }) => (req.body.showDriverPrice === true || req.body.showDriverPrice === 'true') && req.body.driverPriceType === 'custom')
    .isFloat({ min: 0 })
    .withMessage('driverPrice must be a positive number'),
  body('driverPricePercentage')
    .optional()
    .if((value, { req }) => (req.body.showDriverPrice === true || req.body.showDriverPrice === 'true') && req.body.driverPriceType === 'percentage')
    .isFloat({ min: 0, max: 100 })
    .withMessage('driverPricePercentage must be between 0 and 100'),
];

export const assignDriverValidator = [
  body('driverIds').isArray({ min: 1 }).withMessage('At least one driver is required'),
  body('driverIds.*').isMongoId().withMessage('Invalid driver ID'),
  body('vehicleId').optional().isMongoId().withMessage('Invalid vehicle ID'),
];

const normalizePaymentMethod = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['online payment', 'online-payment', 'transfer', 'upi', 'bank-transfer', 'bank transfer'].includes(normalized)) {
    return 'online';
  }
  if (['cash payment', 'cash-on-delivery', 'cod'].includes(normalized)) {
    return 'cash';
  }
  if (['other payment', 'cheque', 'card', 'eft'].includes(normalized)) {
    return 'other';
  }
  return normalized;
};

export const completeJobValidator = [
  body('termsAccepted')
    .exists({ checkFalsy: false })
    .withMessage('Terms must be accepted before completing the job.')
    .customSanitizer((value) => parseBoolean(value))
    .custom((value) => value === true)
    .withMessage('Terms must be accepted before completing the job.'),
  body('termsVersion').optional().trim().isString().withMessage('Terms version must be a string'),
  body('paymentMethod')
    .optional()
    .trim()
    .customSanitizer((value) => normalizePaymentMethod(value))
    .isIn(['cash', 'online', 'other'])
    .withMessage('Payment method must be cash, online, or other.'),
  body('amountReceived').optional().isFloat({ min: 0 }).withMessage('Amount received must be zero or greater.'),
  body('paymentTransactionReference').optional().trim().isString(),
  body('transactionReference').optional().trim().isString(),
  body('otherPaymentDetails').optional().trim().isString(),
  body('hasDamage').optional().customSanitizer((value) => parseBoolean(value)),
  body('damageReport').optional().trim().isString(),
];

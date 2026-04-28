import { body } from 'express-validator';

export const createJobValidator = [
  body('customerName').trim().notEmpty().withMessage('Customer name is required'),
  body('customerPhone').trim().notEmpty().withMessage('Customer phone is required'),
  body('pickupAddress').trim().notEmpty().withMessage('Pickup address is required'),
  body('dropAddress').trim().notEmpty().withMessage('Drop-off address is required'),
  body('jobType').isIn(['delivery', 'moving']).withMessage('Job type must be delivery or moving'),
  body('scheduledDate').isISO8601().withMessage('Valid scheduled date is required'),
  body('pricingType').optional().isIn(['hourly', 'fixed']).withMessage('Invalid pricing type'),
  body('hourlyRate').optional().isNumeric().withMessage('Hourly rate must be a number'),
  body('estimatedHours').optional().isNumeric().withMessage('Estimated hours must be a number'),
  body('fixedQuote').optional().isNumeric().withMessage('Fixed quote must be a number'),
];

export const assignDriverValidator = [
  body('driverIds').isArray({ min: 1 }).withMessage('At least one driver is required'),
  body('driverIds.*').isMongoId().withMessage('Invalid driver ID'),
  body('vehicleId').optional().isMongoId().withMessage('Invalid vehicle ID'),
];

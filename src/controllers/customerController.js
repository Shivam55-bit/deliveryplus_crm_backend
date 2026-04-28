import Customer from '../models/Customer.js';
import { sendResponse, sendError, buildPaginationMeta } from '../utils/response.js';

export const getCustomers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, isActive } = req.query;
    const filter = {};
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await Customer.countDocuments(filter);
    const customers = await Customer.find(filter)
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort({ createdAt: -1 });

    sendResponse(res, 200, { customers, pagination: buildPaginationMeta(total, page, limit) });
  } catch (error) {
    next(error);
  }
};

export const getCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return sendError(res, 404, 'Customer not found.');
    sendResponse(res, 200, { customer });
  } catch (error) {
    next(error);
  }
};

export const createCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.create(req.body);
    sendResponse(res, 201, { customer }, 'Customer created.');
  } catch (error) {
    next(error);
  }
};

export const updateCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!customer) return sendError(res, 404, 'Customer not found.');
    sendResponse(res, 200, { customer }, 'Customer updated.');
  } catch (error) {
    next(error);
  }
};

export const deleteCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!customer) return sendError(res, 404, 'Customer not found.');
    sendResponse(res, 200, { customer }, 'Customer deactivated.');
  } catch (error) {
    next(error);
  }
};

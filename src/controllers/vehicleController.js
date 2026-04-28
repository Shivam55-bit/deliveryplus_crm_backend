import Vehicle from '../models/Vehicle.js';
import { sendResponse, sendError } from '../utils/response.js';

export const getVehicles = async (req, res, next) => {
  try {
    const { isAvailable } = req.query;
    const filter = { isActive: true };
    if (isAvailable !== undefined) filter.isAvailable = isAvailable === 'true';

    const vehicles = await Vehicle.find(filter).sort({ name: 1 });
    sendResponse(res, 200, { vehicles });
  } catch (error) {
    next(error);
  }
};

export const createVehicle = async (req, res, next) => {
  try {
    const vehicle = await Vehicle.create(req.body);
    sendResponse(res, 201, { vehicle }, 'Vehicle created.');
  } catch (error) {
    next(error);
  }
};

export const updateVehicle = async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!vehicle) return sendError(res, 404, 'Vehicle not found.');
    sendResponse(res, 200, { vehicle }, 'Vehicle updated.');
  } catch (error) {
    next(error);
  }
};

export const deleteVehicle = async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!vehicle) return sendError(res, 404, 'Vehicle not found.');
    sendResponse(res, 200, { vehicle }, 'Vehicle deactivated.');
  } catch (error) {
    next(error);
  }
};

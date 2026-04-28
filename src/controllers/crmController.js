import Lead from '../models/Lead.js';
import FollowUp from '../models/FollowUp.js';
import { sendResponse, sendError, buildPaginationMeta } from '../utils/response.js';

export const getLeads = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await Lead.countDocuments(filter);
    const leads = await Lead.find(filter)
      .populate('assignedTo', 'name')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort({ createdAt: -1 });

    sendResponse(res, 200, { leads, pagination: buildPaginationMeta(total, page, limit) });
  } catch (error) {
    next(error);
  }
};

export const createLead = async (req, res, next) => {
  try {
    const lead = await Lead.create(req.body);
    sendResponse(res, 201, { lead }, 'Lead created.');
  } catch (error) {
    next(error);
  }
};

export const updateLead = async (req, res, next) => {
  try {
    const lead = await Lead.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!lead) return sendError(res, 404, 'Lead not found.');
    sendResponse(res, 200, { lead }, 'Lead updated.');
  } catch (error) {
    next(error);
  }
};

export const deleteLead = async (req, res, next) => {
  try {
    await Lead.findByIdAndDelete(req.params.id);
    sendResponse(res, 200, null, 'Lead deleted.');
  } catch (error) {
    next(error);
  }
};

// Follow-ups
export const getFollowUps = async (req, res, next) => {
  try {
    const { relatedTo, relatedId, status } = req.query;
    const filter = {};
    if (relatedTo) filter.relatedTo = relatedTo;
    if (relatedId) filter.relatedId = relatedId;
    if (status) filter.status = status;

    const followUps = await FollowUp.find(filter)
      .populate('assignedTo', 'name')
      .sort({ dueDate: 1 });

    sendResponse(res, 200, { followUps });
  } catch (error) {
    next(error);
  }
};

export const createFollowUp = async (req, res, next) => {
  try {
    const followUp = await FollowUp.create(req.body);
    sendResponse(res, 201, { followUp }, 'Follow-up created.');
  } catch (error) {
    next(error);
  }
};

export const updateFollowUp = async (req, res, next) => {
  try {
    const followUp = await FollowUp.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!followUp) return sendError(res, 404, 'Follow-up not found.');
    sendResponse(res, 200, { followUp }, 'Follow-up updated.');
  } catch (error) {
    next(error);
  }
};

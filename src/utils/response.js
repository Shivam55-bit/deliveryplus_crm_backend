export const sendResponse = (res, statusCode, data, message = 'Success') => {
  res.status(statusCode).json({ success: true, message, data });
};

export const sendError = (res, statusCode, message = 'Error', errors = null) => {
  const response = { success: false, message };
  if (errors) response.errors = errors;
  res.status(statusCode).json(response);
};

export const paginateQuery = (query, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  return query.skip(skip).limit(limit);
};

export const buildPaginationMeta = (total, page, limit) => ({
  total,
  page: Number(page),
  limit: Number(limit),
  totalPages: Math.ceil(total / limit),
});

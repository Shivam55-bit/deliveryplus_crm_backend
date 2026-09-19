import { sendError } from '../utils/response.js';

const errorHandler = (err, req, res, _next) => {
  console.error('Error:', err.message);

  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    return sendError(res, 400, 'Validation Error', messages);
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0] || 'unknown';
    const message = `Duplicate value for ${field}.`;
    return sendError(res, 400, message, { [field]: [message] });
  }

  if (err.name === 'CastError') {
    return sendError(res, 400, 'Invalid ID format.');
  }

  if (err.name === 'JsonWebTokenError') {
    return sendError(res, 401, 'Invalid token.');
  }

  return sendError(res, err.statusCode || 500, err.message || 'Internal Server Error');
};

export default errorHandler;

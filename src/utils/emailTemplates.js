/**
 * Streamlined Email Template Factory
 * Delegates HTML rendering to dedicated modular templates in ../templates/emails/
 */

import {
  compileQuotationEmail,
  compileBookingConfirmationEmail,
  escapeHtml,
  hasValue,
  firstValue,
  displayValue,
  safeText,
  toNumber,
  roundMoney,
  formatCurrency,
  formatDate,
  formatTime,
  formatDurationMinutes,
  formatAddress,
  formatTruckSize,
  formatItemList,
  formatPropertySize,
  getCanonicalPickupAddress,
  getCanonicalDropAddress,
  getPricingObject,
  getBankDetails,
  makeLogoAttachment,
} from './emailTemplateEngine.js';

export {
  escapeHtml,
  hasValue,
  firstValue,
  displayValue,
  safeText,
  toNumber,
  roundMoney,
  formatCurrency,
  formatDate,
  formatTime,
  formatDurationMinutes,
  formatAddress,
  formatTruckSize,
  formatItemList,
  formatPropertySize,
  getCanonicalPickupAddress,
  getCanonicalDropAddress,
  getPricingObject,
  getBankDetails,
  makeLogoAttachment,
};

/**
 * Builds quotation email using modular HTML template
 * @param {Object} job
 * @param {Object} options
 * @returns {{ subject: string, html: string, text: string, attachments: Array }}
 */
export const buildQuotationEmail = (job = {}, options = {}) => {
  return compileQuotationEmail(job, options);
};

/**
 * Builds booking confirmation email using modular HTML template
 * @param {Object} job
 * @param {Object} options
 * @returns {{ subject: string, html: string, text: string, attachments: Array }}
 */
export const buildBookingConfirmationEmail = (job = {}, options = {}) => {
  return compileBookingConfirmationEmail(job, options);
};
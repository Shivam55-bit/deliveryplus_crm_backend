import mongoose from 'mongoose';
import EmailTemplate from '../models/EmailTemplate.js';
import { buildQuotationEmail, buildBookingConfirmationEmail } from '../utils/emailTemplates.js';
import {
  getDefaultTemplateConfig,
  SAMPLE_DATA_MAP,
  AVAILABLE_VARIABLES,
  DEFAULT_TERMS_LIST,
} from '../utils/defaultTemplateConfigs.js';

const escapeHtml = (value = '') =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const hasValue = (value) => value !== undefined && value !== null && value !== '';

const firstValue = (...values) => values.find(hasValue);

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const formatCurrency = (value) => {
  if (!hasValue(value)) return 'N/A';
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 'N/A';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(amount);
};

const formatDate = (value) => {
  if (!value) return 'N/A';
  const raw = String(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Australia/Melbourne',
  }).format(date);
};

const formatTime = (value) => {
  if (!value) return 'N/A';
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(value);
  let hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${suffix}`;
};

const formatDurationMinutes = (value) => {
  const totalMinutes = Math.max(0, Math.round(toNumber(value, 0)));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours} ${hours === 1 ? 'Hr' : 'Hrs'} ${minutes} Mins`;
  if (hours > 0) return `${hours} ${hours === 1 ? 'Hr' : 'Hrs'}`;
  return `${minutes} Mins`;
};

const formatAddress = ({ address, suburb, state, postcode }) =>
  [address, suburb, state, postcode]
    .filter(hasValue)
    .map((v) => String(v).trim())
    .filter(Boolean)
    .join(', ');

const formatTruckSize = (value) => {
  if (!hasValue(value)) return 'Not provided';
  const raw = String(value).trim();
  if (!raw) return 'Not provided';
  if (/tonne|truck|van|ute|luton|container/i.test(raw)) return raw;
  const cleaned = raw.replace(/\s*(tons?|tonnes?|t)\s*$/i, '').trim();
  return cleaned ? `${cleaned} Tonne` : 'Not provided';
};

const formatItemList = (job = {}) => {
  const rawValue = [
    job.items,
    job.lineItems,
    job.itemList,
    job.lineItemsText,
    job.movingItems,
    job.inventory,
    job.jobItems,
  ].find((v) => (Array.isArray(v) && v.length > 0) || (typeof v === 'string' && v.trim().length > 0)) ?? '';

  if (typeof rawValue === 'string') {
    const values = rawValue.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
    return values.length ? values.join(', ') : 'Not provided';
  }

  if (Array.isArray(rawValue)) {
    const values = rawValue
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        const description = String(item?.description ?? item?.name ?? item?.title ?? item?.item ?? '').trim();
        if (!description) return '';
        const quantity = Number(item?.quantity);
        return Number.isFinite(quantity) && quantity > 1 ? `${description} × ${quantity}` : description;
      })
      .filter(Boolean);
    return values.length ? values.join(', ') : 'Not provided';
  }

  return 'Not provided';
};

/**
 * Build dynamic replacement map from real job object
 */
export const buildJobVariablesMap = (job = {}) => {
  const pricing = job.pricing || {};
  const isMoving = String(job.jobType || job.type || '').toLowerCase() === 'moving';
  const pricingType = String(job.pricingType || (job.fixedPrice ? 'fixed' : 'hourly')).toLowerCase();

  const pickupAddr = formatAddress({
    address: firstValue(job.pickupAddress, job.pickup?.address, job.origin?.address),
    suburb: firstValue(job.pickupSuburb, job.pickup?.suburb),
    state: firstValue(job.pickupState, job.pickup?.state),
    postcode: firstValue(job.pickupPostcode, job.pickup?.postcode),
  }) || 'Not provided';

  const dropAddr = formatAddress({
    address: firstValue(job.dropoffAddress, job.dropAddress, job.deliveryAddress, job.dropoff?.address, job.destination?.address),
    suburb: firstValue(job.dropoffSuburb, job.dropSuburb, job.dropoff?.suburb),
    state: firstValue(job.dropoffState, job.dropState, job.dropoff?.state),
    postcode: firstValue(job.dropoffPostcode, job.dropPostcode, job.dropoff?.postcode),
  }) || 'Not provided';

  const rawDate = firstValue(job.scheduledDate, job.scheduledAt, job.date);
  const formattedDate = formatDate(rawDate);

  const scheduleMode = String(firstValue(job.scheduleMode, job.scheduledTimeMode, '')).toLowerCase();
  const formattedTime = scheduleMode === 'window'
    ? `${formatTime(firstValue(job.scheduledStartTime, job.startTime))} - ${formatTime(firstValue(job.scheduledEndTime, job.endTime))}`
    : formatTime(firstValue(job.scheduledTime, job.time, job.scheduledAtTime));

  const hourlyRate = toNumber(firstValue(job.hourlyRate, pricing.hourlyRate, job.ratePerHour), 0);
  const fixedPrice = toNumber(firstValue(job.fixedPrice, job.fixedQuote, job.quoteAmount, pricing.fixedPrice), 0);
  const depositAmount = toNumber(firstValue(job.bookingDepositAmount, job.confirmationAmount, job.depositAmount, job.bookingDeposit), 50);
  const minimumEstimatedCost = toNumber(firstValue(pricing.minimumEstimatedCost, job.estimatedTotal, job.totalAmount), 0);
  const calloutCharge = toNumber(firstValue(pricing.calloutCharge, job.calloutCharge), 0);
  const travelBackCharge = toNumber(firstValue(pricing.travelBackCharge, job.travelBackCharge), 0);
  const stairsCharge = toNumber(firstValue(pricing.stairsCharge, job.stairsCharge, job.stairsFee), 0);

  const subtotal = pricingType === 'fixed' ? fixedPrice : minimumEstimatedCost || hourlyRate;
  const total = toNumber(firstValue(job.totalAmount, job.total, subtotal), subtotal);

  const truckSize = formatTruckSize(firstValue(job.truckSize, job.vehicleSize, job.truckType));
  const movers = String(firstValue(job.movers, job.numberOfMovers, job.moverCount, 'Not provided'));
  const propertySize = String(firstValue(job.propertySize, job.sizeOfProperty, job.bedrooms, 'Not provided'));

  const rawCustomerName = firstValue(job.customerName, job.customer?.name, job.customerId?.name, job.clientName, job.contactName, job.name);
  const customerName = (rawCustomerName && !['quotation', 'quote', 'undefined', 'null'].includes(String(rawCustomerName).trim().toLowerCase()))
    ? String(rawCustomerName).trim()
    : String(firstValue(job.customer?.name, job.customerId?.name, 'Customer'));
  const customerPhone = String(firstValue(job.customerPhone, job.customer?.phone, job.customerId?.phone, job.clientPhone, job.phone, 'N/A'));
  const customerEmail = String(firstValue(job.customerEmail, job.customer?.email, job.customerId?.email, job.clientEmail, job.email, 'N/A'));
  const jobNumber = String(firstValue(job.jobNumber, job.quoteRef, job.jobReference, job.referenceNumber, 'N/A'));

  return {
    '{{customer_name}}': customerName,
    '{{CUSTOMER_NAME}}': customerName,
    '{{customer_phone}}': customerPhone,
    '{{CUSTOMER_PHONE}}': customerPhone,
    '{{customer_email}}': customerEmail,
    '{{CUSTOMER_EMAIL}}': customerEmail,
    '{{job_id}}': jobNumber,
    '{{JOB_ID}}': jobNumber,
    '{{job_number}}': jobNumber,
    '{{JOB_NUMBER}}': jobNumber,
    '{{job_type}}': String(firstValue(job.jobType, job.type, 'Delivery')),
    '{{pickup_location}}': pickupAddr,
    '{{dropoff_location}}': dropAddr,
    '{{booking_date}}': formattedDate,
    '{{booking_time}}': formattedTime,
    '{{truck_size}}': truckSize,
    '{{movers_count}}': movers,
    '{{property_size}}': propertySize,
    '{{pricing_type}}': pricingType === 'fixed' ? 'Fixed Price' : 'Hourly Rate',
    '{{hourly_rate}}': formatCurrency(hourlyRate),
    '{{fixed_price}}': formatCurrency(fixedPrice),
    '{{deposit_amount}}': formatCurrency(depositAmount),
    '{{minimum_estimated_cost}}': formatCurrency(minimumEstimatedCost),
    '{{callout_charge}}': formatCurrency(calloutCharge),
    '{{travel_back_charge}}': formatCurrency(travelBackCharge),
    '{{stairs_charge}}': formatCurrency(stairsCharge),
    '{{subtotal}}': formatCurrency(subtotal),
    '{{total_amount}}': formatCurrency(total),
    '{{booking_status}}': String(firstValue(job.bookingStatus, job.status, 'Quotation')),
    '{{confirmed_at}}': formatDate(firstValue(job.confirmedAt, job.confirmation?.confirmedAt, new Date())),
    '{{driver_name}}': String(firstValue(job.driver?.name, job.driverName, 'Assigned Driver')),
    '{{driver_phone}}': String(firstValue(job.driver?.phone, job.driverPhone, 'N/A')),
    '{{vehicle_name}}': String(firstValue(job.vehicle?.name, job.vehicleName, 'Delivery Truck')),
    '{{vehicle_number}}': String(firstValue(job.vehicle?.registration, job.vehicleRego, 'N/A')),
    '{{company_name}}': 'Delivery Plus Australia',
    '{{company_phone}}': '03 7008 5094',
    '{{company_mobile}}': '04 2479 6524',
    '{{company_email}}': 'info@deliveryplus.com.au',
    '{{company_website}}': 'https://deliveryplus.com.au',
  };
};

/**
 * Safe Variable Replacer
 */
export const replaceVariables = (str = '', dataMap = {}) => {
  if (typeof str !== 'string') return '';
  return str.replace(/\{\{([a-zA-Z0-9_-]+)\}\}/g, (match) => {
    if (Object.prototype.hasOwnProperty.call(dataMap, match)) {
      return dataMap[match];
    }
    const cleanKey = match.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(dataMap, cleanKey)) {
      return dataMap[cleanKey];
    }
    return '';
  });
};

/**
 * Generate Responsive HTML Table for Custom Quotation Template
 */
const renderCustomQuotationHtml = ({ templateConfig, dataMap, job, attachments = [] }) => {
  const content = templateConfig.contentConfig || {};
  const design = templateConfig.designConfig || {};
  const logo = templateConfig.logoConfig || {};
  const cta = templateConfig.ctaConfig || {};
  const sections = (templateConfig.sectionsConfig || []).sort((a, b) => (a.order || 0) - (b.order || 0));

  const primaryColor = design.primaryColor || '#00B9E8';
  const headerBgColor = design.headerBgColor || '#0D1B4C';
  const pageBgColor = design.pageBgColor || '#EEF4F8';
  const cardBgColor = design.cardBgColor || '#ffffff';
  const textColor = design.textColor || '#59677A';
  const headingColor = design.headingColor || '#101D4F';
  const borderColor = design.borderColor || '#DDE6EE';
  const emailWidth = design.emailWidth || '700px';
  const borderRadius = design.borderRadius || '16px';
  const fontFamily = design.fontFamily || 'Arial, Helvetica, sans-serif';

  const sub = replaceVariables(templateConfig.subject, dataMap);
  const rep = (text) => escapeHtml(replaceVariables(text, dataMap));

  const sectionBlocks = {};

  // 1. HEADER
  const logoSrc = logo.customUrl || (logo.useAttachment ? 'cid:deliveryplus-logo' : '');
  const logoAlign = logo.alignment || 'left';
  sectionBlocks['header'] = `
    <tr>
      <td style="padding:28px 36px 20px;background:${headerBgColor};border-bottom:3px solid ${primaryColor};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="55%" valign="middle" align="${logoAlign}" style="padding:6px 0;text-align:${logoAlign};">
              ${
                logo.enabled !== false && logoSrc
                  ? `<img src="${logoSrc}" alt="Delivery Plus" width="${logo.width || 220}" style="width:${logo.width || 220}px;max-width:100%;height:auto;display:inline-block;border:0;">`
                  : `<div style="font-size:24px;font-weight:900;color:#ffffff;letter-spacing:.5px;">DELIVERY <span style="color:${primaryColor};">PLUS</span></div>`
              }
              <div style="margin-top:8px;color:#BFD6EE;font-size:13px;line-height:18px;font-weight:500;">
                ${rep(content.footerTagline || 'Trusted Transit at Affordable Prices')}
              </div>
            </td>
            <td width="45%" valign="middle" align="right" style="text-align:right;">
              <div style="font-size:11px;color:#8FA9CC;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:6px;">CALL US</div>
              <div style="font-size:15px;line-height:22px;font-weight:700;color:#ffffff;">
                <a href="tel:${dataMap['{{company_phone}}'] || '0370085094'}" style="color:#ffffff;text-decoration:none;">☎ ${dataMap['{{company_phone}}'] || '03 7008 5094'}</a>
              </div>
              <div style="font-size:15px;line-height:22px;font-weight:700;color:#ffffff;margin-top:4px;">
                <a href="tel:${dataMap['{{company_mobile}}'] || '0424796524'}" style="color:#ffffff;text-decoration:none;">📱 ${dataMap['{{company_mobile}}'] || '04 2479 6524'}</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // 2. HERO
  sectionBlocks['hero'] = `
    <tr>
      <td style="padding:36px 40px 28px;border-bottom:1px solid ${borderColor};">
        <div style="display:inline-block;padding:6px 14px;background:#E8F8FC;border:1px solid rgba(0,185,232,.35);border-radius:999px;color:${headingColor};font-size:12px;line-height:16px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">
          ${rep(content.badgeText || 'Quotation')}
        </div>
        <div style="margin-top:12px;color:${textColor};font-size:15px;line-height:24px;">
          ${rep(content.heroCopy || 'Thank you for choosing Delivery Plus. Please review your relocation details and quotation below.')}
        </div>
        <div style="margin-top:16px;color:#172033;font-size:15px;line-height:22px;">
          <strong>${rep(content.greeting || 'Hi {{customer_name}},')}</strong>
        </div>
        <div style="margin-top:4px;color:${textColor};font-size:15px;line-height:22px;">
          ${rep(content.subGreeting || 'Please review your job details and quotation below.')}
        </div>
        ${
          content.reviewLinkUrl
            ? `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;">
              <tr>
                <td style="padding:10px 16px;background:#ffffff;border:1px solid ${borderColor};border-radius:10px;color:#172033;font-size:13px;font-weight:700;">
                  <a href="${escapeHtml(content.reviewLinkUrl)}" style="color:#172033;text-decoration:none;">
                    <span style="color:#F5B800;letter-spacing:1px;">★★★★★</span> &nbsp; ${rep(content.reviewLinkText || 'Google Reviews')}
                  </a>
                </td>
              </tr>
            </table>
            `
            : ''
        }
      </td>
    </tr>
  `;

  // 3. QUOTE REFERENCE
  sectionBlocks['quoteReference'] = `
    <tr>
      <td style="padding:28px 40px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="width:100%;background:#E8F8FC;border:1px solid rgba(0,185,232,.30);border-radius:12px;">
          <tr>
            <td style="padding:20px 24px;">
              <div style="font-size:12px;line-height:16px;color:${headingColor};font-weight:800;text-transform:uppercase;letter-spacing:1px;">
                ${rep(content.referenceCardTitle || 'Quote Reference')}
              </div>
              <div style="margin-top:6px;font-size:24px;line-height:29px;color:${headingColor};font-weight:900;">
                ${dataMap['{{job_id}}'] || 'N/A'}
              </div>
            </td>
            <td width="50" align="center" style="padding:20px 20px;">
              <div style="width:12px;height:12px;border-radius:50%;background:${primaryColor};box-shadow:0 0 0 4px rgba(0,185,232,.18);">&nbsp;</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // 4. OVERVIEW AND ROUTE
  sectionBlocks['overviewAndRoute'] = `
    <tr>
      <td style="padding:0 40px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="50%" valign="top" style="padding-right:12px;">
              <div style="margin-bottom:10px;font-size:16px;line-height:22px;font-weight:800;color:${headingColor};">
                ${rep(content.jobOverviewTitle || 'Job Overview')}
              </div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                style="width:100%;background:#ffffff;border:1px solid ${borderColor};border-radius:12px;overflow:hidden;">
                <tr>
                  <td style="padding:10px 14px;border-bottom:1px solid #EEF4F8;">
                    <div style="font-size:10.5px;color:#64748B;text-transform:uppercase;font-weight:600;letter-spacing:.3px;">Customer</div>
                    <div style="margin-top:2px;font-size:13px;color:#334155;font-weight:600;">${dataMap['{{customer_name}}']}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;border-bottom:1px solid #EEF4F8;">
                    <div style="font-size:10.5px;color:#64748B;text-transform:uppercase;font-weight:600;letter-spacing:.3px;">Contact</div>
                    <div style="margin-top:2px;font-size:12px;color:#475569;font-weight:500;">${dataMap['{{customer_phone}}']} <span style="color:#CBD5E1;">•</span> ${dataMap['{{customer_email}}']}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;border-bottom:1px solid #EEF4F8;">
                    <div style="font-size:10.5px;color:#64748B;text-transform:uppercase;font-weight:600;letter-spacing:.3px;">Job Type</div>
                    <div style="margin-top:2px;font-size:12.5px;color:#334155;font-weight:600;text-transform:capitalize;">${dataMap['{{job_type}}']}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;">
                    <div style="font-size:10.5px;color:#64748B;text-transform:uppercase;font-weight:600;letter-spacing:.3px;">Schedule</div>
                    <div style="margin-top:2px;font-size:12.5px;color:#334155;font-weight:600;">${dataMap['{{booking_date}}']} at ${dataMap['{{booking_time}}']}</div>
                  </td>
                </tr>
              </table>
            </td>
            <td width="50%" valign="top" style="padding-left:12px;">
              <div style="margin-bottom:10px;font-size:16px;line-height:22px;font-weight:800;color:${headingColor};">
                ${rep(content.routeSectionTitle || 'Pickup & Drop-off')}
              </div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                style="width:100%;background:#ffffff;border:1px solid ${borderColor};border-radius:12px;">
                <tr>
                  <td width="36" valign="top" align="center" style="padding:16px 0 0 14px;">
                    <div style="width:12px;height:12px;border:3px solid ${primaryColor};border-radius:50%;background:#ffffff;"></div>
                    <div style="width:2px;height:42px;margin:4px auto;background:${borderColor};"></div>
                  </td>
                  <td style="padding:14px 16px 8px 10px;">
                    <div style="font-size:10px;line-height:14px;color:#64748B;font-weight:800;text-transform:uppercase;">Pickup Address</div>
                    <div style="margin-top:3px;color:#172033;font-size:13.5px;line-height:19px;font-weight:700;">${dataMap['{{pickup_location}}']}</div>
                  </td>
                </tr>
                <tr>
                  <td width="36" valign="top" align="center" style="padding:0 0 16px 14px;">
                    <div style="width:12px;height:12px;border:3px solid ${headingColor};border-radius:50%;background:${headingColor};"></div>
                  </td>
                  <td style="padding:0 16px 16px 10px;">
                    <div style="font-size:10px;line-height:14px;color:#64748B;font-weight:800;text-transform:uppercase;">Drop-off Address</div>
                    <div style="margin-top:3px;color:#172033;font-size:13.5px;line-height:19px;font-weight:700;">${dataMap['{{dropoff_location}}']}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // 5. MOVING DETAILS
  sectionBlocks['movingDetails'] = `
    <tr>
      <td style="padding:0 40px 28px;">
        <div style="margin-bottom:12px;font-size:18px;line-height:23px;font-weight:800;color:${headingColor};">
          ${rep(content.movingDetailsTitle || 'Moving Details')}
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="width:100%;background:#ffffff;border:1px solid ${borderColor};border-radius:12px;overflow:hidden;">
          <tr>
            <td width="50%" style="padding:14px 18px;border-bottom:1px solid ${borderColor};border-right:1px solid ${borderColor};">
              <div style="font-size:11px;color:#64748B;text-transform:uppercase;font-weight:700;">Truck Size</div>
              <div style="margin-top:3px;font-size:14px;color:#172033;font-weight:800;">${dataMap['{{truck_size}}']}</div>
            </td>
            <td width="50%" style="padding:14px 18px;border-bottom:1px solid ${borderColor};">
              <div style="font-size:11px;color:#64748B;text-transform:uppercase;font-weight:700;">Movers</div>
              <div style="margin-top:3px;font-size:14px;color:#172033;font-weight:800;">${dataMap['{{movers_count}}']}</div>
            </td>
          </tr>
          <tr>
            <td width="50%" style="padding:14px 18px;border-right:1px solid ${borderColor};">
              <div style="font-size:11px;color:#64748B;text-transform:uppercase;font-weight:700;">Property Size</div>
              <div style="margin-top:3px;font-size:14px;color:#172033;font-weight:800;">${dataMap['{{property_size}}']}</div>
            </td>
            <td width="50%" style="padding:14px 18px;">
              <div style="font-size:11px;color:#64748B;text-transform:uppercase;font-weight:700;">Pricing Model</div>
              <div style="margin-top:3px;font-size:14px;color:#172033;font-weight:800;">${dataMap['{{pricing_type}}']}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // 6. COST BREAKDOWN
  const hasTravelBack = Boolean(dataMap['{{travel_back_charge}}'] && dataMap['{{travel_back_charge}}'] !== '$0.00' && dataMap['{{travel_back_charge}}'] !== '$0' && dataMap['{{travel_back_charge}}'] !== '0');
  const hasStairs = Boolean(dataMap['{{stairs_charge}}'] && dataMap['{{stairs_charge}}'] !== '$0.00' && dataMap['{{stairs_charge}}'] !== '$0' && dataMap['{{stairs_charge}}'] !== '0');
  sectionBlocks['costBreakdown'] = `
    <tr>
      <td style="padding:0 40px 28px;">
        <div style="margin-bottom:12px;font-size:18px;line-height:23px;font-weight:800;color:${headingColor};">
          ${rep(content.costBreakdownTitle || 'Cost Breakdown')}
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="width:100%;background:#ffffff;border:1px solid ${borderColor};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:14px 18px;border-bottom:1px solid ${borderColor};color:#64748B;font-size:13px;font-weight:600;">Rate</td>
            <td align="right" style="padding:14px 18px;border-bottom:1px solid ${borderColor};color:#172033;font-size:14px;font-weight:800;text-align:right;">${dataMap['{{hourly_rate}}']} / hr</td>
          </tr>
          <tr>
            <td style="padding:14px 18px;border-bottom:1px solid ${borderColor};color:#64748B;font-size:13px;font-weight:600;">Callout Charge</td>
            <td align="right" style="padding:14px 18px;border-bottom:1px solid ${borderColor};color:#172033;font-size:14px;font-weight:800;text-align:right;">${dataMap['{{callout_charge}}']}</td>
          </tr>
          ${hasTravelBack ? `
          <tr>
            <td style="padding:14px 18px;border-bottom:1px solid ${borderColor};color:#64748B;font-size:13px;font-weight:600;">Travel Back Charge</td>
            <td align="right" style="padding:14px 18px;border-bottom:1px solid ${borderColor};color:#172033;font-size:14px;font-weight:800;text-align:right;">${dataMap['{{travel_back_charge}}']}</td>
          </tr>
          ` : ''}
          ${hasStairs ? `
          <tr>
            <td style="padding:14px 18px;border-bottom:1px solid ${borderColor};color:#64748B;font-size:13px;font-weight:600;">Stairs Charge</td>
            <td align="right" style="padding:14px 18px;border-bottom:1px solid ${borderColor};color:#172033;font-size:14px;font-weight:800;text-align:right;">${dataMap['{{stairs_charge}}']}</td>
          </tr>
          ` : ''}
          <tr style="background:#F7FAFD;">
            <td style="padding:16px 18px;color:${headingColor};font-size:14px;font-weight:800;">Estimated Total / Minimum</td>
            <td align="right" style="padding:16px 18px;color:${headingColor};font-size:18px;font-weight:900;text-align:right;">${dataMap['{{minimum_estimated_cost}}']}</td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // 7. BOOKING DEPOSIT
  sectionBlocks['bookingDeposit'] = `
    <tr>
      <td style="padding:0 40px 28px;">
        <div style="margin-bottom:12px;font-size:18px;line-height:23px;font-weight:800;color:${headingColor};">
          ${rep(content.depositCardTitle || 'Booking Deposit')}
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="width:100%;background:#E8F8FC;border:1px solid rgba(0,185,232,.30);border-radius:12px;">
          <tr>
            <td style="padding:22px 24px;">
              <div style="font-size:15px;line-height:20px;font-weight:900;color:${headingColor};">${rep(content.depositCardHeading || 'Secure your booking')}</div>
              <div style="margin-top:6px;color:${textColor};font-size:13px;line-height:21px;">
                ${rep(content.depositCardText || 'To confirm your booking, the deposit below is required. This amount will be adjusted against the final payment once the job is completed.')}
              </div>
            </td>
            <td width="160" align="right" style="padding:22px 24px;color:${headingColor};font-size:24px;line-height:30px;font-weight:900;text-align:right;white-space:nowrap;">
              ${dataMap['{{deposit_amount}}']}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // 8. BANK DETAILS
  sectionBlocks['bankDetails'] = `
    <tr>
      <td style="padding:0 40px 28px;">
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;line-height:15px;font-weight:800;color:${primaryColor};text-transform:uppercase;letter-spacing:1px;">
            ${rep(content.bankDetailsSubtitle || 'Direct Bank Transfer')}
          </div>
          <div style="margin-top:2px;font-size:18px;line-height:23px;font-weight:800;color:${headingColor};">
            ${rep(content.bankDetailsTitle || 'Bank Details for Deposit')}
          </div>
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="width:100%;background:#ffffff;border:1px solid ${borderColor};border-radius:12px;overflow:hidden;box-shadow:0 4px 14px rgba(16,29,79,.04);">
          <tr>
            <td style="padding:14px 20px;background:#F7FAFD;border-bottom:1px solid ${borderColor};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="color:${headingColor};font-size:13.5px;font-weight:800;">
                    🏦 ${rep(content.bankName || 'Commonwealth Bank of Australia')}
                  </td>
                  <td align="right" style="text-align:right;">
                    <span style="display:inline-block;padding:4px 10px;background:#E8F8FC;border:1px solid rgba(0,185,232,.35);border-radius:6px;color:${headingColor};font-size:11px;font-weight:800;letter-spacing:.5px;">
                      REF: ${dataMap['{{bank_reference}}'] || dataMap['{{job_id}}']}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:6px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #EEF4F8;color:#64748B;font-size:13px;font-weight:600;">Account Name</td>
                  <td align="right" style="padding:10px 0;border-bottom:1px solid #EEF4F8;color:#172033;font-size:13.5px;font-weight:800;text-align:right;">
                    ${rep(content.bankAccountName || 'Delivery Plus Australia')}
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #EEF4F8;color:#64748B;font-size:13px;font-weight:600;">BSB Number</td>
                  <td align="right" style="padding:10px 0;border-bottom:1px solid #EEF4F8;color:#172033;font-size:14px;font-weight:900;letter-spacing:1px;font-family:monospace;text-align:right;">
                    ${rep(content.bankBsb || '063-000')}
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #EEF4F8;color:#64748B;font-size:13px;font-weight:600;">Account Number</td>
                  <td align="right" style="padding:10px 0;border-bottom:1px solid #EEF4F8;color:#172033;font-size:14px;font-weight:900;letter-spacing:1px;font-family:monospace;text-align:right;">
                    ${rep(content.bankAccountNumber || '1234 5678')}
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#64748B;font-size:13px;font-weight:600;">Payment Description / Ref</td>
                  <td align="right" style="padding:10px 0;color:${primaryColor};font-size:13.5px;font-weight:900;text-align:right;">
                    ${dataMap['{{bank_reference}}'] || dataMap['{{job_id}}']}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${
            content.bankPaymentInstructions
              ? `
              <tr>
                <td style="padding:12px 20px 14px;background:#F8FAFC;border-top:1px solid ${borderColor};color:#64748B;font-size:12px;line-height:18px;">
                  💡 ${rep(content.bankPaymentInstructions)}
                </td>
              </tr>
              `
              : ''
          }
        </table>
      </td>
    </tr>
  `;

  // 8. PAYMENT NOTICE
  sectionBlocks['paymentNotice'] = `
    <tr>
      <td style="padding:0 40px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="width:100%;background:#FFF8E7;border:1px solid #F0DFA6;border-left:4px solid #F5B800;border-radius:12px;">
          <tr>
            <td width="48" valign="top" align="center" style="padding:18px 6px 18px 18px;">
              <div style="width:24px;height:24px;border-radius:50%;background:#F5B800;color:#0D1B4C;font-weight:900;font-size:13px;line-height:24px;text-align:center;">!</div>
            </td>
            <td style="padding:18px 20px 18px 8px;">
              <div style="font-size:14px;font-weight:900;color:${headingColor};">${rep(content.paymentNoticeTitle || 'Important Payment Notice')}</div>
              <div style="margin-top:4px;font-size:13px;line-height:20px;color:#6B5A1E;">
                ${rep(content.paymentNoticeText || 'Payment must be made when approximately 75% of the truck has been unloaded at the delivery address.')}
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // 9. NOTES
  sectionBlocks['notes'] = job?.notes
    ? `
    <tr>
      <td style="padding:0 40px 28px;">
        <div style="margin-bottom:12px;">
          <div style="font-size:18px;line-height:23px;font-weight:800;color:${headingColor};">${rep(content.notesTitle || 'Notes')}</div>
          <div style="margin-top:2px;font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;">${rep(content.notesSubtitle || 'Special Instructions')}</div>
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="width:100%;background:#ffffff;border:1px solid ${borderColor};border-radius:12px;">
          <tr>
            <td style="padding:18px 22px;color:#59677A;font-size:13px;line-height:21px;white-space:pre-line;">${escapeHtml(job.notes)}</td>
          </tr>
        </table>
      </td>
    </tr>
    `
    : '';

  // 10. CTA BUTTON
  sectionBlocks['cta'] = cta.enabled && cta.text
    ? `
    <tr>
      <td style="padding:0 40px 28px;" align="${cta.alignment || 'center'}">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${cta.alignment || 'center'}">
          <tr>
            <td style="border-radius:${cta.borderRadius || '8px'};background:${cta.bgColor || primaryColor};text-align:center;">
              <a href="${escapeHtml(replaceVariables(cta.url || '#', dataMap))}"
                style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:800;color:${cta.textColor || '#ffffff'};text-decoration:none;border-radius:${cta.borderRadius || '8px'};">
                ${rep(cta.text)}
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    `
    : '';

  // 11. TERMS & CONDITIONS
  const termsList = Array.isArray(content.termsList) && content.termsList.length ? content.termsList : DEFAULT_TERMS_LIST;
  sectionBlocks['terms'] = `
    <tr>
      <td style="padding:0 40px 28px;">
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;line-height:15px;font-weight:800;color:${primaryColor};text-transform:uppercase;letter-spacing:1px;">${rep(content.termsKicker || 'Please Read')}</div>
          <div style="margin-top:2px;font-size:18px;line-height:23px;font-weight:800;color:${headingColor};">${rep(content.termsTitle || 'Terms & Conditions')}</div>
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="width:100%;background:#ffffff;border:1px solid ${borderColor};border-radius:12px;">
          <tr>
            <td style="padding:8px 24px;">
              ${termsList
                .map((term, i) => `
                  <div style="padding:14px 0;${i < termsList.length - 1 ? `border-bottom:1px solid ${borderColor};` : ''}font-size:12.5px;line-height:20px;color:#64748B;">
                    ${escapeHtml(term)}
                  </div>
                `)
                .join('')}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // 12. SIGNOFF
  sectionBlocks['signoff'] = `
    <tr>
      <td style="padding:4px 40px 28px;">
        <div style="font-size:14px;line-height:22px;color:#172033;">
          ${rep(content.signoffGreeting || 'Regards,')}<br>
          <strong style="color:${headingColor};">${rep(content.signoffName || 'Anu')}</strong><br>
          ${rep(content.signoffTeam || 'Team Delivery Plus')}
        </div>
      </td>
    </tr>
  `;

  // 13. FOOTER
  sectionBlocks['footer'] = `
    <tr>
      <td style="padding:22px 40px;background:${headerBgColor};border-top:3px solid ${primaryColor};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="60%" style="color:#8FA9CC;font-size:12px;line-height:19px;">
              <strong style="color:#ffffff;">${rep(content.footerCompanyName || 'Delivery Plus Australia')}</strong><br>
              ${rep(content.footerTagline || 'Trusted Transit at Affordable Prices')}
            </td>
            <td width="40%" align="right" style="color:#BFD6EE;font-size:12px;line-height:19px;text-align:right;">
              ${rep(content.footerPhone1 || '03 7008 5094')}<br>
              ${rep(content.footerPhone2 || '04 2479 6524')}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // Assemble HTML in configured section order
  const renderedSectionsHtml = sections
    .filter((s) => s.enabled !== false && sectionBlocks[s.id])
    .map((s) => sectionBlocks[s.id])
    .join('\n');

  const fullHtml = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="color-scheme" content="light">
        <title>${escapeHtml(sub)}</title>
        <style>
          * { box-sizing:border-box; }
          html, body { margin:0 !important; padding:0 !important; width:100% !important; background:${pageBgColor} !important; font-family:${fontFamily}; }
          table { border-collapse:separate; border-spacing:0; }
          img { display:block; max-width:100%; height:auto; border:0; }
          a { text-decoration:none; }
          @media only screen and (max-width:600px) {
            .email-container { width:100% !important; border-radius:0 !important; }
            .outer-pad { padding:0 !important; }
          }
        </style>
      </head>
      <body style="margin:0;padding:0;background:${pageBgColor};font-family:${fontFamily};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:${pageBgColor};">
          <tr>
            <td align="center" class="outer-pad" style="padding:32px 16px 48px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-container"
                style="width:100%;max-width:${emailWidth};background:${cardBgColor};border:1px solid ${borderColor};border-radius:${borderRadius};overflow:hidden;box-shadow:0 12px 40px rgba(16,29,79,.10);">
                ${renderedSectionsHtml}
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const text = [
    `Hi ${dataMap['{{customer_name}}']},`,
    '',
    `Quote Reference: ${dataMap['{{job_id}}']}`,
    `Job Type: ${dataMap['{{job_type}}']}`,
    `Date: ${dataMap['{{booking_date}}']} ${dataMap['{{booking_time}}']}`,
    `Pickup: ${dataMap['{{pickup_location}}']}`,
    `Drop-off: ${dataMap['{{dropoff_location}}']}`,
    `Estimated Total: ${dataMap['{{minimum_estimated_cost}}']}`,
    `Booking Deposit: ${dataMap['{{deposit_amount}}']}`,
    '',
    'Regards,',
    content.signoffName || 'Anu',
    content.signoffTeam || 'Team Delivery Plus',
    `${dataMap['{{company_phone}}']} / ${dataMap['{{company_mobile}}']}`,
  ].join('\n');

  return { subject: sub, html: fullHtml, text, attachments };
};

/**
 * Generate Responsive HTML Table for Custom Booking Confirmation Template
 */
const renderCustomBookingConfirmationHtml = ({ templateConfig, dataMap, job, attachments = [] }) => {
  const content = templateConfig.contentConfig || {};
  const design = templateConfig.designConfig || {};
  const logo = templateConfig.logoConfig || {};
  const cta = templateConfig.ctaConfig || {};
  const sections = (templateConfig.sectionsConfig || []).sort((a, b) => (a.order || 0) - (b.order || 0));

  const primaryColor = design.primaryColor || '#0F766E';
  const headerBgColor = design.headerBgColor || '#0B163D';
  const pageBgColor = design.pageBgColor || '#F1F5F9';
  const cardBgColor = design.cardBgColor || '#ffffff';
  const textColor = design.textColor || '#58667A';
  const headingColor = design.headingColor || '#0B163D';
  const borderColor = design.borderColor || '#E6ECF5';
  const emailWidth = design.emailWidth || '700px';
  const borderRadius = design.borderRadius || '16px';
  const fontFamily = design.fontFamily || 'Arial, Helvetica, sans-serif';

  const sub = replaceVariables(templateConfig.subject, dataMap);
  const rep = (text) => escapeHtml(replaceVariables(text, dataMap));

  const sectionBlocks = {};

  // 1. HEADER
  const logoSrc = logo.customUrl || (logo.useAttachment ? 'cid:deliveryplus-logo' : '');
  const logoAlign = logo.alignment || 'left';
  sectionBlocks['header'] = `
    <tr>
      <td style="padding:28px 36px 20px;background:${headerBgColor};border-bottom:3px solid ${primaryColor};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="55%" valign="middle" align="${logoAlign}" style="padding:6px 0;text-align:${logoAlign};">
              ${
                logo.enabled !== false && logoSrc
                  ? `<img src="${logoSrc}" alt="Delivery Plus" width="${logo.width || 220}" style="width:${logo.width || 220}px;max-width:100%;height:auto;display:inline-block;border:0;">`
                  : `<div style="font-size:24px;font-weight:900;color:#ffffff;letter-spacing:.5px;">DELIVERY <span style="color:${primaryColor};">PLUS</span></div>`
              }
              <div style="margin-top:8px;color:#BFD6EE;font-size:13px;line-height:18px;font-weight:500;">
                ${rep(content.footerTagline || 'Trusted Transit at Affordable Prices')}
              </div>
            </td>
            <td width="45%" valign="middle" align="right" style="text-align:right;">
              <div style="font-size:11px;color:#8FA9CC;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:6px;">CALL US</div>
              <div style="font-size:15px;line-height:22px;font-weight:700;color:#ffffff;">
                <a href="tel:${dataMap['{{company_phone}}'] || '0370085094'}" style="color:#ffffff;text-decoration:none;">☎ ${dataMap['{{company_phone}}'] || '03 7008 5094'}</a>
              </div>
              <div style="font-size:15px;line-height:22px;font-weight:700;color:#ffffff;margin-top:4px;">
                <a href="tel:${dataMap['{{company_mobile}}'] || '0424796524'}" style="color:#ffffff;text-decoration:none;">📱 ${dataMap['{{company_mobile}}'] || '04 2479 6524'}</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // 2. HERO
  sectionBlocks['hero'] = `
    <tr>
      <td style="padding:32px 36px 20px;">
        <div style="display:inline-block;padding:6px 14px;background:#EAFCF5;border:1px solid #C9ECD9;border-radius:999px;color:${primaryColor};font-size:12px;line-height:16px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">
          ${rep(content.badgeText || '✓ Booking Confirmation')}
        </div>
        <div style="margin-top:10px;font-size:24px;font-weight:900;color:${headingColor};">
          ${rep(content.heading || 'Your booking is confirmed')}
        </div>
        <div style="margin-top:6px;color:${textColor};font-size:14px;line-height:22px;">
          ${rep(content.heroCopy || 'This email confirms your booking and the deposit received for your move.')}
        </div>
      </td>
    </tr>
  `;

  // 3. DEPOSIT CONFIRMED CARD
  sectionBlocks['depositConfirmed'] = `
    <tr>
      <td style="padding:0 36px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="width:100%;background:linear-gradient(135deg,#eafcf5 0%,#e2f7ee 100%);border:1px solid #c9ecd9;border-radius:12px;">
          <tr>
            <td style="padding:18px 20px;">
              <div style="color:${primaryColor};font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">
                ${rep(content.depositCardBadge || '✓ Deposit Received')}
              </div>
              <div style="margin-top:4px;color:${headingColor};font-size:26px;font-weight:900;">
                ${dataMap['{{deposit_amount}}']}
              </div>
              <div style="margin-top:4px;color:${primaryColor};font-size:12px;font-weight:600;">
                ${rep(content.depositCardStatus || 'Status: Received / Confirmed')}
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // 4. GREETING
  sectionBlocks['greeting'] = `
    <tr>
      <td style="padding:0 36px 20px;color:${textColor};font-size:14px;line-height:22px;">
        ${rep(content.greeting || 'Hi {{customer_name}},')}<br><br>
        ${rep(content.confirmationMessage || 'This email confirms that we received your booking deposit of {{deposit_amount}}. This amount will be adjusted in the total move cost at the time of final payment.')}
      </td>
    </tr>
  `;

  // 5. SERVICE DETAILS
  sectionBlocks['serviceDetails'] = `
    <tr>
      <td style="padding:0 36px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="width:100%;border:1px solid ${borderColor};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:14px 18px;background:#f7f9fd;border-bottom:1px solid ${borderColor};color:${headingColor};font-size:15px;font-weight:800;">
              ${rep(content.serviceDetailsTitle || 'Service Details')}
            </td>
          </tr>
          <tr>
            <td style="padding:4px 18px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="padding:10px 0;border-bottom:1px solid #eef2f7;color:#69768a;font-size:12.5px;">Quote Reference</td><td align="right" style="padding:10px 0;border-bottom:1px solid #eef2f7;color:#172033;font-size:12.5px;font-weight:700;text-align:right;">${dataMap['{{job_id}}']}</td></tr>
                <tr><td style="padding:10px 0;border-bottom:1px solid #eef2f7;color:#69768a;font-size:12.5px;">Customer Phone</td><td align="right" style="padding:10px 0;border-bottom:1px solid #eef2f7;color:#172033;font-size:12.5px;font-weight:700;text-align:right;">${dataMap['{{customer_phone}}']}</td></tr>
                <tr><td style="padding:10px 0;border-bottom:1px solid #eef2f7;color:#69768a;font-size:12.5px;">Truck Size</td><td align="right" style="padding:10px 0;border-bottom:1px solid #eef2f7;color:#172033;font-size:12.5px;font-weight:700;text-align:right;">${dataMap['{{truck_size}}']}</td></tr>
                <tr><td style="padding:10px 0;border-bottom:1px solid #eef2f7;color:#69768a;font-size:12.5px;">Movers</td><td align="right" style="padding:10px 0;border-bottom:1px solid #eef2f7;color:#172033;font-size:12.5px;font-weight:700;text-align:right;">${dataMap['{{movers_count}}']}</td></tr>
                <tr><td style="padding:10px 0;color:#69768a;font-size:12.5px;">Date &amp; Time</td><td align="right" style="padding:10px 0;color:#172033;font-size:12.5px;font-weight:700;text-align:right;">${dataMap['{{booking_date}}']}, ${dataMap['{{booking_time}}']}</td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // 6. COST BREAKDOWN
  const hasConfirmationTravelBack = Boolean(dataMap['{{travel_back_charge}}'] && dataMap['{{travel_back_charge}}'] !== '$0.00' && dataMap['{{travel_back_charge}}'] !== '$0' && dataMap['{{travel_back_charge}}'] !== '0');
  sectionBlocks['costBreakdown'] = `
    <tr>
      <td style="padding:0 36px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="width:100%;border:1px solid ${borderColor};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:14px 18px;background:#f7f9fd;border-bottom:1px solid ${borderColor};color:${headingColor};font-size:15px;font-weight:800;">
              ${rep(content.costBreakdownTitle || 'Cost Breakdown')}
            </td>
          </tr>
          <tr>
            <td style="padding:4px 18px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="padding:10px 0;border-bottom:1px solid #eef2f7;color:#69768a;font-size:12.5px;">Rate</td><td align="right" style="padding:10px 0;border-bottom:1px solid #eef2f7;color:#172033;font-size:12.5px;font-weight:700;text-align:right;">${dataMap['{{hourly_rate}}']} / hr</td></tr>
                <tr><td style="padding:10px 0;${hasConfirmationTravelBack ? 'border-bottom:1px solid #eef2f7;' : ''}color:#69768a;font-size:12.5px;">Callout</td><td align="right" style="padding:10px 0;${hasConfirmationTravelBack ? 'border-bottom:1px solid #eef2f7;' : ''}color:#172033;font-size:12.5px;font-weight:700;text-align:right;">${dataMap['{{callout_charge}}']}</td></tr>
                ${hasConfirmationTravelBack ? `<tr><td style="padding:10px 0;color:#69768a;font-size:12.5px;">Travel Back</td><td align="right" style="padding:10px 0;color:#172033;font-size:12.5px;font-weight:700;text-align:right;">${dataMap['{{travel_back_charge}}']}</td></tr>` : ''}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // 7. MINIMUM ESTIMATED COST
  sectionBlocks['minimumEstimatedCost'] = `
    <tr>
      <td style="padding:0 36px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="width:100%;background:linear-gradient(135deg,#eafcf5 0%,#e2f7ee 100%);border:1px solid #c9ecd9;border-radius:12px;">
          <tr>
            <td style="padding:18px 20px;">
              <div style="color:${primaryColor};font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;">
                ${rep(content.minimumEstimatedCostTitle || 'Minimum Estimated Cost')}
              </div>
              <div style="margin-top:4px;color:${headingColor};font-size:26px;font-weight:900;">
                ${dataMap['{{minimum_estimated_cost}}']}
              </div>
              <div style="margin-top:4px;color:${primaryColor};font-size:12px;font-weight:600;">
                ${rep(content.minimumEstimatedCostFootnote || 'Includes the minimum booking period, callout and travel-back charges.')}
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // 8. JOURNEY
  sectionBlocks['journey'] = `
    <tr>
      <td style="padding:0 36px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="width:100%;border:1px solid ${borderColor};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:14px 18px;background:#f7f9fd;border-bottom:1px solid ${borderColor};color:${headingColor};font-size:15px;font-weight:800;">
              ${rep(content.journeyTitle || '🚚 Your Journey')}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="24" valign="top">
                    <div style="width:12px;height:12px;border-radius:50%;background:#f0a93f;border:3px solid #fde5bd;"></div>
                    <div style="width:2px;height:40px;margin:2px 0 2px 5px;background:#c9d3e2;"></div>
                  </td>
                  <td style="padding-left:10px;padding-bottom:6px;">
                    <div style="color:#b37b10;font-size:10px;font-weight:800;text-transform:uppercase;">Pickup Address</div>
                    <div style="margin-top:3px;color:#172033;font-size:13px;font-weight:700;">${dataMap['{{pickup_location}}']}</div>
                  </td>
                </tr>
                <tr>
                  <td width="24" valign="top">
                    <div style="width:12px;height:12px;border-radius:50%;background:#e0483d;border:3px solid #fad3cf;"></div>
                  </td>
                  <td style="padding-left:10px;">
                    <div style="color:#ce4747;font-size:10px;font-weight:800;text-transform:uppercase;">Drop-off Address</div>
                    <div style="margin-top:3px;color:#172033;font-size:13px;font-weight:700;">${dataMap['{{dropoff_location}}']}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // 9. ITEM LIST
  sectionBlocks['itemList'] = `
    <tr>
      <td style="padding:0 36px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="width:100%;border:1px solid ${borderColor};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:14px 18px;background:#f7f9fd;border-bottom:1px solid ${borderColor};color:${headingColor};font-size:15px;font-weight:800;">
              ${rep(content.itemListTitle || 'List of Items')}
            </td>
          </tr>
          <tr>
            <td style="padding:14px 18px;color:#526176;font-size:12.5px;line-height:20px;">
              ${escapeHtml(formatItemList(job))}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // BANK DETAILS
  sectionBlocks['bankDetails'] = `
    <tr>
      <td style="padding:0 36px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="width:100%;background:#ffffff;border:1px solid ${borderColor};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:14px 18px;background:#f7f9fd;border-bottom:1px solid ${borderColor};color:${headingColor};font-size:15px;font-weight:800;">
              🏦 ${rep(content.bankDetailsTitle || 'Bank Details')}
            </td>
          </tr>
          <tr>
            <td style="padding:6px 18px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="padding:8px 0;border-bottom:1px solid #eef2f7;color:#69768a;font-size:12.5px;">Bank Name</td><td align="right" style="padding:8px 0;border-bottom:1px solid #eef2f7;color:#172033;font-size:12.5px;font-weight:700;text-align:right;">${rep(content.bankName || 'Commonwealth Bank of Australia')}</td></tr>
                <tr><td style="padding:8px 0;border-bottom:1px solid #eef2f7;color:#69768a;font-size:12.5px;">Account Name</td><td align="right" style="padding:8px 0;border-bottom:1px solid #eef2f7;color:#172033;font-size:12.5px;font-weight:700;text-align:right;">${rep(content.bankAccountName || 'Delivery Plus Australia')}</td></tr>
                <tr><td style="padding:8px 0;border-bottom:1px solid #eef2f7;color:#69768a;font-size:12.5px;">BSB Number</td><td align="right" style="padding:8px 0;border-bottom:1px solid #eef2f7;color:#172033;font-size:13px;font-weight:900;font-family:monospace;text-align:right;">${rep(content.bankBsb || '063-000')}</td></tr>
                <tr><td style="padding:8px 0;color:#69768a;font-size:12.5px;">Account Number</td><td align="right" style="padding:8px 0;color:#172033;font-size:13px;font-weight:900;font-family:monospace;text-align:right;">${rep(content.bankAccountNumber || '1234 5678')}</td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // 10. CTA BUTTON
  sectionBlocks['cta'] = cta.enabled && cta.text
    ? `
    <tr>
      <td style="padding:0 36px 20px;" align="${cta.alignment || 'center'}">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${cta.alignment || 'center'}">
          <tr>
            <td style="border-radius:${cta.borderRadius || '8px'};background:${cta.bgColor || primaryColor};text-align:center;">
              <a href="${escapeHtml(replaceVariables(cta.url || '#', dataMap))}"
                style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:800;color:${cta.textColor || '#ffffff'};text-decoration:none;border-radius:${cta.borderRadius || '8px'};">
                ${rep(cta.text)}
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    `
    : '';

  // 11. TERMS & CONDITIONS
  const termsList = Array.isArray(content.termsList) && content.termsList.length ? content.termsList : DEFAULT_TERMS_LIST;
  sectionBlocks['terms'] = `
    <tr>
      <td style="padding:0 36px 20px;">
        <div style="margin-bottom:10px;">
          <div style="font-size:10px;font-weight:800;color:${primaryColor};text-transform:uppercase;letter-spacing:1px;">${rep(content.termsKicker || 'Please Read')}</div>
          <div style="margin-top:2px;font-size:17px;font-weight:800;color:${headingColor};">${rep(content.termsTitle || 'Terms & Conditions')}</div>
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="width:100%;background:#ffffff;border:1px solid ${borderColor};border-radius:12px;">
          <tr>
            <td style="padding:6px 20px;">
              ${termsList
                .map((term, i) => `
                  <div style="padding:12px 0;${i < termsList.length - 1 ? `border-bottom:1px solid ${borderColor};` : ''}font-size:12px;line-height:19px;color:#64748B;">
                    ${escapeHtml(term)}
                  </div>
                `)
                .join('')}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // 12. SIGNOFF
  sectionBlocks['signoff'] = `
    <tr>
      <td style="padding:0 36px 24px;">
        <div style="font-size:14px;line-height:22px;color:#172033;">
          ${rep(content.signoffGreeting || 'Regards,')}<br>
          <strong style="color:${headingColor};">${rep(content.signoffName || 'Team Delivery Plus')}</strong>
        </div>
      </td>
    </tr>
  `;

  // 13. FOOTER
  sectionBlocks['footer'] = `
    <tr>
      <td style="padding:22px 36px;background:${headerBgColor};border-top:3px solid ${primaryColor};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="60%" style="color:#8FA9CC;font-size:12px;line-height:19px;">
              <strong style="color:#ffffff;">${rep(content.footerCompanyName || 'Delivery Plus Australia')}</strong><br>
              ${rep(content.footerTagline || 'Trusted Transit at Affordable Prices')}
            </td>
            <td width="40%" align="right" style="color:#BFD6EE;font-size:12px;line-height:19px;text-align:right;">
              ${rep(content.footerPhone1 || '03 7008 5094')}<br>
              ${rep(content.footerPhone2 || '04 2479 6524')}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  // Assemble HTML in configured section order
  const renderedSectionsHtml = sections
    .filter((s) => s.enabled !== false && sectionBlocks[s.id])
    .map((s) => sectionBlocks[s.id])
    .join('\n');

  const fullHtml = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="color-scheme" content="light">
        <title>${escapeHtml(sub)}</title>
        <style>
          * { box-sizing:border-box; }
          html, body { margin:0 !important; padding:0 !important; width:100% !important; background:${pageBgColor} !important; font-family:${fontFamily}; }
          table { border-collapse:separate; border-spacing:0; }
          img { display:block; max-width:100%; height:auto; border:0; }
          a { text-decoration:none; }
          @media only screen and (max-width:600px) {
            .email-container { width:100% !important; border-radius:0 !important; }
            .outer-pad { padding:0 !important; }
          }
        </style>
      </head>
      <body style="margin:0;padding:0;background:${pageBgColor};font-family:${fontFamily};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:${pageBgColor};">
          <tr>
            <td align="center" class="outer-pad" style="padding:32px 16px 48px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-container"
                style="width:100%;max-width:${emailWidth};background:${cardBgColor};border:1px solid ${borderColor};border-radius:${borderRadius};overflow:hidden;box-shadow:0 12px 40px rgba(11,22,61,.10);">
                ${renderedSectionsHtml}
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const text = [
    `Hi ${dataMap['{{customer_name}}']},`,
    '',
    `Booking Reference: ${dataMap['{{job_id}}']}`,
    `Deposit Received: ${dataMap['{{deposit_amount}}']}`,
    `Date: ${dataMap['{{booking_date}}']} ${dataMap['{{booking_time}}']}`,
    `Pickup: ${dataMap['{{pickup_location}}']}`,
    `Drop-off: ${dataMap['{{dropoff_location}}']}`,
    `Estimated Total: ${dataMap['{{minimum_estimated_cost}}']}`,
    '',
    'Regards,',
    content.signoffName || 'Team Delivery Plus',
    `${dataMap['{{company_phone}}']} / ${dataMap['{{company_mobile}}']}`,
  ].join('\n');

  return { subject: sub, html: fullHtml, text, attachments };
};

/**
 * Main Centralized Renderer Function
 * Resolves custom template if active; otherwise invokes fallback hardcoded template.
 */
export const renderEmailTemplate = async (templateKey, jobData = {}, options = {}) => {
  const { attachments = [] } = options;

  try {
    // Modular standalone HTML templates (quotation.html, booking_confirmation.html) are the single source of truth
    if (templateKey === 'quotation') {
      return buildQuotationEmail(jobData, { attachments });
    }
    if (templateKey === 'booking_confirmation') {
      return buildBookingConfirmationEmail(jobData, { attachments });
    }

    throw new Error(`Unsupported email template key: ${templateKey}`);
  } catch (error) {
    console.error(`[TemplateRenderer] Error rendering custom template "${templateKey}". Falling back to default.`, {
      message: error.message,
      stack: error.stack,
    });

    if (templateKey === 'quotation') {
      return buildQuotationEmail(jobData, { attachments });
    }
    if (templateKey === 'booking_confirmation') {
      return buildBookingConfirmationEmail(jobData, { attachments });
    }
    throw error;
  }
};

/**
 * Preview renderer with custom configuration or sample data overrides
 */
export const renderTemplatePreview = (templateKey, templateConfig, overrideData = {}) => {
  const sampleData = { ...SAMPLE_DATA_MAP, ...overrideData };
  const mockJob = {
    notes: 'Please take extra care of the antique wooden dining table in the living room.',
  };

  // If Admin enabled raw Custom HTML mode, render directly with sample variables interpolation
  if (templateConfig.useCustomHtml && templateConfig.customHtml?.trim()) {
    const subject = replaceVariables(templateConfig.subject || '', sampleData);
    const html = replaceVariables(templateConfig.customHtml, sampleData);
    const text = `Preview for ${sampleData['{{job_id}}'] || ''}`;
    return { subject, html, text };
  }

  if (templateKey === 'quotation') {
    return renderCustomQuotationHtml({
      templateConfig,
      dataMap: sampleData,
      job: mockJob,
      attachments: [],
    });
  }

  if (templateKey === 'booking_confirmation') {
    return renderCustomBookingConfirmationHtml({
      templateConfig,
      dataMap: sampleData,
      job: mockJob,
      attachments: [],
    });
  }

  throw new Error(`Unsupported preview template key: ${templateKey}`);
};

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_DIR = path.resolve(__dirname, '../templates/emails');

// ---------------------------------------------------------------------------
// HELPER FUNCTIONS & FORMATTERS
// ---------------------------------------------------------------------------

export const escapeHtml = (value = '') =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const hasValue = (value) =>
  value !== undefined && value !== null && value !== '';

export const firstValue = (...values) => values.find(hasValue);

export const displayValue = (value) => (hasValue(value) ? String(value) : 'N/A');

export const safeText = (value, fallback = 'Not provided') => {
  if (!hasValue(value)) return fallback;
  const text = String(value).trim();
  return text || fallback;
};

export const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const roundMoney = (value) =>
  Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

export const formatCurrency = (value) => {
  if (!hasValue(value)) return 'N/A';
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 'N/A';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(amount);
};

export const formatDate = (value) => {
  if (!value) return 'N/A';
  const raw = String(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Australia/Melbourne',
  }).format(date);
};

export const formatTime = (value) => {
  if (!value) return 'N/A';
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(value);
  let hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${suffix}`;
};

export const formatDurationMinutes = (value) => {
  const totalMinutes = Math.max(0, Math.round(toNumber(value, 0)));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours} ${hours === 1 ? 'Hr' : 'Hrs'} ${minutes} Mins`;
  if (hours > 0) return `${hours} ${hours === 1 ? 'Hr' : 'Hrs'}`;
  return `${minutes} Mins`;
};

export const formatAddress = ({ address, suburb, state, postcode }) =>
  [address, suburb, state, postcode]
    .filter(hasValue)
    .map((val) => String(val).trim())
    .filter(Boolean)
    .join(', ');

export const formatTruckSize = (value) => {
  if (!hasValue(value)) return 'Not provided';
  const raw = String(value).trim();
  if (!raw) return 'Not provided';
  if (/tonne|truck|van|ute|luton|container/i.test(raw)) return raw;
  const cleaned = raw.replace(/\s*(tons?|tonnes?|t)\s*$/i, '').trim();
  return cleaned ? `${cleaned} Tonne` : 'Not provided';
};

export const formatItemList = (job = {}) => {
  const rawValue = [
    job.items,
    job.lineItems,
    job.itemList,
    job.lineItemsText,
    job.movingItems,
    job.inventory,
    job.jobItems,
  ].find((val) => (Array.isArray(val) && val.length > 0) || (typeof val === 'string' && val.trim().length > 0)) ?? '';

  if (typeof rawValue === 'string') {
    const values = rawValue
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
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

export const formatPropertySize = (job = {}) => {
  const rawValue = firstValue(
    job.propertySize,
    job.sizeOfProperty,
    job.bedrooms,
    job.houseSize,
    job.moveSize,
  );
  if (!hasValue(rawValue)) return 'Not provided';
  if (typeof rawValue === 'number') {
    return `${rawValue} bedroom${rawValue === 1 ? '' : 's'}`;
  }
  return safeText(rawValue, 'Not provided');
};

export const getCanonicalPickupAddress = (job = {}) =>
  formatAddress({
    address: firstValue(job.pickupAddress, job.pickUpAddress, job.pickup?.address, job.origin?.address),
    suburb: firstValue(job.pickupSuburb, job.pickup?.suburb),
    state: firstValue(job.pickupState, job.pickup?.state),
    postcode: firstValue(job.pickupPostcode, job.pickup?.postcode),
  });

export const getCanonicalDropAddress = (job = {}) =>
  formatAddress({
    address: firstValue(job.dropoffAddress, job.dropAddress, job.dropOffAddress, job.deliveryAddress, job.dropoff?.address, job.destination?.address),
    suburb: firstValue(job.dropSuburb, job.dropOffSuburb, job.dropoff?.suburb),
    state: firstValue(job.dropState, job.dropOffState, job.dropoff?.state),
    postcode: firstValue(job.dropPostcode, job.dropOffPostcode, job.dropoff?.postcode),
  });

const firstPositiveNumber = (...values) => {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== '') {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return 0;
};

export const getPricingObject = (job = {}) => {
  const rawPricing = job.pricing ?? job.pricingSnapshot ?? {};
  const includeGST = Boolean(job.includeGST ?? job.billing?.includeGST ?? rawPricing.includeGST ?? false);
  const rawGstRate = toNumber(firstValue(job.gstRate, job.billing?.gstRate, rawPricing.gstRate, 10), 10);
  const gstRateMultiplier = rawGstRate > 1 ? rawGstRate / 100 : rawGstRate;
  const gstMultiplier = includeGST ? gstRateMultiplier : 0;

  const minimumChargeHours = firstPositiveNumber(
    rawPricing.minimumChargeHours,
    job.minimumChargeHours,
    job.minimumHours,
    job.minimumDuration,
    job.estimatedHours,
    2.5
  ) || 2.5;

  const baseHourlyRate = firstPositiveNumber(
    rawPricing.hourlyRate,
    job.hourlyRate,
    job.price,
    job.rate,
    job.billing?.hourlyRate,
    job.ratePerHour,
    rawPricing.ratePerHour,
    (job.minimumLaborCost > 0 && minimumChargeHours > 0 ? job.minimumLaborCost / minimumChargeHours : 0),
    (rawPricing.minimumLaborCost > 0 && minimumChargeHours > 0 ? rawPricing.minimumLaborCost / minimumChargeHours : 0),
    140
  ) || 140;

  const hourlyRate = baseHourlyRate;

  const rawCalloutMinutes = toNumber(firstValue(rawPricing.calloutTimeMinutes, job.calloutTimeMinutes, (toNumber(job.callOutTimeHr) * 60 + toNumber(job.callOutTimeMin))));
  const storedCalloutCharge = firstPositiveNumber(rawPricing.calloutCharge, job.calloutCharge, job.callOutFee, job.calloutFee, job.callOutCharge);
  
  const calloutTimeMinutes = rawCalloutMinutes > 0
    ? rawCalloutMinutes
    : (storedCalloutCharge > 0 ? Math.round((storedCalloutCharge / baseHourlyRate) * 60) : 30);

  const baseCalculatedCallout = roundMoney((baseHourlyRate / 60) * calloutTimeMinutes);
  const baseCalloutCharge = storedCalloutCharge > 0 ? storedCalloutCharge : (baseCalculatedCallout > 0 ? baseCalculatedCallout : roundMoney(baseHourlyRate * 0.5));
  const calloutCharge = baseCalloutCharge;

  const rawTravelBackMinutes = toNumber(firstValue(rawPricing.travelBackTimeMinutes, job.travelBackTimeMinutes, (toNumber(job.travelBackTimeHr) * 60 + toNumber(job.travelBackTimeMin))));
  const storedTravelBackCharge = firstPositiveNumber(rawPricing.travelBackCharge, job.travelBackCharge, job.travelBackFee, job.travelbackFee, job.returnTravelCharge);

  const hasTravelBack = rawTravelBackMinutes > 0 || storedTravelBackCharge > 0;
  const travelBackTimeMinutes = rawTravelBackMinutes > 0
    ? rawTravelBackMinutes
    : (storedTravelBackCharge > 0 ? Math.round((storedTravelBackCharge / baseHourlyRate) * 60) : 0);

  const baseCalculatedTravelBack = travelBackTimeMinutes > 0 ? roundMoney((baseHourlyRate / 60) * travelBackTimeMinutes) : 0;
  const baseTravelBackCharge = storedTravelBackCharge > 0 ? storedTravelBackCharge : baseCalculatedTravelBack;
  const travelBackCharge = hasTravelBack ? baseTravelBackCharge : 0;

  const storedStairsCharge = firstPositiveNumber(rawPricing.stairsCharge, job.stairsCharge, job.stairsFee, job.billing?.stairsFee);
  const hasStairs = storedStairsCharge > 0;
  const baseStairsCharge = hasStairs ? storedStairsCharge : 0;
  const stairsCharge = baseStairsCharge;

  const baseCalculatedMinLabor = roundMoney(baseHourlyRate * minimumChargeHours);
  const storedMinimumLaborCost = firstPositiveNumber(rawPricing.minimumLaborCost, job.minimumLaborCost, job.minimumCost);
  const baseMinimumLaborCost = storedMinimumLaborCost > 0 ? storedMinimumLaborCost : baseCalculatedMinLabor;
  const minimumLaborCost = baseMinimumLaborCost;

  const baseCalculatedMinimumEstimatedCost = roundMoney(
    baseMinimumLaborCost +
    baseCalloutCharge +
    (hasTravelBack ? baseTravelBackCharge : 0) +
    (hasStairs ? baseStairsCharge : 0)
  );
  const baseMinimumEstimatedCost = baseCalculatedMinimumEstimatedCost;
  const gstAmount = includeGST ? roundMoney(baseMinimumEstimatedCost * gstRateMultiplier) : 0;
  const minimumEstimatedCost = roundMoney(baseMinimumEstimatedCost + gstAmount);

  const baseFixedPrice = firstPositiveNumber(job.fixedPrice, job.fixedQuote, job.quoteAmount, rawPricing.fixedPrice, 650);
  const fixedPrice = includeGST ? roundMoney(baseFixedPrice * (1 + gstMultiplier)) : baseFixedPrice;

  return {
    includeGST,
    gstRate: rawGstRate,
    gstRateMultiplier,
    gstAmount,
    baseHourlyRate,
    hourlyRate,
    minimumChargeHours,
    minimumChargeMinutes: Math.round(minimumChargeHours * 60),
    baseMinimumLaborCost,
    minimumLaborCost,
    baseCalloutCharge,
    calloutCharge,
    calloutTimeMinutes,
    hasTravelBack,
    baseTravelBackCharge,
    travelBackCharge,
    travelBackTimeMinutes,
    hasStairs,
    baseStairsCharge,
    stairsCharge,
    baseMinimumEstimatedCost,
    minimumEstimatedCost,
    fixedPrice,
    extraTimeBlockMinutes: rawPricing.extraTimeBlockMinutes ?? 30,
    extraTimeRatePerBlock: rawPricing.extraTimeRatePerBlock,
    extraTimeCharge: toNumber(rawPricing.extraTimeCharge),
    finalTotal: toNumber(firstValue(rawPricing.finalTotal, job.finalTotal, job.totalAmount, job.billing?.totalAmount)),
  };
};

export const getBankDetails = (job = {}, overrideBankDetails = {}) => {
  const source = overrideBankDetails && typeof overrideBankDetails === 'object' ? overrideBankDetails : {};
  const configured =
    (Object.keys(source).length > 0 ? source : null) ??
    job.bankDetails ??
    job.emailTemplate?.bankDetails ??
    job.emailTemplateConfig?.bankDetails ??
    job.template?.bankDetails ??
    job.payment?.bankDetails ??
    {};

  return {
    heading: safeText(firstValue(configured.heading, configured.title), 'Bank Details for Payment'),
    subtitle: safeText(firstValue(configured.subtitle, configured.category), 'Direct Bank Transfer'),
    bankName: safeText(firstValue(configured.bankName, configured.bank), 'Commonwealth Bank of Australia'),
    accountName: safeText(firstValue(configured.accountName, configured.account), 'Delivery Plus Australia'),
    bsb: safeText(firstValue(configured.bsb, configured.bsbNumber), '063-000'),
    accountNumber: safeText(firstValue(configured.accountNumber, configured.accountNo), '1234 5678'),
    paymentReference: safeText(firstValue(configured.paymentReference, configured.reference, '{{job_id}}'), '{{job_id}}'),
    instructions: safeText(
      firstValue(configured.instructions, configured.paymentInstructions),
      'Please transfer the required amount using your Quote Reference as the payment reference.'
    ),
  };
};

export const makeLogoAttachment = () => {
  const possiblePaths = [
    path.resolve(__dirname, '../../../public/logo.png'),
    path.resolve(__dirname, '../../uploads/logo.png'),
    path.resolve(process.cwd(), '../public/logo.png'),
    path.resolve(process.cwd(), 'uploads/logo.png'),
  ];
  for (const logoPath of possiblePaths) {
    if (fs.existsSync(logoPath)) {
      return [
        {
          filename: 'logo.png',
          path: logoPath,
          cid: 'deliveryplus-logo',
          contentType: 'image/png',
          contentDisposition: 'inline',
        },
      ];
    }
  }
  return [];
};

export const makeMovingTruckAttachment = () => {
  const possiblePaths = [
    path.resolve(__dirname, '../../uploads/email-assets/deliveryplus-moving-truck.gif'),
    path.resolve(__dirname, '../../../public/email-assets/deliveryplus-moving-truck.gif'),
    path.resolve(process.cwd(), 'uploads/email-assets/deliveryplus-moving-truck.gif'),
    path.resolve(process.cwd(), '../public/email-assets/deliveryplus-moving-truck.gif'),
  ];
  for (const gifPath of possiblePaths) {
    if (fs.existsSync(gifPath)) {
      return [
        {
          filename: 'deliveryplus-moving-truck.gif',
          path: gifPath,
          cid: 'deliveryplus-moving-truck',
          contentType: 'image/gif',
          contentDisposition: 'inline',
        },
      ];
    }
  }
  return [];
};

export const makeThankYouTruckAttachment = () => {
  const possiblePaths = [
    path.resolve(__dirname, '../../uploads/email-assets/deliveryplus_truck_thankyou.png'),
    path.resolve(__dirname, '../../../public/email-assets/deliveryplus_truck_thankyou.png'),
    path.resolve(process.cwd(), 'uploads/email-assets/deliveryplus_truck_thankyou.png'),
    path.resolve(process.cwd(), '../public/email-assets/deliveryplus_truck_thankyou.png'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return [
        {
          filename: 'deliveryplus_truck_thankyou.png',
          path: p,
          cid: 'deliveryplus-thankyou-truck',
          contentType: 'image/png',
          contentDisposition: 'inline',
        },
      ];
    }
  }
  return [];
};

// ---------------------------------------------------------------------------
// TEMPLATE COMPILER & INJECTOR
// ---------------------------------------------------------------------------

const loadHtmlFile = (relativePath) => {
  const fullPath = path.join(TEMPLATES_DIR, relativePath);
  if (fs.existsSync(fullPath)) {
    return fs.readFileSync(fullPath, 'utf8');
  }
  return '';
};

/**
 * Builds attached documents HTML list if valid link items exist
 */
const renderAttachedDocumentsSection = (job = {}, options = {}) => {
  const rawList = [
    job.attachments,
    job.documents,
    job.attachedDocuments,
    job.quotationEmailAttachments,
    options.attachments,
  ].find((val) => Array.isArray(val) && val.length > 0) || [];

  const validLinks = rawList
    .map((doc) => {
      if (!doc) return null;
      if (typeof doc === 'string' && (doc.startsWith('http://') || doc.startsWith('https://'))) {
        return { name: 'Attached Document', url: doc };
      }
      if (typeof doc === 'object') {
        const url = firstValue(doc.url, doc.href, doc.link, (typeof doc.path === 'string' && doc.path.startsWith('http')) ? doc.path : null);
        if (!url) return null;
        const name = safeText(firstValue(doc.name, doc.title, doc.filename, doc.label), 'Document');
        return { name, url };
      }
      return null;
    })
    .filter(Boolean);

  if (!validLinks.length) return '';

  const linksHtml = validLinks
    .map(
      (doc) =>
        `<div style="margin:4px 0;"><a href="${escapeHtml(doc.url)}" target="_blank" style="color:#008FB3;font-size:13px;line-height:20px;font-weight:700;text-decoration:none;">◉ &nbsp; ${escapeHtml(doc.name)}</a></div>`
    )
    .join('');

  return `
    <tr>
      <td class="section-space" style="padding:0 40px 24px;">
        <div style="margin-bottom:10px;">
          <div class="section-title" style="font-size:18px;line-height:24px;font-weight:800;color:#101D4F;">Attached Documents</div>
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="width:100%;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;">
          <tr>
            <td style="padding:14px 18px;">
              ${linksHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
};

/**
 * Compiles Quotation Email
 */
export const compileQuotationEmail = (job = {}, { attachments = [], bankDetails = {} } = {}) => {
  const pricing = getPricingObject(job);
  const pricingType = String(firstValue(job.pricingType, job.fixedPrice ? 'fixed' : 'hourly')).toLowerCase();
  const isMovingJob = String(firstValue(job.jobType, job.type, '')).toLowerCase() === 'moving';

  const jobNumber = safeText(firstValue(job.jobNumber, job.quoteRef, job.jobReference, job.referenceNumber), 'N/A');
  const rawCustomerName = firstValue(job.customerName, job.customer?.name, job.customerId?.name, job.clientName, job.contactName, job.name);
  const customerName = (rawCustomerName && !['quotation', 'quote', 'undefined', 'null'].includes(String(rawCustomerName).trim().toLowerCase()))
    ? String(rawCustomerName).trim()
    : safeText(job.customer?.name || job.customerId?.name, 'Customer');
  const customerPhone = safeText(firstValue(job.customerPhone, job.customer?.phone, job.customerId?.phone, job.clientPhone, job.phone), 'N/A');
  const customerEmail = safeText(firstValue(job.customerEmail, job.customer?.email, job.customerId?.email, job.clientEmail, job.email), 'N/A');
  const pickupAddress = safeText(getCanonicalPickupAddress(job), 'N/A');
  const dropAddress = safeText(getCanonicalDropAddress(job), 'N/A');
  const scheduledDate = formatDate(firstValue(job.scheduledDate, job.scheduledAt, job.date));
  const createdDate = formatDate(firstValue(job.createdAt, job.quotationDate, job.date, new Date()));

  const scheduleMode = String(firstValue(job.scheduleMode, job.scheduledTimeMode, '')).toLowerCase();
  const scheduledTime =
    scheduleMode === 'window'
      ? `${formatTime(firstValue(job.scheduledStartTime, job.startTime))} - ${formatTime(firstValue(job.scheduledEndTime, job.endTime))}`
      : safeText(formatTime(firstValue(job.scheduledTime, job.time, job.scheduledAtTime)), 'N/A');

  const truckSize = formatTruckSize(firstValue(job.truckSize, job.vehicleSize, job.truckType));
  const movers = hasValue(job.movers) || hasValue(job.numberOfMovers) ? String(firstValue(job.movers, job.numberOfMovers)) : 'Not provided';
  const propertySize = formatPropertySize(job);
  const itemList = formatItemList(job);
  const depositAmount = toNumber(firstValue(job.bookingDepositAmount, job.confirmationAmount, job.depositAmount, job.bookingDeposit), 50);
  const fixedPrice = toNumber(firstValue(job.fixedPrice, job.fixedQuote, job.quoteAmount, pricing.finalTotal, pricing.minimumEstimatedCost), 0);

  // Truck Dimensions URL & Button
  const frontendBaseUrl = String(process.env.FRONTEND_URL || 'https://deliveryplus.tech').replace(/\/$/, '');
  const configuredTruckDimensionsUrl = firstValue(job.truckDimensionsUrl, job.truckDimensionsLink, job.vehicleDimensionsUrl);
  const resolvedTruckDimensionsUrl = configuredTruckDimensionsUrl
    ? String(configuredTruckDimensionsUrl)
      .replace(/^https?:\/\/(localhost|127\.0\.0\.1):5173/, frontendBaseUrl)
    : `${frontendBaseUrl}/truck-dimensions?truckSize=${encodeURIComponent(truckSize)}&jobNumber=${encodeURIComponent(jobNumber)}`;

  const truckDimensionsLink = `<a href="${escapeHtml(resolvedTruckDimensionsUrl)}" target="_blank" style="color:#0284C7;font-size:12.5px;font-weight:700;text-decoration:underline;text-underline-offset:3px;display:inline-block;">🔗 View Dimensions &amp; Specifications ↗</a>`;

  // Optional Live Job Tracking URL
  const jobTrackingUrl = firstValue(job.jobTrackingUrl, job.trackingUrl, job.liveTrackingUrl, job.statusUrl);
  const jobStatusSection = jobTrackingUrl
    ? `
    <tr>
      <td class="section-space" style="padding:0 40px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="width:100%;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:18px 22px;">
              <div style="font-size:13px;font-weight:700;color:#166534;">For real-time job information and updates:</div>
              <div style="margin-top:10px;">
                <a href="${escapeHtml(jobTrackingUrl)}" target="_blank"
                  style="display:inline-block;padding:9px 18px;background:#0D1B4C;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;border-radius:8px;">
                  View Job Status →
                </a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    `
    : '';

  // Attached Documents Section
  const attachedDocumentsSection = renderAttachedDocumentsSection(job, { attachments });

  const logoAttachment = makeLogoAttachment();
  const truckAttachment = makeMovingTruckAttachment();
  const hasTruckAttachment = truckAttachment.length > 0;
  const hasLogoAttachment = logoAttachment.length > 0;
  const logoSrc = hasLogoAttachment
    ? 'cid:deliveryplus-logo'
    : `${frontendBaseUrl}/email-assets/delivery_plus_logo.png`;

  const logoHtml = `<img src="${logoSrc}" alt="Delivery Plus" width="220" style="width:220px;max-width:100%;height:auto;display:block;border:0;">`;
  const thankYouLogoHtml = `<img src="${logoSrc}" alt="Delivery Plus" width="190" style="width:190px;max-width:85%;height:auto;display:inline-block;margin:0 auto;border:0;">`;

  // 1. Moving Details Partial
  let movingDetailsHtml = '';
  if (isMovingJob) {
    const movingPartial = loadHtmlFile('partials/moving_details.html');
    movingDetailsHtml = movingPartial
      .replace(/\{\{TRUCK_SIZE\}\}/g, escapeHtml(truckSize))
      .replace(/\{\{TRUCK_DIMENSIONS_LINK\}\}/g, truckDimensionsLink)
      .replace(/\{\{MOVERS_COUNT\}\}/g, escapeHtml(movers))
      .replace(/\{\{PROPERTY_SIZE\}\}/g, escapeHtml(propertySize))
      .replace(/\{\{ITEM_LIST\}\}/g, escapeHtml(itemList));
  }

  // 2. Cost Breakdown Partial
  let costBreakdownHtml = '';
  if (pricingType === 'fixed') {
    const fixedPartial = loadHtmlFile('partials/cost_breakdown_fixed.html');
    const fixedPriceLabel = pricing.includeGST
      ? `${formatCurrency(pricing.fixedPrice)} (Inc. ${pricing.gstRate}% GST)`
      : formatCurrency(pricing.fixedPrice);
    costBreakdownHtml = fixedPartial
      .replace(/\{\{FIXED_PRICE_AMOUNT\}\}/g, escapeHtml(fixedPriceLabel))
      .replace(/\{\{DEPOSIT_AMOUNT\}\}/g, escapeHtml(formatCurrency(depositAmount)));
  } else {
    const hourlyPartial = loadHtmlFile('partials/cost_breakdown_hourly.html');
    const hourlyRateLabel = `${formatCurrency(pricing.baseHourlyRate)} / hour`;
    const minHoursLabel = `${pricing.minimumChargeHours} ${pricing.minimumChargeHours === 1 ? 'Hour' : 'Hours'}`;
    const calloutSummary = `${formatDurationMinutes(pricing.calloutTimeMinutes)} | ${formatCurrency(pricing.baseCalloutCharge)}`;
    const travelBackSummary = pricing.hasTravelBack
      ? `${formatDurationMinutes(pricing.travelBackTimeMinutes)} | ${formatCurrency(pricing.baseTravelBackCharge)}`
      : '';
    const stairsSummary = pricing.hasStairs
      ? formatCurrency(pricing.baseStairsCharge)
      : '';

    const hasAnyRowAfterCallout = pricing.hasTravelBack || pricing.hasStairs || pricing.includeGST;
    const calloutBorderStyle = hasAnyRowAfterCallout ? 'border-bottom:1.5px solid #BAC9D6;' : '';

    const calloutRow = `
            <tr>
              <td class="pricing-label" style="padding:14px 20px;${calloutBorderStyle}color:#334155;font-size:14px;font-weight:700;">Callout</td>
              <td class="pricing-value" style="padding:14px 20px;${calloutBorderStyle}color:#101D4F;font-size:15px;font-weight:800;text-align:right;">
                ${escapeHtml(calloutSummary)}
                <div style="font-size:11.5px;color:#64748B;font-weight:600;margin-top:3px;">Time to arrive at your address</div>
              </td>
            </tr>
    `.trim();

    const hasAnyRowAfterTravelBack = pricing.hasStairs || pricing.includeGST;
    const travelBackBorderStyle = hasAnyRowAfterTravelBack ? 'border-bottom:1.5px solid #BAC9D6;' : '';

    const travelBackRow = pricing.hasTravelBack
      ? `
            <tr style="background:#FAFDFE;">
              <td class="pricing-label" style="padding:14px 20px;${travelBackBorderStyle}color:#334155;font-size:14px;font-weight:700;">Travel Back</td>
              <td class="pricing-value" style="padding:14px 20px;${travelBackBorderStyle}color:#101D4F;font-size:15px;font-weight:800;text-align:right;">
                ${escapeHtml(travelBackSummary)}
                <div style="font-size:11.5px;color:#64748B;font-weight:600;margin-top:3px;">Return trip charge</div>
              </td>
            </tr>
      `.trim()
      : '';

    const hasAnyRowAfterStairs = pricing.includeGST;
    const stairsBorderStyle = hasAnyRowAfterStairs ? 'border-bottom:1.5px solid #BAC9D6;' : '';

    const stairsRow = pricing.hasStairs
      ? `
            <tr style="${pricing.hasTravelBack ? '' : 'background:#FAFDFE;'}">
              <td class="pricing-label" style="padding:14px 20px;${stairsBorderStyle}color:#334155;font-size:14px;font-weight:700;">Stairs Charge</td>
              <td class="pricing-value" style="padding:14px 20px;${stairsBorderStyle}color:#101D4F;font-size:15px;font-weight:800;text-align:right;">
                ${escapeHtml(stairsSummary)}
                <div style="font-size:11.5px;color:#64748B;font-weight:600;margin-top:3px;">Stair navigation fee</div>
              </td>
            </tr>
      `.trim()
      : '';

    const gstRow = pricing.includeGST
      ? `
            <tr style="background:#FAFDFE;border-top:1.5px solid #BAC9D6;">
              <td class="pricing-label" style="padding:12px 20px;border-bottom:1px dashed #CBD5E1;color:#475569;font-size:13.5px;font-weight:700;">Subtotal (Excl. GST)</td>
              <td class="pricing-value" style="padding:12px 20px;border-bottom:1px dashed #CBD5E1;color:#334155;font-size:14.5px;font-weight:800;text-align:right;">
                ${formatCurrency(pricing.baseMinimumEstimatedCost)}
              </td>
            </tr>
            <tr style="background:#F0FDF4;">
              <td class="pricing-label" style="padding:12px 20px;color:#166534;font-size:13.5px;font-weight:700;">GST (${pricing.gstRate}%)</td>
              <td class="pricing-value" style="padding:12px 20px;color:#15803D;font-size:14.5px;font-weight:800;text-align:right;">
                +${formatCurrency(pricing.gstAmount)}
              </td>
            </tr>
      `.trim()
      : '';

    const includedItems = ['minimum charge', 'callout'];
    if (pricing.hasTravelBack) includedItems.push('travel back');
    if (pricing.hasStairs) includedItems.push('stairs');
    const minCostDesc = `Includes ${includedItems.join(' + ')} fees${pricing.includeGST ? ` + GST (${pricing.gstRate}%)` : ''}`;

    // Scenarios Calculations: 2.5 Hours, 3 Hours, 4 Hours
    const hrCost1 = roundMoney(pricing.baseHourlyRate * 2.5);
    const hrCost2 = roundMoney(pricing.baseHourlyRate * 3);
    const hrCost3 = roundMoney(pricing.baseHourlyRate * 4);
    const calloutStr = formatCurrency(pricing.baseCalloutCharge);

    const sub1 = hrCost1 + pricing.baseCalloutCharge;
    const tot1 = pricing.includeGST ? roundMoney(sub1 * (1 + pricing.gstRateMultiplier)) : sub1;
    const scenario1Hourly = `${formatCurrency(pricing.baseHourlyRate)} × 2.5 = ${formatCurrency(hrCost1)}`;
    const scenario1Total = formatCurrency(tot1);

    const sub2 = hrCost2 + pricing.baseCalloutCharge;
    const tot2 = pricing.includeGST ? roundMoney(sub2 * (1 + pricing.gstRateMultiplier)) : sub2;
    const scenario2Hourly = `${formatCurrency(pricing.baseHourlyRate)} × 3 = ${formatCurrency(hrCost2)}`;
    const scenario2Total = formatCurrency(tot2);

    const sub3 = hrCost3 + pricing.baseCalloutCharge;
    const tot3 = pricing.includeGST ? roundMoney(sub3 * (1 + pricing.gstRateMultiplier)) : sub3;
    const scenario3Hourly = `${formatCurrency(pricing.baseHourlyRate)} × 4 = ${formatCurrency(hrCost3)}`;
    const scenario3Total = formatCurrency(tot3);

    costBreakdownHtml = hourlyPartial
      .replace(/\{\{JOB_NUMBER\}\}/g, escapeHtml(jobNumber))
      .replace(/\{\{HOURLY_RATE_LABEL\}\}/g, escapeHtml(hourlyRateLabel))
      .replace(/\{\{MINIMUM_LABOR_COST\}\}/g, escapeHtml(formatCurrency(pricing.baseMinimumLaborCost)))
      .replace(/\{\{MINIMUM_CHARGE_HOURS_LABEL\}\}/g, escapeHtml(minHoursLabel))
      .replace(/\{\{CALLOUT_ROW\}\}/g, calloutRow)
      .replace(/\{\{CALLOUT_SUMMARY\}\}/g, escapeHtml(calloutSummary))
      .replace(/\{\{CALLOUT_BORDER_STYLE\}\}/g, calloutBorderStyle)
      .replace(/\{\{TRAVEL_BACK_ROW\}\}/g, travelBackRow)
      .replace(/\{\{TRAVEL_BACK_SUMMARY\}\}/g, escapeHtml(travelBackSummary))
      .replace(/\{\{STAIRS_ROW\}\}/g, stairsRow)
      .replace(/\{\{STAIRS_SUMMARY\}\}/g, escapeHtml(stairsSummary))
      .replace(/\{\{GST_ROW\}\}/g, gstRow)
      .replace(/\{\{MINIMUM_ESTIMATED_COST_DESCRIPTION\}\}/g, minCostDesc)
      .replace(/\{\{MINIMUM_ESTIMATED_COST\}\}/g, escapeHtml(formatCurrency(pricing.minimumEstimatedCost)))
      .replace(/\{\{DEPOSIT_AMOUNT\}\}/g, escapeHtml(formatCurrency(depositAmount)))
      .replace(/\{\{SCENARIO_CALLOUT\}\}/g, escapeHtml(calloutStr))
      .replace(/\{\{SCENARIO_1_HOURLY\}\}/g, escapeHtml(scenario1Hourly))
      .replace(/\{\{SCENARIO_1_TOTAL\}\}/g, escapeHtml(scenario1Total))
      .replace(/\{\{SCENARIO_2_HOURLY\}\}/g, escapeHtml(scenario2Hourly))
      .replace(/\{\{SCENARIO_2_TOTAL\}\}/g, escapeHtml(scenario2Total))
      .replace(/\{\{SCENARIO_3_HOURLY\}\}/g, escapeHtml(scenario3Hourly))
      .replace(/\{\{SCENARIO_3_TOTAL\}\}/g, escapeHtml(scenario3Total));
  }

  // 3. Special Notes Section
  let notesHtml = '';
  const notesText = firstValue(job.notes, job.specialInstructions, job.customerNotes);
  if (notesText && String(notesText).trim()) {
    notesHtml = `
      <tr>
        <td class="section-space" style="padding:0 40px 28px;">
          <div style="margin-bottom:14px;">
            <div class="section-title" style="font-size:20px;line-height:25px;font-weight:800;color:#101D4F;">Notes</div>
            <div class="section-kicker" style="margin-top:3px;font-size:12px;line-height:16px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.8px;">Special Instructions</div>
          </div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="width:100%;background:#ffffff;border:1px solid #DDE6EE;border-radius:12px;">
            <tr>
              <td style="padding:20px 24px;color:#59677A;font-size:13px;line-height:21px;white-space:pre-line;">${escapeHtml(notesText)}</td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }

  // 4. What's Included in Your Quote Partial (Quotation specific)
  const whatsIncludedHtml = loadHtmlFile('partials/whats_included_in_quote.html');

  // 5. Bank Details Partial
  const bankConfig = getBankDetails(job, bankDetails);
  const resolvedPaymentRef = String(bankConfig.paymentReference).replace(/\{\{job_id\}\}/g, jobNumber);
  const resolvedInstructions = String(bankConfig.instructions)
    .replace(/\{\{job_id\}\}/g, jobNumber)
    .replace(/\{\{deposit_amount\}\}/g, formatCurrency(depositAmount));

  const bankPartial = loadHtmlFile('partials/bank_details.html');
  const bankDetailsHtml = bankPartial
    .replace(/\{\{BANK_TITLE\}\}/g, escapeHtml(bankConfig.heading))
    .replace(/\{\{BANK_SUBTITLE\}\}/g, escapeHtml(bankConfig.subtitle))
    .replace(/\{\{BANK_NAME\}\}/g, escapeHtml(bankConfig.bankName))
    .replace(/\{\{ACCOUNT_NAME\}\}/g, escapeHtml(bankConfig.accountName))
    .replace(/\{\{BSB\}\}/g, escapeHtml(bankConfig.bsb))
    .replace(/\{\{ACCOUNT_NUMBER\}\}/g, escapeHtml(bankConfig.accountNumber))
    .replace(/\{\{PAYMENT_REFERENCE\}\}/g, escapeHtml(resolvedPaymentRef))
    .replace(/\{\{PAYMENT_INSTRUCTIONS\}\}/g, escapeHtml(resolvedInstructions).replace(/\n/g, '<br>'));

  // 5. Terms Partial (Important Booking Information is only shown in Booking Confirmation, omitted from Quotation)
  const termsHtml = '';

  // 6. Moving Truck Animation GIF Banner Section (Modular Partial)
  const explicitTruckUrl = (job.movingTruckGifUrl === false || job.moving_truck_gif_url === false || job.movingTruckBannerUrl === false || job.moving_truck_banner_url === false)
    ? ''
    : String(
        firstValue(
          job.movingTruckGifUrl,
          job.moving_truck_gif_url,
          job.movingTruckBannerUrl,
          job.moving_truck_banner_url,
          ''
        ) || ''
      ).trim();

  let resolvedTruckSrc = '';
  let shouldAttachTruckGif = false;

  if (job.movingTruckGifUrl === false || job.moving_truck_gif_url === false || job.movingTruckBannerUrl === false) {
    resolvedTruckSrc = '';
  } else if (explicitTruckUrl) {
    resolvedTruckSrc = explicitTruckUrl;
  }

  const bannerPartial = loadHtmlFile('partials/moving_truck_banner.html');
  const movingTruckBannerSection = resolvedTruckSrc && bannerPartial
    ? bannerPartial.replace(/\{\{MOVING_TRUCK_GIF_URL\}\}/g, escapeHtml(resolvedTruckSrc))
    : '';

  const thankYouTruckAttachment = makeThankYouTruckAttachment();
  const hasThankYouTruckAttachment = thankYouTruckAttachment.length > 0;
  const thankYouTruckSrc = hasThankYouTruckAttachment
    ? 'cid:deliveryplus-thankyou-truck'
    : `${frontendBaseUrl}/email-assets/deliveryplus_truck_thankyou.png`;

  const quotationAttachments = [
    ...logoAttachment,
    ...(shouldAttachTruckGif ? truckAttachment : []),
    ...thankYouTruckAttachment,
    ...(Array.isArray(attachments) ? attachments : []),
  ];

  // 7. Assemble Main Quotation Template
  const quotationHtml = loadHtmlFile('quotation.html');
  const fullHtml = quotationHtml
    .replace(/\{\{CUSTOMER_NAME\}\}/g, escapeHtml(customerName))
    .replace(/\{\{CUSTOMER_PHONE\}\}/g, escapeHtml(customerPhone))
    .replace(/\{\{CUSTOMER_EMAIL\}\}/g, escapeHtml(customerEmail))
    .replace(/\{\{customer_name\}\}/gi, escapeHtml(customerName))
    .replace(/\{\{customer_phone\}\}/gi, escapeHtml(customerPhone))
    .replace(/\{\{customer_email\}\}/gi, escapeHtml(customerEmail))
    .replace(/\{\{JOB_NUMBER\}\}/g, escapeHtml(jobNumber))
    .replace(/\{\{job_number\}\}/gi, escapeHtml(jobNumber))
    .replace(/\{\{CREATED_DATE\}\}/g, escapeHtml(createdDate))
    .replace(/\{\{SCHEDULED_DATE\}\}/g, escapeHtml(scheduledDate))
    .replace(/\{\{SCHEDULED_TIME\}\}/g, escapeHtml(scheduledTime))
    .replace(/\{\{PICKUP_ADDRESS\}\}/g, escapeHtml(pickupAddress))
    .replace(/\{\{DROP_ADDRESS\}\}/g, escapeHtml(dropAddress))
    .replace(/\{\{LOGO_HTML\}\}/g, logoHtml)
    .replace(/\{\{THANK_YOU_LOGO\}\}/g, thankYouLogoHtml)
    .replace(/\{\{THANKYOU_TRUCK_IMAGE_SRC\}\}/g, thankYouTruckSrc)
    .replace(/\{\{ATTACHED_DOCUMENTS_SECTION\}\}/g, attachedDocumentsSection)
    .replace(/\{\{MOVING_DETAILS_SECTION\}\}/g, movingDetailsHtml)
    .replace(/\{\{COST_BREAKDOWN_SECTION\}\}/g, costBreakdownHtml)
    .replace(/\{\{NOTES_SECTION\}\}/g, notesHtml)
    .replace(/\{\{BANK_DETAILS_SECTION\}\}/g, bankDetailsHtml)
    .replace(/\{\{JOB_STATUS_SECTION\}\}/g, jobStatusSection)
    .replace(/\{\{WHATS_INCLUDED_SECTION\}\}/g, whatsIncludedHtml)
    .replace(/\{\{TERMS_SECTION\}\}/g, termsHtml)
    .replace(/\{\{MOVING_TRUCK_BANNER_SECTION\}\}/g, movingTruckBannerSection);

  // Plain Text Version
  const textLines = [
    `Hi ${customerName},`,
    '',
    'Thank you for requesting a quotation with Delivery Plus.',
    `Quote Reference: ${jobNumber}`,
    `Scheduled Date: ${scheduledDate}`,
    `Scheduled Time: ${scheduledTime}`,
    `Pickup Location: ${pickupAddress}`,
    `Drop-off Location: ${dropAddress}`,
  ];

  if (isMovingJob) {
    textLines.push(
      '',
      '--- Moving Details ---',
      `Truck Size: ${truckSize}`,
      `Movers: ${movers}`,
      `Size of Property: ${propertySize}`,
      `List of Items: ${itemList}`
    );
  }

  textLines.push('', '--- Cost Breakdown ---');
  if (pricingType === 'fixed') {
    textLines.push(`Fixed Quote Amount: ${formatCurrency(fixedPrice)}`);
  } else {
    const hourlyLines = [
      `Rate: ${formatCurrency(pricing.baseHourlyRate)} / hour`,
      `Minimum Charge: ${formatCurrency(pricing.baseMinimumLaborCost)} (${pricing.minimumChargeHours} Hours)`,
      `Callout: ${formatDurationMinutes(pricing.calloutTimeMinutes)} | ${formatCurrency(pricing.baseCalloutCharge)}`,
    ];
    if (pricing.hasTravelBack) {
      hourlyLines.push(`Travel Back: ${formatDurationMinutes(pricing.travelBackTimeMinutes)} | ${formatCurrency(pricing.baseTravelBackCharge)}`);
    }
    if (pricing.hasStairs) {
      hourlyLines.push(`Stairs Charge: ${formatCurrency(pricing.baseStairsCharge)}`);
    }
    if (pricing.includeGST) {
      hourlyLines.push(`Subtotal (Excl. GST): ${formatCurrency(pricing.baseMinimumEstimatedCost)}`);
      hourlyLines.push(`GST (${pricing.gstRate}%): +${formatCurrency(pricing.gstAmount)}`);
      hourlyLines.push(`Minimum Estimated Cost (Total Inc. GST): ${formatCurrency(pricing.minimumEstimatedCost)}`);
    } else {
      hourlyLines.push(`Minimum Estimated Cost: ${formatCurrency(pricing.minimumEstimatedCost)}`);
    }
    textLines.push(...hourlyLines);
  }

  textLines.push(
    '',
    '--- What’s Included in Your Quote ---',
    '1. Professional Moving Team & Truck: 2 experienced removalists and a suitable moving truck.',
    '2. Fuel & Professional Moving Equipment: Fuel, trolleys, protective moving blankets and handling equipment.',
    '3. Insurance & Peace of Mind: Public Liability and Handling Negligence Insurance included.',
    '4. Disassembly & Reassembly Service: Assistance with standard furniture disassembly and reassembly where required.',
    '',
    `Booking Deposit Required: ${formatCurrency(depositAmount)}`,
    '',
    '--- Bank Details ---',
    `Bank: ${bankConfig.bankName}`,
    `Account Name: ${bankConfig.accountName}`,
    `BSB: ${bankConfig.bsb}`,
    `Account Number: ${bankConfig.accountNumber}`,
    `Payment Reference: ${resolvedPaymentRef}`,
    '',
    'Regards,',
    'Anu - Team Delivery Plus',
    'Phone: 03 7008 5094 | Mobile: 04 2479 6524',
    'https://deliveryplus.com.au'
  );

  return {
    subject: `Delivery Plus Quotation – ${jobNumber}`,
    html: fullHtml,
    text: textLines.join('\n'),
    attachments: quotationAttachments,
  };
};

/**
 * Compiles Booking Confirmation Email
 */
export const compileBookingConfirmationEmail = (job = {}, { attachments = [], bankDetails = {} } = {}) => {
  const jobNumber = safeText(firstValue(job.jobNumber, job.quoteRef, job.jobReference, job.referenceNumber), 'N/A');
  const rawCustomerName = firstValue(job.customerName, job.customer?.name, job.customerId?.name, job.clientName, job.contactName, job.name);
  const customerName = (rawCustomerName && !['quotation', 'quote', 'undefined', 'null'].includes(String(rawCustomerName).trim().toLowerCase()))
    ? String(rawCustomerName).trim()
    : safeText(job.customer?.name || job.customerId?.name, 'Customer');
  const customerPhone = safeText(firstValue(job.customerPhone, job.customer?.phone, job.customerId?.phone, job.clientPhone, job.phone), 'N/A');
  const customerEmail = safeText(firstValue(job.customerEmail, job.customer?.email, job.customerId?.email, job.clientEmail, job.email), 'N/A');
  const pickupAddress = safeText(getCanonicalPickupAddress(job), 'N/A');
  const dropAddress = safeText(getCanonicalDropAddress(job), 'N/A');
  const scheduledDate = formatDate(job.scheduledDate);

  const scheduleMode = String(firstValue(job.scheduleMode, job.scheduledTimeMode, '')).toLowerCase();
  const scheduledTime =
    scheduleMode === 'window'
      ? `${formatTime(job.scheduledStartTime)} - ${formatTime(job.scheduledEndTime)}`
      : safeText(formatTime(job.scheduledTime), 'N/A');

  const pricing = getPricingObject(job);
  const pricingType = String(job.pricingType || (job.fixedPrice ? 'fixed' : 'hourly')).toLowerCase();
  const fixedPrice = toNumber(firstValue(job.fixedPrice, job.fixedQuote, job.quoteAmount, pricing.finalTotal, pricing.minimumEstimatedCost));
  const truckSize = formatTruckSize(firstValue(job.truckSize, job.vehicleSize, job.truckType));
  const movers = hasValue(job.movers) || hasValue(job.numberOfMovers) ? String(firstValue(job.movers, job.numberOfMovers)) : 'Not provided';
  const deposit = toNumber(firstValue(job.bookingDepositAmount, job.confirmationAmount, job.depositAmount));

  if (!Number.isFinite(deposit) || deposit <= 0) {
    throw new Error('Valid booking deposit amount is required');
  }

  const logoAttachment = makeLogoAttachment();
  const truckAttachment = makeMovingTruckAttachment();
  const hasTruckAttachment = truckAttachment.length > 0;
  const hasLogoAttachment = logoAttachment.length > 0;
  const logoSrc = hasLogoAttachment
    ? 'cid:deliveryplus-logo'
    : `${frontendBaseUrl}/email-assets/delivery_plus_logo.png`;

  const logoHtml = `<img src="${logoSrc}" alt="Delivery Plus" width="220" style="width:220px;max-width:100%;height:auto;display:block;border:0;">`;
  const thankYouLogoHtml = `<img src="${logoSrc}" alt="Delivery Plus" width="190" style="width:190px;max-width:85%;height:auto;display:inline-block;margin:0 auto;border:0;">`;

  // 1. Cost Breakdown
  let costBreakdownHtml = '';
  if (pricingType === 'fixed') {
    const fixedPartial = loadHtmlFile('partials/cost_breakdown_fixed.html');
    const fixedPriceLabel = pricing.includeGST
      ? `${formatCurrency(pricing.fixedPrice)} (Inc. ${pricing.gstRate}% GST)`
      : formatCurrency(pricing.fixedPrice);
    costBreakdownHtml = fixedPartial
      .replace(/\{\{FIXED_PRICE_AMOUNT\}\}/g, escapeHtml(fixedPriceLabel))
      .replace(/\{\{DEPOSIT_AMOUNT\}\}/g, escapeHtml(formatCurrency(deposit)));
  } else {
    const hourlyPartial = loadHtmlFile('partials/cost_breakdown_hourly.html');
    const hourlyRateLabel = `${formatCurrency(pricing.baseHourlyRate)} / hour`;
    const minHoursLabel = `${pricing.minimumChargeHours} ${pricing.minimumChargeHours === 1 ? 'Hour' : 'Hours'}`;
    const calloutSummary = `${formatDurationMinutes(pricing.calloutTimeMinutes)} | ${formatCurrency(pricing.baseCalloutCharge)}`;
    const travelBackSummary = pricing.hasTravelBack
      ? `${formatDurationMinutes(pricing.travelBackTimeMinutes)} | ${formatCurrency(pricing.baseTravelBackCharge)}`
      : '';
    const stairsSummary = pricing.hasStairs
      ? formatCurrency(pricing.baseStairsCharge)
      : '';

    const hasAnyRowAfterCallout = pricing.hasTravelBack || pricing.hasStairs || pricing.includeGST;
    const calloutBorderStyle = hasAnyRowAfterCallout ? 'border-bottom:1.5px solid #BAC9D6;' : '';

    const calloutRow = `
            <tr>
              <td class="pricing-label" style="padding:14px 20px;${calloutBorderStyle}color:#334155;font-size:14px;font-weight:700;">Callout</td>
              <td class="pricing-value" style="padding:14px 20px;${calloutBorderStyle}color:#101D4F;font-size:15px;font-weight:800;text-align:right;">
                ${escapeHtml(calloutSummary)}
                <div style="font-size:11.5px;color:#64748B;font-weight:600;margin-top:3px;">Time to arrive at your address</div>
              </td>
            </tr>
    `.trim();

    const hasAnyRowAfterTravelBack = pricing.hasStairs || pricing.includeGST;
    const travelBackBorderStyle = hasAnyRowAfterTravelBack ? 'border-bottom:1.5px solid #BAC9D6;' : '';

    const travelBackRow = pricing.hasTravelBack
      ? `
            <tr style="background:#FAFDFE;">
              <td class="pricing-label" style="padding:14px 20px;${travelBackBorderStyle}color:#334155;font-size:14px;font-weight:700;">Travel Back</td>
              <td class="pricing-value" style="padding:14px 20px;${travelBackBorderStyle}color:#101D4F;font-size:15px;font-weight:800;text-align:right;">
                ${escapeHtml(travelBackSummary)}
                <div style="font-size:11.5px;color:#64748B;font-weight:600;margin-top:3px;">Return trip charge</div>
              </td>
            </tr>
      `.trim()
      : '';

    const hasAnyRowAfterStairs = pricing.includeGST;
    const stairsBorderStyle = hasAnyRowAfterStairs ? 'border-bottom:1.5px solid #BAC9D6;' : '';

    const stairsRow = pricing.hasStairs
      ? `
            <tr style="${pricing.hasTravelBack ? '' : 'background:#FAFDFE;'}">
              <td class="pricing-label" style="padding:14px 20px;${stairsBorderStyle}color:#334155;font-size:14px;font-weight:700;">Stairs Charge</td>
              <td class="pricing-value" style="padding:14px 20px;${stairsBorderStyle}color:#101D4F;font-size:15px;font-weight:800;text-align:right;">
                ${escapeHtml(stairsSummary)}
                <div style="font-size:11.5px;color:#64748B;font-weight:600;margin-top:3px;">Stair navigation fee</div>
              </td>
            </tr>
      `.trim()
      : '';

    const gstRow = pricing.includeGST
      ? `
            <tr style="background:#FAFDFE;border-top:1.5px solid #BAC9D6;">
              <td class="pricing-label" style="padding:12px 20px;border-bottom:1px dashed #CBD5E1;color:#475569;font-size:13.5px;font-weight:700;">Subtotal (Excl. GST)</td>
              <td class="pricing-value" style="padding:12px 20px;border-bottom:1px dashed #CBD5E1;color:#334155;font-size:14.5px;font-weight:800;text-align:right;">
                ${formatCurrency(pricing.baseMinimumEstimatedCost)}
              </td>
            </tr>
            <tr style="background:#F0FDF4;">
              <td class="pricing-label" style="padding:12px 20px;color:#166534;font-size:13.5px;font-weight:700;">GST (${pricing.gstRate}%)</td>
              <td class="pricing-value" style="padding:12px 20px;color:#15803D;font-size:14.5px;font-weight:800;text-align:right;">
                +${formatCurrency(pricing.gstAmount)}
              </td>
            </tr>
      `.trim()
      : '';

    const includedItems = ['minimum charge', 'callout'];
    if (pricing.hasTravelBack) includedItems.push('travel back');
    if (pricing.hasStairs) includedItems.push('stairs');
    const minCostDesc = `Includes ${includedItems.join(' + ')} fees${pricing.includeGST ? ` + GST (${pricing.gstRate}%)` : ''}`;

    // Scenarios Calculations: 2.5 Hours, 3 Hours, 4 Hours
    const hrCost1 = roundMoney(pricing.baseHourlyRate * 2.5);
    const hrCost2 = roundMoney(pricing.baseHourlyRate * 3);
    const hrCost3 = roundMoney(pricing.baseHourlyRate * 4);
    const calloutStr = formatCurrency(pricing.baseCalloutCharge);

    const sub1 = hrCost1 + pricing.baseCalloutCharge;
    const tot1 = pricing.includeGST ? roundMoney(sub1 * (1 + pricing.gstRateMultiplier)) : sub1;
    const scenario1Hourly = `${formatCurrency(pricing.baseHourlyRate)} × 2.5 = ${formatCurrency(hrCost1)}`;
    const scenario1Total = formatCurrency(tot1);

    const sub2 = hrCost2 + pricing.baseCalloutCharge;
    const tot2 = pricing.includeGST ? roundMoney(sub2 * (1 + pricing.gstRateMultiplier)) : sub2;
    const scenario2Hourly = `${formatCurrency(pricing.baseHourlyRate)} × 3 = ${formatCurrency(hrCost2)}`;
    const scenario2Total = formatCurrency(tot2);

    const sub3 = hrCost3 + pricing.baseCalloutCharge;
    const tot3 = pricing.includeGST ? roundMoney(sub3 * (1 + pricing.gstRateMultiplier)) : sub3;
    const scenario3Hourly = `${formatCurrency(pricing.baseHourlyRate)} × 4 = ${formatCurrency(hrCost3)}`;
    const scenario3Total = formatCurrency(tot3);

    costBreakdownHtml = hourlyPartial
      .replace(/\{\{JOB_NUMBER\}\}/g, escapeHtml(jobNumber))
      .replace(/\{\{HOURLY_RATE_LABEL\}\}/g, escapeHtml(hourlyRateLabel))
      .replace(/\{\{MINIMUM_LABOR_COST\}\}/g, escapeHtml(formatCurrency(pricing.baseMinimumLaborCost)))
      .replace(/\{\{MINIMUM_CHARGE_HOURS_LABEL\}\}/g, escapeHtml(minHoursLabel))
      .replace(/\{\{CALLOUT_ROW\}\}/g, calloutRow)
      .replace(/\{\{CALLOUT_SUMMARY\}\}/g, escapeHtml(calloutSummary))
      .replace(/\{\{CALLOUT_BORDER_STYLE\}\}/g, calloutBorderStyle)
      .replace(/\{\{TRAVEL_BACK_ROW\}\}/g, travelBackRow)
      .replace(/\{\{TRAVEL_BACK_SUMMARY\}\}/g, escapeHtml(travelBackSummary))
      .replace(/\{\{STAIRS_ROW\}\}/g, stairsRow)
      .replace(/\{\{STAIRS_SUMMARY\}\}/g, escapeHtml(stairsSummary))
      .replace(/\{\{GST_ROW\}\}/g, gstRow)
      .replace(/\{\{MINIMUM_ESTIMATED_COST_DESCRIPTION\}\}/g, minCostDesc)
      .replace(/\{\{MINIMUM_ESTIMATED_COST\}\}/g, escapeHtml(formatCurrency(pricing.minimumEstimatedCost)))
      .replace(/\{\{DEPOSIT_AMOUNT\}\}/g, escapeHtml(formatCurrency(deposit)))
      .replace(/\{\{SCENARIO_CALLOUT\}\}/g, escapeHtml(calloutStr))
      .replace(/\{\{SCENARIO_1_HOURLY\}\}/g, escapeHtml(scenario1Hourly))
      .replace(/\{\{SCENARIO_1_TOTAL\}\}/g, escapeHtml(scenario1Total))
      .replace(/\{\{SCENARIO_2_HOURLY\}\}/g, escapeHtml(scenario2Hourly))
      .replace(/\{\{SCENARIO_2_TOTAL\}\}/g, escapeHtml(scenario2Total))
      .replace(/\{\{SCENARIO_3_HOURLY\}\}/g, escapeHtml(scenario3Hourly))
      .replace(/\{\{SCENARIO_3_TOTAL\}\}/g, escapeHtml(scenario3Total));
  }

  // 2. Bank Details
  const bankConfig = getBankDetails(job, bankDetails);
  const resolvedPaymentRef = String(bankConfig.paymentReference).replace(/\{\{job_id\}\}/g, jobNumber);
  const resolvedInstructions = String(bankConfig.instructions)
    .replace(/\{\{job_id\}\}/g, jobNumber)
    .replace(/\{\{deposit_amount\}\}/g, formatCurrency(deposit));

  const bankPartial = loadHtmlFile('partials/bank_details.html');
  const bankDetailsHtml = bankPartial
    .replace(/\{\{BANK_TITLE\}\}/g, escapeHtml(bankConfig.heading))
    .replace(/\{\{BANK_SUBTITLE\}\}/g, escapeHtml(bankConfig.subtitle))
    .replace(/\{\{BANK_NAME\}\}/g, escapeHtml(bankConfig.bankName))
    .replace(/\{\{ACCOUNT_NAME\}\}/g, escapeHtml(bankConfig.accountName))
    .replace(/\{\{BSB\}\}/g, escapeHtml(bankConfig.bsb))
    .replace(/\{\{ACCOUNT_NUMBER\}\}/g, escapeHtml(bankConfig.accountNumber))
    .replace(/\{\{PAYMENT_REFERENCE\}\}/g, escapeHtml(resolvedPaymentRef))
    .replace(/\{\{PAYMENT_INSTRUCTIONS\}\}/g, escapeHtml(resolvedInstructions).replace(/\n/g, '<br>'));

  // 3. Terms
  const termsHtml = loadHtmlFile('partials/terms_conditions.html');

  // 4. Moving Truck Banner Partial
  const explicitConfirmationTruckUrl = (job.movingTruckGifUrl === false || job.moving_truck_gif_url === false || job.movingTruckBannerUrl === false || job.moving_truck_banner_url === false)
    ? ''
    : String(
        firstValue(
          job.movingTruckGifUrl,
          job.moving_truck_gif_url,
          job.movingTruckBannerUrl,
          job.moving_truck_banner_url,
          ''
        ) || ''
      ).trim();

  let resolvedConfirmationTruckSrc = '';
  let shouldAttachConfirmationTruckGif = false;

  if (job.movingTruckGifUrl === false || job.moving_truck_gif_url === false || job.movingTruckBannerUrl === false) {
    resolvedConfirmationTruckSrc = '';
  } else if (explicitConfirmationTruckUrl) {
    resolvedConfirmationTruckSrc = explicitConfirmationTruckUrl;
  }

  const confirmationBannerPartial = loadHtmlFile('partials/moving_truck_banner.html');
  const confirmationMovingTruckBannerSection = resolvedConfirmationTruckSrc && confirmationBannerPartial
    ? confirmationBannerPartial.replace(/\{\{MOVING_TRUCK_GIF_URL\}\}/g, escapeHtml(resolvedConfirmationTruckSrc))
    : '';

  const thankYouTruckAttachment = makeThankYouTruckAttachment();
  const hasThankYouTruckAttachment = thankYouTruckAttachment.length > 0;
  const frontendBaseUrl = String(process.env.FRONTEND_URL || 'https://deliveryplus.tech').replace(/\/$/, '');
  const thankYouTruckSrc = hasThankYouTruckAttachment
    ? 'cid:deliveryplus-thankyou-truck'
    : `${frontendBaseUrl}/email-assets/deliveryplus_truck_thankyou.png`;

  const confirmationAttachments = [
    ...logoAttachment,
    ...(shouldAttachConfirmationTruckGif ? truckAttachment : []),
    ...thankYouTruckAttachment,
    ...(Array.isArray(attachments) ? attachments : []),
  ];

  // 5. Assemble Main Confirmation Template
  const mainTemplate = loadHtmlFile('booking_confirmation.html');
  const fullHtml = mainTemplate
    .replace(/\{\{JOB_NUMBER\}\}/g, escapeHtml(jobNumber))
    .replace(/\{\{CUSTOMER_NAME\}\}/g, escapeHtml(customerName))
    .replace(/\{\{CUSTOMER_PHONE\}\}/g, escapeHtml(customerPhone))
    .replace(/\{\{CUSTOMER_EMAIL\}\}/g, escapeHtml(customerEmail))
    .replace(/\{\{SCHEDULED_DATE\}\}/g, escapeHtml(scheduledDate))
    .replace(/\{\{SCHEDULED_TIME\}\}/g, escapeHtml(scheduledTime))
    .replace(/\{\{PICKUP_ADDRESS\}\}/g, escapeHtml(pickupAddress))
    .replace(/\{\{DROP_ADDRESS\}\}/g, escapeHtml(dropAddress))
    .replace(/\{\{TRUCK_SIZE\}\}/g, escapeHtml(truckSize))
    .replace(/\{\{MOVERS_COUNT\}\}/g, escapeHtml(movers))
    .replace(/\{\{DEPOSIT_AMOUNT\}\}/g, escapeHtml(formatCurrency(deposit)))
    .replace(/\{\{LOGO_HTML\}\}/g, logoHtml)
    .replace(/\{\{THANK_YOU_LOGO\}\}/g, thankYouLogoHtml)
    .replace(/\{\{THANKYOU_TRUCK_IMAGE_SRC\}\}/g, thankYouTruckSrc)
    .replace(/\{\{COST_BREAKDOWN_SECTION\}\}/g, costBreakdownHtml)
    .replace(/\{\{BANK_DETAILS_SECTION\}\}/g, bankDetailsHtml)
    .replace(/\{\{TERMS_SECTION\}\}/g, termsHtml)
    .replace(/\{\{MOVING_TRUCK_BANNER_SECTION\}\}/g, confirmationMovingTruckBannerSection);

  // Plain Text Version
  const text = [
    `Hi ${customerName},`,
    '',
    `This email confirms that we received your booking deposit of ${formatCurrency(deposit)}.`,
    `Quote Reference: ${jobNumber}`,
    `Pickup: ${pickupAddress}`,
    `Drop-off: ${dropAddress}`,
    `Scheduled Date: ${scheduledDate}`,
    `Scheduled Time: ${scheduledTime}`,
    `Truck Size: ${truckSize}`,
    `Movers: ${displayValue(movers)}`,
    '',
    'Cost Breakdown',
    'PRICING SUMMARY',
    pricingType === 'fixed'
      ? `Fixed Price: ${formatCurrency(fixedPrice)}`
      : [
          `Rate: ${formatCurrency(pricing.baseHourlyRate)} / hour`,
          `Minimum Charge: ${formatCurrency(pricing.baseMinimumLaborCost)} (${pricing.minimumChargeHours} Hours)`,
          `Callout: ${formatDurationMinutes(pricing.calloutTimeMinutes)} | ${formatCurrency(pricing.baseCalloutCharge)}`,
          ...(pricing.hasTravelBack ? [`Travel Back: ${formatDurationMinutes(pricing.travelBackTimeMinutes)} | ${formatCurrency(pricing.baseTravelBackCharge)}`] : []),
          ...(pricing.hasStairs ? [`Stairs Charge: ${formatCurrency(pricing.baseStairsCharge)}`] : []),
          ...(pricing.includeGST
            ? [
                `Subtotal (Excl. GST): ${formatCurrency(pricing.baseMinimumEstimatedCost)}`,
                `GST (${pricing.gstRate}%): +${formatCurrency(pricing.gstAmount)}`,
                `Minimum Estimated Cost (Total Inc. GST): ${formatCurrency(pricing.minimumEstimatedCost)}`,
              ]
            : [`Minimum Estimated Cost: ${formatCurrency(pricing.minimumEstimatedCost)}`]),
        ].join('\n'),
    '',
    '--- Bank Details ---',
    `Bank: ${bankConfig.bankName}`,
    `Account Name: ${bankConfig.accountName}`,
    `BSB: ${bankConfig.bsb}`,
    `Account Number: ${bankConfig.accountNumber}`,
    `Payment Reference: ${resolvedPaymentRef}`,
    '',
    'Regards,',
    'Team Delivery Plus',
  ].join('\n');

  return {
    subject: `Delivery Plus Booking Confirmation – ${jobNumber}`,
    html: fullHtml,
    text,
    attachments: confirmationAttachments,
  };
};

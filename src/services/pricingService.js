const safeNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  if (number < 0) return fallback;
  return number;
};

const asOptionalNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const toCents = (value) => Math.round(safeNumber(value, 0) * 100);
const fromCents = (value) => Math.round(safeNumber(value, 0)) / 100;
const roundCurrency = (value) => fromCents(toCents(value));
const safeCurrency = (value) => roundCurrency(safeNumber(value, 0));

const getDurationMinutes = ({ hours, minutes }) => {
  const hourValue = safeNumber(hours, 0);
  const minuteValue = safeNumber(minutes, 0);
  return Math.round((hourValue * 60) + minuteValue);
};

const getMinimumChargeHours = (job = {}) => {
  const minimumChargeHours = safeNumber(
    job.minimumChargeHours ?? job.minimumHours ?? job.minimumDuration ?? job.estimatedHours,
    0
  );

  if (minimumChargeHours <= 0) return 2.5;
  return minimumChargeHours;
};

export const calculateMinimumEstimatedCost = ({
  pricingType,
  fixedPrice,
  hourlyRate,
  minimumChargeHours,
  calloutCharge,
  travelBackCharge,
  stairsCharge = 0,
}) => {
  const calloutChargeCents = toCents(calloutCharge);
  const travelBackChargeCents = toCents(travelBackCharge);
  const stairsChargeCents = toCents(stairsCharge);

  if (String(pricingType || '').trim().toLowerCase() === 'fixed' && Number.isFinite(Number(fixedPrice)) && Number(fixedPrice) >= 0) {
    const fixedPriceCents = toCents(fixedPrice);
    const minimumEstimatedCostCents = fixedPriceCents + calloutChargeCents + travelBackChargeCents + stairsChargeCents;

    return {
      minimumLaborCharge: fromCents(fixedPriceCents),
      minimumLaborCost: fromCents(fixedPriceCents),
      minimumEstimatedCost: fromCents(minimumEstimatedCostCents),
    };
  }

  const hourlyRateCents = toCents(hourlyRate);
  const safeMinimumHours = safeNumber(minimumChargeHours, 0);
  const minimumLaborChargeCents = Math.round(
    hourlyRateCents * safeMinimumHours
  );

  const minimumEstimatedCostCents =
    minimumLaborChargeCents +
    calloutChargeCents +
    travelBackChargeCents +
    stairsChargeCents;

  return {
    minimumLaborCharge: fromCents(minimumLaborChargeCents),
    minimumLaborCost: fromCents(minimumLaborChargeCents),
    minimumEstimatedCost: fromCents(minimumEstimatedCostCents),
  };
};

export const calculateExtraTimePricing = ({
  pricingType,
  hourlyRate,
  minimumChargeHours,
  actualDurationMinutes,
}) => {
  const safeMinutes = Math.max(0, Math.round(safeNumber(actualDurationMinutes, 0)));
  if (String(pricingType || '').trim().toLowerCase() === 'fixed') {
    return {
      actualDurationMinutes: safeMinutes,
      extraTimeMinutes: 0,
      extraTimeBlocks: 0,
      extraTimeCharge: 0,
      extraTimeBlockMinutes: 30,
      extraTimeRatePerBlock: 0,
    };
  }

  const safeHourlyRate = safeNumber(hourlyRate, 0);
  const minimumChargeMinutes = Math.round(getMinimumChargeHours({ minimumChargeHours }) * 60);
  const rawExtraMinutes = Math.max(0, safeMinutes - minimumChargeMinutes);
  const extraTimeBlockMinutes = 30;
  const extraTimeBlocks = Math.ceil(rawExtraMinutes / extraTimeBlockMinutes);
  const chargedExtraMinutes = extraTimeBlocks * extraTimeBlockMinutes;
  const extraTimeRatePerBlock = roundCurrency(safeHourlyRate / 2);
  const extraTimeCharge = roundCurrency(extraTimeBlocks * extraTimeRatePerBlock);

  return {
    actualDurationMinutes: safeMinutes,
    extraTimeMinutes: Math.max(0, chargedExtraMinutes),
    extraTimeBlocks,
    extraTimeCharge,
    extraTimeBlockMinutes,
    extraTimeRatePerBlock,
  };
};

export const buildPricingSnapshot = (job = {}) => {
  const pricingSource = job.pricing ?? job.pricingSnapshot ?? {};
  const hourlyRate = safeNumber(
    job.hourlyRate ?? job.price ?? job.rate ?? pricingSource.hourlyRate ?? 0,
    0
  );

  const minimumChargeHours = getMinimumChargeHours(job);
  const minimumChargeMinutes = Math.round(minimumChargeHours * 60);

  const calloutCharge = safeCurrency(
    asOptionalNumber(job.callOutFee ?? job.calloutFee ?? job.callOutCharge ?? job.calloutCharge ?? pricingSource.calloutCharge) ?? 0
  );
  const calloutTimeMinutes = getDurationMinutes({
    hours: asOptionalNumber(job.callOutTimeHr ?? job.calloutTimeHr ?? pricingSource.calloutTimeHours) ?? 0,
    minutes: asOptionalNumber(job.callOutTimeMin ?? job.calloutTimeMin ?? job.calloutTimeMinutes ?? pricingSource.calloutTimeMinutes) ?? 0,
  });

  const travelBackCharge = safeCurrency(
    asOptionalNumber(job.travelBackFee ?? job.travelBackCharge ?? job.returnTravelCharge ?? pricingSource.travelBackCharge) ?? 0
  );
  const travelBackTimeMinutes = getDurationMinutes({
    hours: asOptionalNumber(job.travelBackTimeHr ?? job.travelbackTimeHr ?? pricingSource.travelBackTimeHours) ?? 0,
    minutes: asOptionalNumber(job.travelBackTimeMin ?? job.travelbackTimeMin ?? pricingSource.travelBackTimeMinutes) ?? 0,
  });

  const stairsCharge = safeCurrency(
    asOptionalNumber(job.stairsFee ?? job.stairsCharge ?? pricingSource.stairsCharge) ?? 0
  );

  const fixedPrice = safeCurrency(
    job.fixedPrice ?? job.fixedQuote ?? job.quoteAmount ?? pricingSource.fixedPrice ?? 0
  );
  const pricingType = String(job.pricingType ?? pricingSource.pricingType ?? '').trim().toLowerCase();

  const { minimumLaborCharge, minimumLaborCost, minimumEstimatedCost } = calculateMinimumEstimatedCost({
    pricingType,
    fixedPrice,
    hourlyRate,
    minimumChargeHours,
    calloutCharge,
    travelBackCharge,
    stairsCharge,
  });

  const actualDurationMinutes = Math.max(
    0,
    Math.round(safeNumber(job.totalWorkedMinutes ?? job.actualDurationMinutes ?? pricingSource.actualDurationMinutes, 0))
  );

  const extraTimePricing = calculateExtraTimePricing({
    pricingType,
    hourlyRate,
    minimumChargeHours,
    actualDurationMinutes,
  });

  const otherApprovedCharges = safeCurrency(
    job.billing?.extraCharges ?? job.otherApprovedCharges ?? pricingSource.otherApprovedCharges ?? 0
  );
  const includeGST = Boolean(
    job.includeGST ?? job.billing?.includeGST ?? pricingSource.includeGST ?? false
  );
  const rawGstRate = safeNumber(
    job.gstRate ?? job.billing?.gstRate ?? pricingSource.gstRate ?? 10,
    10
  );
  const gstRateMultiplier = rawGstRate > 1 ? rawGstRate / 100 : rawGstRate;
  const gstRate = includeGST ? gstRateMultiplier : 0;

  const subtotal = roundCurrency(minimumEstimatedCost + extraTimePricing.extraTimeCharge + otherApprovedCharges);
  const gst = includeGST ? roundCurrency(subtotal * gstRateMultiplier) : 0;
  const grandTotal = roundCurrency(subtotal + gst);
  const amountPaid = safeCurrency(
    job.amountPaid ?? job.bookingDepositAmount ?? job.confirmationAmount ?? job.billing?.amountPaid ?? pricingSource.amountPaid ?? 0
  );
  const outstandingAmount = roundCurrency(Math.max(0, grandTotal - amountPaid));

  const pricing = {
    hourlyRate: roundCurrency(hourlyRate),
    minimumChargeHours: roundCurrency(minimumChargeHours),
    minimumChargeMinutes,
    minimumLaborCharge,
    minimumLaborCost,
    calloutCharge,
    calloutTimeMinutes,
    travelBackCharge,
    travelBackTimeMinutes,
    stairsCharge,
    minimumEstimatedCost,
    extraTimeBlockMinutes: extraTimePricing.extraTimeBlockMinutes,
    extraTimeRatePerBlock: extraTimePricing.extraTimeRatePerBlock,
    actualDurationMinutes: extraTimePricing.actualDurationMinutes,
    extraTimeMinutes: extraTimePricing.extraTimeMinutes,
    extraTimeBlocks: extraTimePricing.extraTimeBlocks,
    extraTimeCharge: extraTimePricing.extraTimeCharge,
    otherApprovedCharges,
    includeGST,
    gstRate: rawGstRate,
    subtotal,
    gst,
    grandTotal,
    amountPaid,
    outstandingAmount,
    finalTotal: grandTotal,
    totalAmount: grandTotal,
  };

  return pricing;
};

export const buildPricingSnapshotForStorage = (job = {}) => {
  const pricing = buildPricingSnapshot(job);
  return {
    hourlyRate: pricing.hourlyRate,
    minimumChargeHours: pricing.minimumChargeHours,
    minimumChargeMinutes: pricing.minimumChargeMinutes,
    minimumLaborCharge: pricing.minimumLaborCharge,
    minimumLaborCost: pricing.minimumLaborCost,
    calloutCharge: pricing.calloutCharge,
    calloutTimeMinutes: pricing.calloutTimeMinutes,
    travelBackCharge: pricing.travelBackCharge,
    travelBackTimeMinutes: pricing.travelBackTimeMinutes,
    stairsCharge: pricing.stairsCharge,
    minimumEstimatedCost: pricing.minimumEstimatedCost,
    extraTimeBlockMinutes: pricing.extraTimeBlockMinutes,
    extraTimeRatePerBlock: pricing.extraTimeRatePerBlock,
    actualDurationMinutes: pricing.actualDurationMinutes,
    extraTimeMinutes: pricing.extraTimeMinutes,
    extraTimeBlocks: pricing.extraTimeBlocks,
    extraTimeCharge: pricing.extraTimeCharge,
    otherApprovedCharges: pricing.otherApprovedCharges,
    includeGST: pricing.includeGST,
    gstRate: pricing.gstRate,
    subtotal: pricing.subtotal,
    gst: pricing.gst,
    grandTotal: pricing.grandTotal,
    amountPaid: pricing.amountPaid,
    outstandingAmount: pricing.outstandingAmount,
    finalTotal: pricing.finalTotal,
    totalAmount: pricing.totalAmount,
  };
};

export const safePricingValue = (job, field, fallback = 0) => {
  const value =
    job?.pricing?.[field] ??
    job?.pricingSnapshot?.[field] ??
    job?.[field] ??
    fallback;

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return roundCurrency(numeric);
};

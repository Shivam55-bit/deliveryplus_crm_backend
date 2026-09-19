const roundCurrency = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const safeNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, num);
};

/**
 * Calculates authoritative driver session earnings.
 * 
 * Rules for hourly pricing:
 * - baseHours = estimatedHours || minimumChargeHours || 2.0
 * - baseMinutes = baseHours * 60
 * - baseAmount = hourlyRate * baseHours
 * - overtimeMinutes = Math.max(0, totalWorkedMinutes - baseMinutes)
 * - overtimeBlocks = Math.ceil(overtimeMinutes / 30)
 * - halfHourRate = hourlyRate / 2
 * - overtimeAmount = overtimeBlocks * halfHourRate
 * - finalDriverAmount = baseAmount + overtimeAmount
 */
export const calculateDriverSessionPricing = ({
  pricingType = 'hourly',
  hourlyRate = 0,
  baseHours = 2,
  totalWorkedMinutes = 0,
  fixedPrice = null,
  driverPriceType = null,
  driverPrice = null,
  driverPricePercentage = null,
  showDriverPrice = false,
  isCompleted = false,
  existingSnapshot = null,
} = {}) => {
  // If an immutable completed snapshot already exists with finalDriverAmount, preserve its historical value
  if (existingSnapshot && existingSnapshot.isFinal && existingSnapshot.finalDriverAmount !== undefined && existingSnapshot.finalDriverAmount !== null) {
    return {
      ...existingSnapshot,
      showDriverPrice: showDriverPrice !== undefined ? Boolean(showDriverPrice) : Boolean(existingSnapshot.showDriverPrice),
    };
  }

  const normalizedPricingType = String(pricingType || 'hourly').trim().toLowerCase();
  const safeWorkedMinutes = Math.max(0, Math.round(safeNumber(totalWorkedMinutes, 0)));
  const isHourly = normalizedPricingType === 'hourly';

  if (!isHourly) {
    // Fixed pricing logic
    let resolvedFixedAmount = 0;
    const baseFixedPrice = safeNumber(fixedPrice, 0);

    if (driverPriceType === 'custom' && driverPrice !== null && driverPrice !== undefined) {
      resolvedFixedAmount = safeNumber(driverPrice, 0);
    } else if (driverPriceType === 'percentage' && driverPricePercentage !== null && driverPricePercentage !== undefined) {
      const pct = Math.min(100, Math.max(0, safeNumber(driverPricePercentage, 0)));
      resolvedFixedAmount = roundCurrency((baseFixedPrice * pct) / 100);
    } else {
      resolvedFixedAmount = baseFixedPrice;
    }

    const finalAmount = roundCurrency(resolvedFixedAmount);

    return {
      pricingType: 'fixed',
      hourlyRate: null,
      baseHours: null,
      baseMinutes: null,
      baseAmount: finalAmount,
      halfHourRate: null,
      totalWorkedMinutes: safeWorkedMinutes,
      overtimeMinutes: 0,
      overtimeBlocks: 0,
      overtimeAmount: 0,
      finalDriverAmount: finalAmount,
      showDriverPrice: Boolean(showDriverPrice),
      isFinal: Boolean(isCompleted),
      calculatedAt: isCompleted ? new Date().toISOString() : null,
    };
  }

  // Hourly pricing logic
  const safeHourlyRate = safeNumber(hourlyRate, 0);
  const safeBaseHours = safeNumber(baseHours, 2) || 2;
  const baseMinutes = Math.round(safeBaseHours * 60);
  const baseAmount = roundCurrency(safeHourlyRate * safeBaseHours);
  const halfHourRate = roundCurrency(safeHourlyRate / 2);

  const overtimeMinutes = Math.max(0, safeWorkedMinutes - baseMinutes);
  const overtimeBlocks = Math.ceil(overtimeMinutes / 30);
  const overtimeAmount = roundCurrency(overtimeBlocks * halfHourRate);
  const finalDriverAmount = roundCurrency(baseAmount + overtimeAmount);

  return {
    pricingType: 'hourly',
    hourlyRate: roundCurrency(safeHourlyRate),
    baseHours: roundCurrency(safeBaseHours),
    baseMinutes,
    baseAmount,
    halfHourRate,
    totalWorkedMinutes: safeWorkedMinutes,
    overtimeMinutes,
    overtimeBlocks,
    overtimeAmount,
    finalDriverAmount,
    showDriverPrice: Boolean(showDriverPrice),
    isFinal: Boolean(isCompleted),
    calculatedAt: isCompleted ? new Date().toISOString() : null,
  };
};

/**
 * Creates the initial snapshot when a driver starts working.
 */
export const createDriverStartPricingSnapshot = (job = {}) => {
  const pricingType = String(job.pricingType || 'hourly').trim().toLowerCase();
  const hourlyRate = safeNumber(job.hourlyRate, 0);
  const baseHours = safeNumber(job.estimatedHours ?? job.minimumChargeHours, 2) || 2;
  const fixedPrice = job.fixedPrice ?? job.fixedQuote ?? null;
  const driverPriceType = job.driverPriceType || null;
  const driverPrice = job.driverPrice ?? null;
  const driverPricePercentage = job.driverPricePercentage ?? null;
  const showDriverPrice = Boolean(job.showDriverPrice);

  return calculateDriverSessionPricing({
    pricingType,
    hourlyRate,
    baseHours,
    totalWorkedMinutes: 0,
    fixedPrice,
    driverPriceType,
    driverPrice,
    driverPricePercentage,
    showDriverPrice,
    isCompleted: false,
  });
};

/**
 * Finalizes driver session pricing upon session end or job completion.
 */
export const finalizeDriverSessionPricing = (assignment = {}, job = {}, completedAt = new Date()) => {
  const startedAt = assignment.startedAt ? new Date(assignment.startedAt) : null;
  const endedAt = completedAt ? new Date(completedAt) : new Date();

  let totalWorkedMinutes = safeNumber(assignment.totalWorkedMinutes, 0);
  if (startedAt && (!totalWorkedMinutes || totalWorkedMinutes <= 0)) {
    const durationMs = endedAt.getTime() - startedAt.getTime();
    totalWorkedMinutes = Math.max(0, Math.floor(durationMs / 60000));
  }

  const existingSnapshot = assignment.pricingSnapshot || null;

  const pricingType = existingSnapshot?.pricingType || job.pricingType || 'hourly';
  const hourlyRate = existingSnapshot?.hourlyRate ?? job.hourlyRate ?? 0;
  const baseHours = existingSnapshot?.baseHours ?? job.estimatedHours ?? job.minimumChargeHours ?? 2;
  const fixedPrice = existingSnapshot?.fixedPrice ?? job.fixedPrice ?? job.fixedQuote ?? null;
  const driverPriceType = existingSnapshot?.driverPriceType ?? job.driverPriceType ?? null;
  const driverPrice = existingSnapshot?.driverPrice ?? job.driverPrice ?? null;
  const driverPricePercentage = existingSnapshot?.driverPricePercentage ?? job.driverPricePercentage ?? null;
  const showDriverPrice = job.showDriverPrice !== undefined ? Boolean(job.showDriverPrice) : Boolean(existingSnapshot?.showDriverPrice);

  return calculateDriverSessionPricing({
    pricingType,
    hourlyRate,
    baseHours,
    totalWorkedMinutes,
    fixedPrice,
    driverPriceType,
    driverPrice,
    driverPricePercentage,
    showDriverPrice,
    isCompleted: true,
    existingSnapshot: existingSnapshot?.isFinal ? existingSnapshot : null,
  });
};

/**
 * Derives legacy pricing snapshot for older jobs without driverAssignments.
 */
export const deriveLegacyDriverPricing = (job = {}, totalWorkedMinutes = 0) => {
  const pricingType = String(job.pricingType || 'hourly').trim().toLowerCase();
  const hourlyRate = safeNumber(job.hourlyRate, 0);
  const baseHours = safeNumber(job.estimatedHours ?? job.minimumChargeHours, 2) || 2;
  const fixedPrice = job.fixedPrice ?? job.fixedQuote ?? null;
  const showDriverPrice = Boolean(job.showDriverPrice);

  const pricing = calculateDriverSessionPricing({
    pricingType,
    hourlyRate,
    baseHours,
    totalWorkedMinutes,
    fixedPrice,
    showDriverPrice,
    isCompleted: ['completed', 'finished'].includes(String(job.status || '').toLowerCase()),
  });

  return {
    ...pricing,
    isLegacy: true,
  };
};

import { buildPricingSnapshot, calculateMinimumEstimatedCost } from '../services/pricingService.js';

const toCurrency = (value) => Math.round((Number(value || 0) * 100)) / 100;

export const calculateBilling = (job) => {
  if (job.pricingType === 'fixed') {
    const fixedQuote = Number(job.fixedQuote || 0);
    const discount = Number(job.billing?.discount || 0);
    const subtotal = fixedQuote - discount;
    const gst = subtotal * 0.1;
    const totalAmount = subtotal + gst;

    return {
      laborCost: toCurrency(fixedQuote),
      extraCharges: 0,
      fuelCharges: Number(job.billing?.fuelCharges || 0),
      tollCharges: Number(job.billing?.tollCharges || 0),
      gst: toCurrency(gst),
      discount: toCurrency(discount),
      totalAmount: toCurrency(totalAmount),
    };
  }

  const pricingSnapshot = buildPricingSnapshot({
    ...job,
    pricing: job.pricing ?? job.pricingSnapshot,
    totalWorkedMinutes: job.totalWorkedMinutes || job.actualDurationMinutes || 0,
  });

  const minimumEstimatedCost = Number(pricingSnapshot.minimumEstimatedCost || 0);
  const extraTimeCharge = Number(pricingSnapshot.extraTimeCharge || 0);
  const extraCharges = Number(job.billing?.extraCharges || 0) + extraTimeCharge;
  const fuelCharges = Number(job.billing?.fuelCharges || 0);
  const tollCharges = Number(job.billing?.tollCharges || 0);
  const discount = Number(job.billing?.discount || 0);

  const subtotal = minimumEstimatedCost + extraCharges + fuelCharges + tollCharges - discount;
  const gst = subtotal * 0.1;
  const totalAmount = subtotal + gst;

  return {
    laborCost: toCurrency(minimumEstimatedCost),
    extraCharges: toCurrency(extraCharges),
    fuelCharges: toCurrency(fuelCharges),
    tollCharges: toCurrency(tollCharges),
    gst: toCurrency(gst),
    discount: toCurrency(discount),
    totalAmount: toCurrency(totalAmount),
  };
};

export const calculateWorkedTime = (timerStarted, timerEnded, pauseIntervals = []) => {
  if (!timerStarted || !timerEnded) return { totalMinutes: 0, billableHours: 0 };

  const start = new Date(timerStarted).getTime();
  const end = new Date(timerEnded).getTime();
  let totalPauseMs = 0;

  for (const interval of pauseIntervals) {
    if (interval.pausedAt && interval.resumedAt) {
      totalPauseMs += new Date(interval.resumedAt).getTime() - new Date(interval.pausedAt).getTime();
    }
  }

  const workedMs = end - start - totalPauseMs;
  const totalMinutes = Math.max(0, Math.round(workedMs / 60000));
  const billableHours = Math.round((totalMinutes / 60) * 100) / 100;

  return { totalMinutes, billableHours };
};

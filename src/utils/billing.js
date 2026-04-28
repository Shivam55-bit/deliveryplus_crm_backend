export const calculateBilling = (job) => {
  let laborCost = 0;

  if (job.pricingType === 'fixed') {
    laborCost = job.fixedQuote || 0;
  } else {
    laborCost = (job.billableHours || 0) * (job.hourlyRate || 0);
  }

  const extraCharges = job.billing?.extraCharges || 0;
  const fuelCharges = job.billing?.fuelCharges || 0;
  const tollCharges = job.billing?.tollCharges || 0;
  const discount = job.billing?.discount || 0;

  const subtotal = laborCost + extraCharges + fuelCharges + tollCharges - discount;
  const gst = subtotal * 0.1; // 10% GST
  const totalAmount = subtotal + gst;

  return {
    laborCost: Math.round(laborCost * 100) / 100,
    extraCharges,
    fuelCharges,
    tollCharges,
    gst: Math.round(gst * 100) / 100,
    discount,
    totalAmount: Math.round(totalAmount * 100) / 100,
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

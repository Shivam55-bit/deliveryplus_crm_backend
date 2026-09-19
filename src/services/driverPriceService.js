const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const getCustomerJobTotal = (pricingSnapshot = {}, job = {}) => {
  const isCompleted = ['completed', 'finished'].includes(String(job.status || '').trim().toLowerCase());
  const snapshotTotal = isCompleted
    ? (pricingSnapshot.finalTotal ?? pricingSnapshot.grandTotal ?? pricingSnapshot.minimumEstimatedCost)
    : (pricingSnapshot.minimumEstimatedCost ?? pricingSnapshot.finalTotal ?? pricingSnapshot.grandTotal);
  const fallbackTotal = job.finalTotal ?? job.billing?.totalAmount ?? job.minimumEstimatedCost ?? job.fixedPrice ?? job.fixedQuote;
  const total = Number(snapshotTotal ?? fallbackTotal);
  return Number.isFinite(total) && total >= 0 ? roundCurrency(total) : 0;
};

export const resolveDriverPrice = (payload = {}, customerJobTotal = 0) => {
  const showDriverPrice = payload.showDriverPrice === true || payload.showDriverPrice === 'true' || payload.showDriverPrice === 1 || payload.showDriverPrice === '1';
  if (!showDriverPrice) {
    return {
      showDriverPrice: false,
      driverPriceType: null,
      driverPrice: null,
      driverPricePercentage: null,
    };
  }

  const driverPriceType = ['full', 'custom', 'percentage'].includes(String(payload.driverPriceType || '').trim().toLowerCase())
    ? String(payload.driverPriceType).trim().toLowerCase()
    : 'full';
  const customerTotal = Math.max(0, Number(customerJobTotal) || 0);

  if (driverPriceType === 'custom') {
    const customPrice = Number(payload.driverPrice);
    return {
      showDriverPrice: true,
      driverPriceType,
      driverPrice: Number.isFinite(customPrice) && customPrice >= 0 ? roundCurrency(customPrice) : null,
      driverPricePercentage: null,
    };
  }

  if (driverPriceType === 'percentage') {
    const percentage = Number(payload.driverPricePercentage);
    const driverPricePercentage = Number.isFinite(percentage) ? Math.min(100, Math.max(0, percentage)) : 0;
    return {
      showDriverPrice: true,
      driverPriceType,
      driverPricePercentage,
      driverPrice: roundCurrency(customerTotal * driverPricePercentage / 100),
    };
  }

  return {
    showDriverPrice: true,
    driverPriceType: 'full',
    driverPrice: roundCurrency(customerTotal),
    driverPricePercentage: null,
  };
};

import { format } from 'date-fns';
import { isSuperAdmin } from '../middleware/auth.js';

/**
 * Sanitizes a cell value to prevent CSV formula injection (OWASP CSV Injection).
 * If the string starts with =, +, -, @, \t, \r, it prepends a single quote.
 */
export const sanitizeCsvCell = (value) => {
  if (value === null || value === undefined) return '';
  let str = String(value);

  // Check for dangerous leading characters
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Quote if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
};

const formatCsvDate = (dateVal) => {
  if (!dateVal) return '';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    return format(d, 'yyyy-MM-dd');
  } catch {
    return '';
  }
};

const formatCsvDateTime = (dateVal) => {
  if (!dateVal) return '';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    return format(d, 'yyyy-MM-dd hh:mm a');
  } catch {
    return '';
  }
};

const formatWorkedMinutes = (mins) => {
  const safeMins = Math.max(0, Math.round(Number(mins) || 0));
  const hrs = Math.floor(safeMins / 60);
  const remMins = safeMins % 60;
  if (hrs === 0) return `${remMins} Min`;
  if (remMins === 0) return `${hrs} Hr`;
  return `${hrs} Hr ${remMins} Min`;
};

/**
 * Generates formatted CSV string from jobs dataset based on export mode and permissions.
 */
export const generateJobsCsv = ({
  jobs = [],
  filterParams = {},
  reqUser = null,
  exportMode = 'standard', // 'standard' | 'driver_sessions'
}) => {
  const userPerms = Array.isArray(reqUser?.permissions) ? reqUser.permissions : [];
  const canViewDriverPrice = isSuperAdmin(reqUser) || userPerms.includes('*') || userPerms.includes('all') || userPerms.includes('jobs.view_driver_price') || userPerms.includes('drivers.view_earnings');

  const rows = [];

  if (exportMode === 'driver_sessions') {
    // -------------------------------------------------------------
    // PER-DRIVER WORK SESSION TIMING EXPORT (1 row per driver session)
    // -------------------------------------------------------------
    const headers = [
      'Job Code',
      'Driver Name',
      'Driver Role',
      'Scheduled Date',
      'Scheduled Time',
      'Assigned At',
      'Actual Start Time',
      'Actual End Time',
      'Total Worked Minutes',
      'Total Worked Time',
      'Session Status',
      'Hourly Rate',
      'Overtime Minutes',
      'Overtime Amount',
      'Final Driver Amount',
      'Job Status',
      'Created By',
    ];

    rows.push(headers.map(sanitizeCsvCell).join(','));

    for (const job of jobs) {
      const jobCode = job.jobNumber || job.jobCode || String(job._id);
      const scheduledDate = formatCsvDate(job.scheduledDate);
      const scheduledTime = job.scheduledStartTime && job.scheduledEndTime
        ? `${job.scheduledStartTime} - ${job.scheduledEndTime}`
        : (job.scheduledTime || '');
      const jobStatus = job.status || '';
      const createdBy = job.createdByName || (job.createdByRole === 'super_admin' ? 'Super Admin' : (job.createdBy?.name || 'Admin'));

      const assignments = Array.isArray(job.driverAssignments) && job.driverAssignments.length > 0
        ? job.driverAssignments
        : (job.assignedDrivers || []).map((d, idx) => ({
            driverId: d,
            role: idx === 0 ? 'Lead Driver' : 'Driver',
            assignedAt: job.assignedAt || job.createdAt,
            startedAt: job.startedAt,
            completedAt: job.completedAt,
            totalWorkedMinutes: job.totalWorkedMinutes || 0,
            status: job.status === 'completed' ? 'completed' : (job.status === 'started' ? 'in_progress' : 'assigned'),
            isLegacy: true,
          }));

      // Filter by driver if driver filter active in params
      const targetDriverId = filterParams.driverId || filterParams.driver;
      const filteredAssignments = targetDriverId
        ? assignments.filter((a) => {
            const aId = String(a.driverId?._id || a.driverId || '');
            return aId === String(targetDriverId);
          })
        : assignments;

      for (const a of filteredAssignments) {
        const driverName = a.driverName || a.driverId?.name || (typeof a.driverId === 'string' ? 'Driver' : 'Driver');
        const driverRole = a.role || 'Driver';
        const assignedAt = formatCsvDateTime(a.assignedAt);
        const actualStart = formatCsvDateTime(a.startedAt);
        const actualEnd = formatCsvDateTime(a.completedAt);
        const workedMins = a.totalWorkedMinutes !== undefined && a.totalWorkedMinutes !== null ? Number(a.totalWorkedMinutes) : 0;
        const formattedDuration = formatWorkedMinutes(workedMins);
        const sessionStatus = a.status || (a.completedAt ? 'completed' : (a.startedAt ? 'in_progress' : 'assigned'));

        const ps = a.pricingSnapshot || null;
        const hourlyRate = canViewDriverPrice && ps?.hourlyRate !== undefined && ps?.hourlyRate !== null ? `$${Number(ps.hourlyRate).toFixed(2)}` : (canViewDriverPrice ? `$${Number(job.hourlyRate || 0).toFixed(2)}` : 'Masked');
        const otMins = ps?.overtimeMinutes ?? 0;
        const otAmt = canViewDriverPrice && ps?.overtimeAmount !== undefined && ps?.overtimeAmount !== null ? `$${Number(ps.overtimeAmount).toFixed(2)}` : (canViewDriverPrice ? '$0.00' : 'Masked');
        const finalDriverAmt = canViewDriverPrice && ps?.finalDriverAmount !== undefined && ps?.finalDriverAmount !== null
          ? `$${Number(ps.finalDriverAmount).toFixed(2)}`
          : (canViewDriverPrice && sessionStatus === 'completed' ? `$${Number(ps?.baseAmount || (job.hourlyRate * 2)).toFixed(2)}` : (canViewDriverPrice ? 'Pending' : 'Masked'));

        const row = [
          jobCode,
          driverName,
          driverRole,
          scheduledDate,
          scheduledTime,
          assignedAt,
          actualStart,
          actualEnd,
          workedMins,
          formattedDuration,
          sessionStatus,
          hourlyRate,
          otMins,
          otAmt,
          finalDriverAmt,
          jobStatus,
          createdBy,
        ];

        rows.push(row.map(sanitizeCsvCell).join(','));
      }
    }
  } else {
    // -------------------------------------------------------------
    // STANDARD JOB EXPORT (1 row per job)
    // -------------------------------------------------------------
    const headers = [
      'Job Code',
      'Job Type',
      'Customer Name',
      'Customer Phone',
      'Customer Email',
      'Pickup Address',
      'Drop-off Address',
      'Scheduled Date',
      'Scheduled Time',
      'Status',
      'Assigned Drivers',
      'Created By',
      'Pricing Type',
      'Customer Amount',
      'Completed At',
    ];

    rows.push(headers.map(sanitizeCsvCell).join(','));

    for (const job of jobs) {
      const jobCode = job.jobNumber || job.jobCode || String(job._id);
      const jobType = job.jobType || 'delivery';
      const customerName = job.customerName || '';
      const customerPhone = job.customerPhone || '';
      const customerEmail = job.customerEmail || '';
      const pickupAddress = job.pickupAddress || '';
      const dropAddress = job.dropAddress || job.dropoffAddress || '';
      const scheduledDate = formatCsvDate(job.scheduledDate);
      const scheduledTime = job.scheduledStartTime && job.scheduledEndTime
        ? `${job.scheduledStartTime} - ${job.scheduledEndTime}`
        : (job.scheduledTime || '');
      const status = job.status || '';

      const driverNames = Array.isArray(job.driverAssignments) && job.driverAssignments.length > 0
        ? job.driverAssignments.map((a) => a.driverName || a.driverId?.name || 'Driver').join(', ')
        : (job.assignedDrivers || []).map((d) => d.name || 'Driver').join(', ');

      const createdBy = job.createdByName || (job.createdByRole === 'super_admin' ? 'Super Admin' : (job.createdBy?.name || 'Admin'));
      const pricingType = job.pricingType || 'hourly';
      const customerAmount = Number(
        job.billing?.totalAmount ?? job.finalTotal ?? job.pricingSnapshot?.finalTotal ?? job.minimumEstimatedCost ?? job.fixedPrice ?? job.fixedQuote ?? 0
      );
      const formattedAmount = `$${customerAmount.toFixed(2)}`;
      const completedAt = formatCsvDateTime(job.completedAt);

      const row = [
        jobCode,
        jobType,
        customerName,
        customerPhone,
        customerEmail,
        pickupAddress,
        dropAddress,
        scheduledDate,
        scheduledTime,
        status,
        driverNames || 'Unassigned',
        createdBy,
        pricingType,
        formattedAmount,
        completedAt,
      ];

      rows.push(row.map(sanitizeCsvCell).join(','));
    }
  }

  // Include UTF-8 BOM for Excel compatibility
  return `\uFEFF${rows.join('\r\n')}`;
};

/**
 * Builds a descriptive filename for the exported CSV file.
 */
export const buildCsvExportFilename = (filterParams = {}, exportMode = 'standard') => {
  const parts = [];

  if (filterParams.status === 'completed') {
    parts.push('completed-jobs');
  } else if (filterParams.status) {
    parts.push(`${filterParams.status}-jobs`);
  } else {
    parts.push('jobs');
  }

  if (exportMode === 'driver_sessions') {
    parts.push('driver-work-sessions');
  }

  if (filterParams.driverName) {
    const cleanDriver = String(filterParams.driverName).toLowerCase().replace(/[^a-z0-9]/g, '-');
    parts.push(`driver-${cleanDriver}`);
  }

  const from = filterParams.dateFrom || filterParams.startDate;
  const to = filterParams.dateTo || filterParams.endDate;
  if (from && to) {
    parts.push(`${from}-to-${to}`);
  } else if (from) {
    parts.push(`from-${from}`);
  } else {
    parts.push(format(new Date(), 'yyyy-MM-dd'));
  }

  return `${parts.join('-')}.csv`;
};

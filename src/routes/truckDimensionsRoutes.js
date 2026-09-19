import express from 'express';
import {
  getAllTruckDimensions,
  getTruckDimension,
  createTruckDimension,
  updateTruckDimension,
  deleteTruckDimension,
  toggleTruckDimensionStatus,
  uploadTruckImage,
  DEFAULT_TRUCK_SPECS,
} from '../controllers/truckDimensionController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import TruckDimension from '../models/TruckDimension.js';

const router = express.Router();

// Upload Truck Image
router.post('/upload-image', authenticate, authorize('admin'), upload.single('image'), uploadTruckImage);

// REST API Endpoints
router.get('/api/fleet', getAllTruckDimensions);
router.get('/api/fleet/:idOrKey', getTruckDimension);
router.post('/api/fleet', authenticate, authorize('admin'), createTruckDimension);
router.put('/api/fleet/:id', authenticate, authorize('admin'), updateTruckDimension);
router.delete('/api/fleet/:id', authenticate, authorize('admin'), deleteTruckDimension);
router.patch('/api/fleet/:id/toggle', authenticate, authorize('admin'), toggleTruckDimensionStatus);

// Also direct API endpoints at root of this router if mounted under /api/truck-dimensions
router.get('/data', getAllTruckDimensions);
router.get('/data/:idOrKey', getTruckDimension);
router.post('/', authenticate, authorize('admin'), createTruckDimension);
router.put('/:id', authenticate, authorize('admin'), updateTruckDimension);
router.delete('/:id', authenticate, authorize('admin'), deleteTruckDimension);
router.patch('/:id/toggle', authenticate, authorize('admin'), toggleTruckDimensionStatus);

// Standalone Public HTML View
router.get(['/', '/index.php'], async (req, res, next) => {
  // If JSON requested, return json
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return getAllTruckDimensions(req, res, next);
  }

  try {
    let fleet = await TruckDimension.find({ isActive: true }).sort({ displayOrder: 1, tonnageNumber: 1 });
    if (!fleet || fleet.length === 0) {
      fleet = DEFAULT_TRUCK_SPECS;
    }

    const truckParam = String(req.query.truckSize || req.query.truck || req.query.size || '').toLowerCase();
    const jobNumber = req.query.jobNumber || req.query.bookingId || req.query.job || '';

    // Match matching spec
    let activeSpec = fleet.find((item) => {
      const k = String(item.truckKey || '').toLowerCase();
      const n = String(item.name || '').toLowerCase();
      const s = String(item.sizeInTon || '').toLowerCase();
      return (
        (truckParam && k.includes(truckParam)) ||
        (truckParam && n.includes(truckParam)) ||
        (truckParam && s.includes(truckParam))
      );
    });

    if (!activeSpec) {
      activeSpec = fleet[1] || fleet[0];
    }

    const tabsHtml = fleet
      .map((item) => {
        const isSelected = item.truckKey === activeSpec.truckKey;
        return `<a href="?truckSize=${encodeURIComponent(item.truckKey)}&jobNumber=${encodeURIComponent(jobNumber)}" class="tab-btn ${isSelected ? 'active' : ''}">🚚 ${escapeHtml(item.sizeInTon)}</a>`;
      })
      .join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Delivery Plus - ${escapeHtml(activeSpec.name)} Dimensions & Specifications</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #0D1B4C;
      --primary-dark: #071033;
      --cyan: #00B9E8;
      --cyan-glow: rgba(0, 185, 232, 0.25);
      --slate-bg: #0F172A;
      --card-bg: #FFFFFF;
      --border-color: #BAC9D6;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: linear-gradient(180deg, #F0F5FA 0%, #E2EDF8 100%);
      color: #1E293B;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    h1, h2, h3, .brand-font { font-family: 'Outfit', sans-serif; }
    .header {
      background: var(--primary);
      border-bottom: 3px solid var(--cyan);
      box-shadow: 0 8px 24px rgba(13, 27, 76, 0.25);
      padding: 16px 24px;
      position: sticky;
      top: 0;
      z-index: 50;
    }
    .header-inner {
      max-width: 1150px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }
    .logo-text {
      color: #ffffff;
      font-size: 22px;
      font-weight: 900;
      letter-spacing: .5px;
    }
    .logo-text span { color: var(--cyan); }
    .container {
      max-width: 1100px;
      margin: 28px auto;
      padding: 0 16px;
      flex: 1;
      width: 100%;
    }
    .tabs {
      display: flex;
      gap: 10px;
      overflow-x: auto;
      padding-bottom: 12px;
      margin-bottom: 24px;
      scrollbar-width: thin;
    }
    .tab-btn {
      padding: 10px 20px;
      border-radius: 30px;
      border: 1.5px solid #CBD5E1;
      background: #FFFFFF;
      color: #334155;
      font-weight: 700;
      font-size: 13.5px;
      text-decoration: none;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 2px 4px rgba(0,0,0,0.03);
    }
    .tab-btn:hover {
      border-color: var(--cyan);
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0, 185, 232, 0.15);
    }
    .tab-btn.active {
      border: 2px solid var(--cyan);
      background: var(--primary);
      color: #FFFFFF;
      box-shadow: 0 6px 20px rgba(13,27,76,0.3);
      transform: translateY(-1px);
    }
    .master-card {
      background: #FFFFFF;
      border-radius: 24px;
      border: 1.5px solid var(--border-color);
      box-shadow: 0 20px 48px rgba(16,29,79,0.1);
      overflow: hidden;
      display: grid;
      grid-template-columns: 1fr 1.15fr;
    }
    @media (max-width: 860px) {
      .master-card { grid-template-columns: 1fr; }
      .left-col { border-right: none !important; border-bottom: 1.5px solid #E2E8F0; }
    }
    .left-col {
      padding: 40px 32px;
      text-align: center;
      border-right: 1.5px solid #EEF4F8;
      background: radial-gradient(circle at center, #FFFFFF 0%, #F8FBFE 100%);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }
    .right-col {
      padding: 36px 36px;
      background: #FFFFFF;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .spec-table-card {
      background: #FFF7F7;
      border: 1.5px solid #FECACA;
      border-radius: 18px;
      padding: 24px 28px;
      box-shadow: 0 4px 16px rgba(239, 68, 68, 0.05);
    }
    table.spec-table {
      width: 100%;
      border-collapse: collapse;
    }
    table.spec-table td {
      padding: 13px 0;
      border-bottom: 1.5px solid #FEE2E2;
    }
    table.spec-table tr:last-child td {
      border-bottom: none;
    }
    .spec-label {
      color: #DC2626;
      font-weight: 800;
      font-size: 14.5px;
      width: 40%;
      vertical-align: top;
      letter-spacing: .2px;
    }
    .spec-val {
      color: #0F172A;
      font-weight: 700;
      font-size: 15px;
      line-height: 22px;
    }
    .spec-val strong { font-weight: 900; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 16px;
      background: #E0F2FE;
      border: 1px solid #7DD3FC;
      border-radius: 20px;
      color: #0369A1;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .5px;
      text-transform: uppercase;
      margin-bottom: 14px;
    }
    .btn-call {
      background: linear-gradient(135deg, #0D1B4C 0%, #1A3478 100%);
      color: #ffffff;
      padding: 14px 24px;
      border-radius: 12px;
      font-weight: 800;
      font-size: 14px;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 6px 16px rgba(13, 27, 76, 0.25);
      transition: all 0.2s;
    }
    .btn-call:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(13, 27, 76, 0.35); }
    .btn-site {
      background: #F1F6FA;
      border: 1.5px solid #BAC9D6;
      color: #0D1B4C;
      padding: 14px 24px;
      border-radius: 12px;
      font-weight: 800;
      font-size: 14px;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s;
    }
    .btn-site:hover { background: #E2EDF5; }
    .feature-tag {
      background: #EFF6FF;
      color: #1D4ED8;
      border: 1px solid #BFDBFE;
      padding: 4px 10px;
      border-radius: 8px;
      font-size: 11.5px;
      font-weight: 700;
    }
    footer {
      background: var(--primary-dark);
      color: #8FA9CC;
      padding: 24px 16px;
      text-align: center;
      font-size: 12.5px;
      margin-top: 48px;
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="header-inner">
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="logo-text">DELIVERY <span>PLUS</span></div>
        <div style="color:#BFD6EE;font-size:12px;font-weight:600;padding-left:12px;border-left:1px solid rgba(255,255,255,.2);">
          Fleet Dimensions &amp; Specifications
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;">
        ${jobNumber ? `<span style="background:rgba(0,185,232,0.15);border:1px solid var(--cyan);color:#38BDF8;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:800;">Ref: ${escapeHtml(jobNumber)}</span>` : ''}
        <a href="tel:0370085094" style="background:#0F766E;color:#ffffff;padding:7px 16px;border-radius:20px;font-size:13px;font-weight:800;text-decoration:none;box-shadow:0 4px 12px rgba(15,118,110,0.3);">
          📞 03 7008 5094
        </a>
      </div>
    </div>
  </header>

  <div class="container">
    <div class="tabs">
      ${tabsHtml}
    </div>

    <div class="master-card" style="position:relative;overflow:hidden;">
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:0;opacity:0.045;transform:rotate(-6deg);">
        <img src="/uploads/email-assets/delivery_plus_logo.png" alt="" style="width:550px;max-width:85%;filter:grayscale(100%);">
      </div>
      <div class="left-col" style="position:relative;z-index:1;">
        <div class="badge">⭐ ${escapeHtml(activeSpec.badge || 'Verified Fleet')}</div>
        <h1 style="font-size:24px;font-weight:900;color:var(--primary);margin-bottom:14px;line-height:30px;">
          ${escapeHtml(activeSpec.name)}
        </h1>
        
        <img src="${escapeHtml(activeSpec.imageUrl || '/uploads/email-assets/delivery_plus_truck_3d.jpg')}" alt="${escapeHtml(activeSpec.name)}"
          style="width:100%;max-width:440px;height:auto;border-radius:14px;display:block;margin:12px auto;filter:drop-shadow(0 12px 28px rgba(0,0,0,0.12));">

        <div style="margin-top:16px;display:flex;flex-wrap:wrap;gap:6px;justify-content:center;">
          ${(activeSpec.features || []).map((f) => `<span class="feature-tag">✔ ${escapeHtml(f)}</span>`).join('')}
        </div>
      </div>

      <div class="right-col">
        <div class="spec-table-card">
          <table class="spec-table">
            <tr>
              <td class="spec-label">Size in Ton</td>
              <td class="spec-val">: <strong>${escapeHtml(activeSpec.sizeInTon)}</strong></td>
            </tr>
            <tr>
              <td class="spec-label">Capacity</td>
              <td class="spec-val">: <strong>${escapeHtml(activeSpec.capacity)}</strong></td>
            </tr>
            <tr>
              <td class="spec-label">Dimensions</td>
              <td class="spec-val">: ${escapeHtml(activeSpec.dimensions)}</td>
            </tr>
            <tr>
              <td class="spec-label">Truck Height Clearance</td>
              <td class="spec-val">: ${escapeHtml(activeSpec.heightClearance)}</td>
            </tr>
            <tr>
              <td class="spec-label">Parking Clearance</td>
              <td class="spec-val">: ${escapeHtml(activeSpec.parkingClearance)}</td>
            </tr>
            <tr>
              <td class="spec-label">Tailgate Capacity</td>
              <td class="spec-val">: ${escapeHtml(activeSpec.tailgateCapacity)}</td>
            </tr>
            <tr>
              <td class="spec-label">Suitable For</td>
              <td class="spec-val">: ${escapeHtml(activeSpec.roomCapacity)}</td>
            </tr>
            ${activeSpec.boxCapacity ? `
            <tr>
              <td class="spec-label">Box &amp; Load Capacity</td>
              <td class="spec-val">: ${escapeHtml(activeSpec.boxCapacity)}</td>
            </tr>` : ''}
          </table>
        </div>

        <div style="margin-top:24px;display:flex;gap:12px;flex-wrap:wrap;">
          <a href="tel:0370085094" class="btn-call">📞 Speak to Move Specialist</a>
          <a href="https://deliveryplus.com.au" target="_blank" class="btn-site">🌐 deliveryplus.com.au</a>
        </div>
      </div>
    </div>

    <div style="margin-top:24px;background:#EBF7FD;border:1.5px solid #BAE6FD;border-radius:16px;padding:20px 24px;">
      <div style="color:#0369A1;font-size:14.5px;font-weight:800;margin-bottom:6px;display:flex;align-items:center;gap:6px;">
        <span>ℹ️</span> Important Access &amp; Parking Note for Moving Day:
      </div>
      <div style="color:#0C4A6E;font-size:13px;line-height:22px;font-weight:500;">
        Please ensure adequate overhead clearance (trees, carports, underground parking ramps) and reserve parking space on your street or driveway according to the dimensions above to ensure a smooth, on-time relocation.
      </div>
    </div>
  </div>

  <footer>
    <p style="margin: 0 0 6px 0; color: #ffffff; font-weight: 700;">Delivery Plus Pty Ltd • Trusted Transit at Affordable Prices</p>
    <p style="margin: 0;">© ${new Date().getFullYear()} Delivery Plus. All rights reserved.</p>
  </footer>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    next(err);
  }
});

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default router;

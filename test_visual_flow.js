import './src/config/index.js';
import { buildQuotationEmail } from './src/utils/emailTemplates.js';

const res = buildQuotationEmail({
  jobNumber: 'DP-2026-TEST',
  customerName: 'Shivam',
  customerPhone: '0424796524',
  customerEmail: 'shivam@example.com',
  jobType: 'moving',
  pickupAddress: '10 Flinders St, Melbourne VIC 3000',
  dropAddress: '20 Collins St, Melbourne VIC 3000',
  hourlyRate: 150,
  estimatedHours: 2.5,
  truckSize: '4.5 Tonne',
  movers: 2
});

const idxNeedHelp = res.html.indexOf('Need help with your quotation?');
const idxBannerImg = res.html.indexOf('alt="Delivery Plus moving truck"');
const idxThankYou = res.html.indexOf('THANK YOU FOR CHOOSING DELIVERY PLUS');
const idxSignoff = res.html.indexOf('Kind regards');
const idxFooter = res.html.indexOf('Australia · Removals &amp; Transit');

console.log('1. Need Help (pos):', idxNeedHelp);
console.log('2. Truck Banner Img (pos):', idxBannerImg);
console.log('3. Thank You (pos):', idxThankYou);
console.log('4. Signoff (pos):', idxSignoff);
console.log('5. Final Footer (pos):', idxFooter);

if (idxNeedHelp > 0 && idxNeedHelp < idxBannerImg && idxBannerImg < idxThankYou && idxThankYou < idxSignoff && idxSignoff < idxFooter) {
  console.log('✅ Visual Flow Order is 100% PERFECT!');
} else {
  console.log('❌ Order mismatch!');
  process.exit(1);
}

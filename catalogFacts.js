// Handset-only product data. Network plans and carrier comparisons are not used.
const { demoOperation } = require('./knowledge/demo-api');

let cached;
let cachedAt = 0;
let pending;
const CACHE_MS = 15_000;

async function getCatalog() {
  if (!cached || Date.now() - cachedAt > CACHE_MS) {
    if(!pending)pending=demoOperation('devices').then(value=>{cached=value;cachedAt=Date.now();return value;}).finally(()=>{pending=undefined;});
    await pending;
  }
  return cached;
}

function money(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

async function catalogSheet() {
  const { devices } = await getCatalog();
  return [
    'PHONE CATALOG FOR DEMONSTRATION ONLY. The handset names, prices, and customer data in the source JSON are illustrative mock data, not live T-Mobile inventory or quotes. Recommend handsets only. Do not discuss or compare wireless carriers, service plans, coverage, data allowances, or network pricing.',
    'All prices below are mock values. Do not describe them as verified T-Mobile prices, current offers, or guaranteed monthly payments. Direct customers to T-Mobile for current availability and quotes.',
    ...devices.map((device) => `- ${device.name}: mock retail price ${money(device.fullPrice)}; mock payment ${money(device.monthlyPayment24mo)}/month for 24 months; ${device.storageGb} GB storage; ${device.os}; category ${device.category}; features ${device.features.join(', ')}; possible customer fit ${device.fit.join(', ')}; tradeoffs ${device.tradeoffs.join(', ')}`),
  ].join('\n');
}

async function productFacts(text = '') {
  const lower = String(text).toLowerCase();
  const match = [...(await getCatalog()).devices].sort((a,b)=>b.name.length-a.name.length).find(device => lower.includes(device.name.toLowerCase()));
  return match ? `Customer mentioned ${match.name}; answer about that handset using the supplied catalog. This is illustrative mock data, not a live quote.` : '';
}

async function status() {
  const { devices } = await getCatalog();
  return { storage: 'demo-sqlite', count: devices.length, mockData: devices.every((d) => d.isMockData === true) };
}

function invalidate() { cached = undefined; cachedAt = 0; }
module.exports = { invalidate, getCatalog, catalogSheet, productFacts, status };

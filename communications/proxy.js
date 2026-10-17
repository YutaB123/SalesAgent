// One same-origin adapter for the existing Node site. Service credentials stay here.
const fs = require('node:fs');
const path = require('node:path');
const assets = {
  '/communications': ['demo.html', 'text/html; charset=utf-8'],
  '/communications/': ['demo.html', 'text/html; charset=utf-8'],
  '/communications/browser.js': ['browser.js', 'text/javascript; charset=utf-8'],
  '/communications/sdk.js': ['vendor/livekit-client.umd.min.js', 'text/javascript; charset=utf-8'],
};
const routes = new Set(['GET /state', 'GET /events', 'POST /seller-token', 'POST /dial', 'POST /hangup', 'POST /followup']);
const json = (res, status, body) => { res.writeHead(status, {'content-type':'application/json', 'cache-control':'no-store'}); res.end(JSON.stringify(body)); };
async function handleCommunications(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (!assets[url.pathname] && !url.pathname.startsWith('/api/comms/')) return false;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) {
    json(res, 403, {error:'Communications demo is available on this computer only.'}); return true;
  }
  if (assets[url.pathname] && req.method === 'GET') {
    const [file, type] = assets[url.pathname];
    res.writeHead(200, {'content-type':type, 'cache-control':'no-store'});
    res.end(fs.readFileSync(path.join(__dirname, file))); return true;
  }
  const route = url.pathname.replace('/api/comms', '');
  if (!routes.has(req.method + ' ' + route)) { json(res, 404, {error:'Unknown communications route'}); return true; }
  if (req.method === 'POST' && req.headers['x-comms-action'] !== '1') { json(res, 403, {error:'Missing action header'}); return true; }
  const secret = process.env.COMMUNICATIONS_SERVICE_TOKEN;
  if (!secret) { json(res, 503, {error:'Set COMMUNICATIONS_SERVICE_TOKEN and start communications/service.py'}); return true; }
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 16384) { json(res, 413, {error:'Request too large'}); return true; }
  }
  const port = Number(process.env.COMMUNICATIONS_PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) { json(res, 503, {error:'Invalid communications port'}); return true; }
  try {
    const response = await fetch(`http://127.0.0.1:${port}${route}${url.search}`, {
      method:req.method, headers:{'Authorization':'Bearer '+secret, 'Content-Type':'application/json'},
      body:req.method === 'POST' ? raw || '{}' : undefined, signal:AbortSignal.timeout(25000),
    });
    const body = await response.json(); json(res, response.status, body);
  } catch { json(res, 502, {error:'Communications service unavailable. Start it locally and check its status.'}); }
  return true;
}
module.exports = {handleCommunications};

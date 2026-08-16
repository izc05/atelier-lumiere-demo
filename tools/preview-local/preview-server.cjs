const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const HOST = '127.0.0.1';
const PORT = Number(process.env.ATELIER_PREVIEW_PORT || 4177);
const ROOT = path.resolve(__dirname, 'site');
const VILLAGE_STATE_FILE = path.resolve(__dirname, 'preview-village-zones.json');

const providers = [
  {
    slug: 'izc',
    displayName: 'IZC',
    locationLabel: 'Jaén · España',
    specialty: 'Abanicos y piezas para celebrar',
    tagline: 'Piezas con gesto, color y oficio para momentos que merecen quedarse.',
    craftDescription: 'Diseño artesanal de abanicos y detalles para celebraciones.',
    acceptsCustomRequests: true,
    publishedProductCount: 3,
    materials: ['Madera', 'Textil'],
    logo: { path: '/api/preview/izc-logo', altText: 'IZC', width: 640, height: 420 },
    cover: { path: '/api/preview/izc-workshop', altText: 'Taller IZC', width: 1400, height: 980, focalX: 54, focalY: 46 },
    gallery: []
  },
  {
    slug: 'the-gentle-stitch',
    displayName: 'The Gentle Stitch',
    locationLabel: 'Granada · España',
    specialty: 'Bordado y textil',
    tagline: 'Bordados delicados y piezas textiles creadas despacio, puntada a puntada.',
    craftDescription: 'Pequeñas series textiles y encargos personalizados.',
    acceptsCustomRequests: true,
    publishedProductCount: 3,
    materials: ['Algodón', 'Hilo'],
    logo: { path: '/api/preview/stitch-logo', altText: 'The Gentle Stitch', width: 640, height: 420 },
    cover: { path: '/api/preview/stitch-workshop', altText: 'Estudio textil The Gentle Stitch', width: 1400, height: 980, focalX: 48, focalY: 52 },
    gallery: []
  }
];

const productSeed = [
  ['abanico-buganvilla','Abanico Buganvilla','Abanicos',5900,'boda','izc','izc-product-1'],
  ['abanico-marfil','Abanico Marfil','Abanicos',6200,'comunion','izc','izc-product-2'],
  ['detalle-rosa','Detalle Rosa Atelier','Detalles',3800,'aniversario','izc','izc-product-3'],
  ['bastidor-iniciales','Bastidor Iniciales','Bordado',4900,'boda','the-gentle-stitch','stitch-product-1'],
  ['panuelito-recuerdo','Pañuelito Recuerdo','Textil',4200,'comunion','the-gentle-stitch','stitch-product-2'],
  ['bordado-nacimiento','Bordado Nacimiento','Bordado',5400,'nacimiento','the-gentle-stitch','stitch-product-3']
];

const providerBySlug = new Map(providers.map((item) => [item.slug, item]));
const products = productSeed.map(([slug,name,category,priceCents,event,providerSlug,image], index) => ({
  slug,
  name,
  category,
  priceCents,
  currency: 'EUR',
  shortDescription: index % 2 === 0 ? 'Una pieza artesanal pensada para acompañar celebraciones especiales.' : 'Hecha en pequeña serie y revisada por Atelier Lumière.',
  events: [event],
  provider: providerBySlug.get(providerSlug),
  cover: { path: `/api/preview/${image}`, altText: name, width: 1200, height: 1500, focalX: 50, focalY: 48 }
}));

const villageZoneMeta = Array.from({ length: 26 }, (_, index) => {
  const number = index + 1;
  return {
    zoneKey: `ZONE_${String(number).padStart(2, '0')}`,
    label: number === 1 ? 'Zona 01 · Pabellón oeste' : number === 2 ? 'Zona 02 · Estudio este' : `Zona ${String(number).padStart(2, '0')} · Casa / taller`,
    family: number <= 2 ? 'SIGNATURE' : 'HOUSE'
  };
});
const villageZoneMetaByKey = new Map(villageZoneMeta.map((item) => [item.zoneKey, item]));

function loadVillageState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(VILLAGE_STATE_FILE, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map();
    return new Map(Object.entries(parsed).filter(([key]) => villageZoneMetaByKey.has(key)));
  } catch {
    return new Map();
  }
}

let villageState = loadVillageState();

function saveVillageState() {
  const value = Object.fromEntries(villageState.entries());
  fs.writeFileSync(VILLAGE_STATE_FILE, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function serializePreviewZone(meta, value = null) {
  return {
    zoneKey: meta.zoneKey,
    label: meta.label,
    family: meta.family,
    workshopType: value?.workshopType || '',
    displayLabel: value?.displayLabel || '',
    providerSlug: value?.providerSlug || null,
    status: value?.status || 'RESERVED',
    configured: Boolean(value),
    updatedAt: value?.updatedAt || null
  };
}

function json(res, value, status = 200) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function previewSvg(label, variant = 0, landscape = false) {
  const palettes = [
    ['#f5eadf','#4f1020','#b38a52'],
    ['#eee3d3','#6e3140','#9b8067'],
    ['#f7f1e9','#3d2b2f','#c7a876'],
    ['#eadfd4','#551425','#b99f82']
  ];
  const [paper,wine,gold] = palettes[variant % palettes.length];
  const width = landscape ? 1400 : 1000;
  const height = landscape ? 900 : 1250;
  const escaped = String(label).replace(/[&<>\"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <radialGradient id="g" cx="30%" cy="18%" r="90%"><stop offset="0" stop-color="#fff" stop-opacity=".86"/><stop offset="1" stop-color="${paper}"/></radialGradient>
      <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="7" result="n"/><feColorMatrix in="n" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .035 0"/></filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <path d="M${width*.08} ${height*.72} C${width*.28} ${height*.52},${width*.42} ${height*.82},${width*.62} ${height*.58} S${width*.88} ${height*.46},${width*.98} ${height*.68}" fill="none" stroke="${gold}" stroke-width="${Math.max(6,width*.006)}" opacity=".42"/>
    <circle cx="${width*.77}" cy="${height*.27}" r="${Math.min(width,height)*.17}" fill="${wine}" opacity=".08"/>
    <rect x="${width*.09}" y="${height*.12}" width="${width*.82}" height="${height*.76}" rx="${width*.012}" fill="none" stroke="${wine}" stroke-opacity=".13" stroke-width="2"/>
    <text x="${width*.12}" y="${height*.76}" fill="${wine}" font-family="Georgia,serif" font-size="${Math.max(34,width*.045)}">${escaped}</text>
    <text x="${width*.12}" y="${height*.81}" fill="${gold}" font-family="Arial,sans-serif" font-size="${Math.max(16,width*.018)}" letter-spacing="5">ATELIER LUMIÈRE · PREVIEW</text>
    <rect width="100%" height="100%" filter="url(#grain)" opacity=".35"/>
  </svg>`;
}

function sendPreviewImage(reqPath, res) {
  const key = decodeURIComponent(reqPath.split('/').pop() || 'atelier');
  const landscape = key.includes('workshop') || key.includes('logo');
  const variant = [...key].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4;
  const labels = {
    'izc-logo': 'IZC',
    'stitch-logo': 'THE GENTLE STITCH',
    'izc-workshop': 'Taller IZC',
    'stitch-workshop': 'The Gentle Stitch'
  };
  const svg = Buffer.from(previewSvg(labels[key] || key.replaceAll('-', ' '), variant, landscape));
  res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Content-Length': svg.length, 'Cache-Control': 'no-store' });
  res.end(svg);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32 * 1024) throw new Error('BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function cleanPreviewText(value, maximum) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maximum);
}

async function handleVillageMock(req, url, res) {
  if (url.pathname === '/internal/admin/session') {
    json(res, { authenticated: true, account: { role: 'PLATFORM_OWNER', displayName: 'Preview local' } });
    return true;
  }

  if (url.pathname === '/internal/village-zones' && req.method === 'GET') {
    json(res, { zones: [...villageState.entries()].map(([key, value]) => serializePreviewZone(villageZoneMetaByKey.get(key), value)) });
    return true;
  }

  if (url.pathname === '/internal/admin/village-zones' && req.method === 'GET') {
    json(res, { zones: villageZoneMeta.map((meta) => serializePreviewZone(meta, villageState.get(meta.zoneKey))) });
    return true;
  }

  const match = url.pathname.match(/^\/internal\/admin\/village-zones\/(ZONE_\d{2})$/);
  if (!match) return false;
  const zoneKey = match[1];
  const meta = villageZoneMetaByKey.get(zoneKey);
  if (!meta) {
    json(res, { error: 'VILLAGE_ZONE_INVALID', message: 'La zona no existe en esta preview.' }, 422);
    return true;
  }

  if (req.method === 'DELETE') {
    const reset = villageState.delete(zoneKey);
    saveVillageState();
    json(res, { zoneKey, reset });
    return true;
  }

  if (req.method !== 'PATCH') {
    json(res, { error: 'METHOD_NOT_ALLOWED', message: 'Método no permitido.' }, 405);
    return true;
  }

  try {
    const body = await readJsonBody(req);
    const providerSlug = body.providerSlug ? String(body.providerSlug).trim().toLowerCase() : null;
    if (providerSlug && !providerBySlug.has(providerSlug)) {
      json(res, { error: 'VALIDATION_ERROR', message: 'El taller seleccionado no existe en la preview.' }, 422);
      return true;
    }
    if (providerSlug) {
      const duplicate = [...villageState.entries()].find(([key, value]) => key !== zoneKey && value.providerSlug === providerSlug);
      if (duplicate) {
        json(res, { error: 'VILLAGE_PROVIDER_ALREADY_ASSIGNED', message: 'Ese taller ya está asociado a otra zona.' }, 409);
        return true;
      }
    }
    const status = ['ACTIVE','RESERVED','HIDDEN'].includes(body.status) ? body.status : 'RESERVED';
    const value = {
      workshopType: cleanPreviewText(body.workshopType, 80),
      displayLabel: cleanPreviewText(body.displayLabel, 120),
      providerSlug,
      status,
      updatedAt: new Date().toISOString()
    };
    villageState.set(zoneKey, value);
    saveVillageState();
    json(res, { zone: serializePreviewZone(meta, value) });
  } catch {
    json(res, { error: 'INVALID_JSON', message: 'No se pudo guardar la configuración local.' }, 400);
  }
  return true;
}

async function handleMock(req, url, res) {
  if (await handleVillageMock(req, url, res)) return true;
  if (url.pathname === '/internal/catalog/providers') {
    json(res, { providers });
    return true;
  }
  if (url.pathname === '/internal/catalog/products') {
    const q = (url.searchParams.get('q') || '').toLocaleLowerCase('es');
    const category = url.searchParams.get('category') || '';
    const event = url.searchParams.get('event') || '';
    const filtered = products.filter((item) => {
      const text = `${item.name} ${item.category} ${item.provider.displayName}`.toLocaleLowerCase('es');
      return (!q || text.includes(q)) && (!category || item.category === category) && (!event || item.events.includes(event));
    });
    json(res, { products: filtered });
    return true;
  }
  if (url.pathname.startsWith('/internal/preview/') || url.pathname.startsWith('/api/preview/')) {
    sendPreviewImage(url.pathname, res);
    return true;
  }
  if (url.pathname.includes('/catalog/posts') || url.pathname.includes('/catalog/stories') || url.pathname.includes('/blog/posts')) {
    json(res, { posts: [], stories: [] });
    return true;
  }
  return false;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

function safeFilePath(pathname) {
  const clean = decodeURIComponent(pathname).replace(/\\/g, '/');
  const relative = path.posix.normalize(clean).replace(/^\/+/, '');
  if (relative.startsWith('..')) return null;
  return path.join(ROOT, relative);
}

function serveStatic(url, res) {
  let file = safeFilePath(url.pathname);
  if (!file) return json(res, { message: 'Ruta no válida' }, 400);
  try {
    const stat = fs.existsSync(file) ? fs.statSync(file) : null;
    if (stat?.isDirectory()) file = path.join(file, 'index.html');
    if (!stat && !path.extname(file)) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No encontrado en la preview local');
      return;
    }
    const data = fs.readFileSync(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-store'
    });
    res.end(data);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Error de preview: ${error.message}`);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
    if (await handleMock(req, url, res)) return;
    serveStatic(url, res);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Error de preview: ${error.message}`);
  }
});

server.listen(PORT, HOST, () => {
  const startUrl = `http://${HOST}:${PORT}/?intro=1`;
  const adminUrl = `http://${HOST}:${PORT}/admin/pueblo/`;
  console.log('');
  console.log('============================================================');
  console.log(' ATELIER LUMIÈRE · EXPERIENCIA UNIFICADA · PREVIEW LOCAL');
  console.log('============================================================');
  console.log(' Entrada cinematográfica → Pueblo WebGL → Visual V2');
  console.log(' Candidato de diseño · no producción');
  console.log(` Abierto en: ${startUrl}`);
  console.log(` Configurar Pueblo: ${adminUrl}`);
  console.log(' Las zonas editadas en la preview se guardan solo en este ZIP.');
  console.log(' Pulsa Ctrl+C para cerrar la preview.');
  console.log('');
  if (process.platform === 'win32') exec(`start "" "${startUrl}"`);
});

server.on('error', (error) => {
  console.error(`No se pudo iniciar la preview: ${error.message}`);
  process.exitCode = 1;
});

const { app } = require('@azure/functions');
const { MongoClient } = require('mongodb');
const crypto = require('crypto');

let client;
let database;

const json = (body, status = 200) => ({ status, jsonBody: body, headers: { 'Cache-Control': 'no-store' } });

function principal(req) {
  try {
    const raw = req.headers.get('x-ms-client-principal');
    if (!raw) return null;
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch { return null; }
}

function isAdmin(req) {
  return principal(req)?.userRoles?.includes('admin') === true;
}

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

async function db() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  if (!client) {
    client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    await client.connect();
  }
  if (!database) database = client.db(process.env.MONGODB_DB || 'sarahcraftstudio');
  return database;
}

function parseConnectionString(value) {
  const parts = Object.fromEntries(String(value || '').split(';').filter(Boolean).map(part => {
    const i = part.indexOf('=');
    return i > 0 ? [part.slice(0, i), part.slice(i + 1)] : [part, ''];
  }));
  if (!parts.AccountName || !parts.AccountKey) throw new Error('Storage connection string is missing AccountName or AccountKey');
  const blobEndpoint = parts.BlobEndpoint || `${parts.DefaultEndpointsProtocol || 'https'}://${parts.AccountName}.blob.${parts.EndpointSuffix || 'core.windows.net'}`;
  return { accountName: parts.AccountName, accountKey: parts.AccountKey, blobEndpoint: blobEndpoint.replace(/\/$/, '') };
}

function sharedKeyAuthorization({ accountName, accountKey, method, contentLength, contentType, containerName, blobName, date, version }) {
  const canonicalHeaders = [
    'x-ms-blob-cache-control:public, max-age=31536000, immutable',
    'x-ms-blob-type:BlockBlob',
    `x-ms-date:${date}`,
    `x-ms-version:${version}`
  ].join('\n') + '\n';
  const canonicalResource = `/${accountName}/${containerName}/${blobName}`;
  const stringToSign = [method, '', '', String(contentLength), '', contentType, '', '', '', '', '', '', canonicalHeaders + canonicalResource].join('\n');
  const signature = crypto.createHmac('sha256', Buffer.from(accountKey, 'base64')).update(stringToSign, 'utf8').digest('base64');
  return `SharedKey ${accountName}:${signature}`;
}

function extensionFor(contentType, sourceUrl) {
  const t = String(contentType || '').toLowerCase();
  if (t.includes('png')) return '.png';
  if (t.includes('webp')) return '.webp';
  if (t.includes('jpeg') || t.includes('jpg')) return '.jpg';
  const pathname = new URL(sourceUrl).pathname.toLowerCase();
  if (pathname.endsWith('.png')) return '.png';
  if (pathname.endsWith('.webp')) return '.webp';
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return '.jpg';
  return '.jpg';
}

function validateSourceUrl(value) {
  const url = new URL(clean(value, 3000));
  if (url.protocol !== 'https:' || url.hostname !== 'cdn.zyrosite.com') throw new Error('Only cdn.zyrosite.com migration images are allowed');
  return url.toString();
}

async function downloadImage(primary, fallback) {
  const candidates = [primary, fallback].filter(Boolean);
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const source = validateSourceUrl(candidate);
      const r = await fetch(source, { headers: { 'User-Agent': 'SarahCraftStudioMigration/1.0' } });
      if (!r.ok) throw new Error(`Source image returned HTTP ${r.status}`);
      const contentType = clean(r.headers.get('content-type') || 'image/jpeg', 100).split(';')[0].toLowerCase();
      if (!contentType.startsWith('image/')) throw new Error(`Source returned ${contentType} instead of an image`);
      const bytes = Buffer.from(await r.arrayBuffer());
      if (!bytes.length) throw new Error('Source image was empty');
      if (bytes.length > 15 * 1024 * 1024) throw new Error('Source image is larger than 15 MB');
      return { bytes, contentType, source };
    } catch (e) { lastError = e; }
  }
  throw lastError || new Error('Could not download source image');
}

async function uploadBlob(slug, image) {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = clean(process.env.AZURE_STORAGE_CONTAINER || 'site-assets', 100);
  if (!connectionString) throw new Error('AZURE_STORAGE_CONNECTION_STRING is not configured');
  const { accountName, accountKey, blobEndpoint } = parseConnectionString(connectionString);
  const ext = extensionFor(image.contentType, image.source);
  const blobName = `images/products/${clean(slug, 150).replace(/[^a-zA-Z0-9._-]/g, '-')}${ext}`;
  const encodedBlobName = blobName.split('/').map(encodeURIComponent).join('/');
  const uploadUrl = `${blobEndpoint}/${encodeURIComponent(containerName)}/${encodedBlobName}`;
  const date = new Date().toUTCString();
  const version = '2023-11-03';
  const authorization = sharedKeyAuthorization({ accountName, accountKey, method: 'PUT', contentLength: image.bytes.length, contentType: image.contentType, containerName, blobName, date, version });

  const upload = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: authorization,
      'x-ms-date': date,
      'x-ms-version': version,
      'x-ms-blob-type': 'BlockBlob',
      'x-ms-blob-cache-control': 'public, max-age=31536000, immutable',
      'Content-Type': image.contentType,
      'Content-Length': String(image.bytes.length)
    },
    body: image.bytes
  });
  if (!upload.ok) {
    const code = upload.headers.get('x-ms-error-code') || 'Unknown';
    throw new Error(`Azure Blob upload failed (${upload.status}: ${code})`);
  }
  return `${blobEndpoint}/${encodeURIComponent(containerName)}/${encodedBlobName}`;
}

app.http('adminHostingerCatalogMigration', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'manage/hostinger-catalog-migration',
  handler: async req => {
    if (!isAdmin(req)) return json({ message: 'Forbidden' }, 403);
    try {
      const input = await req.json();
      const id = clean(input.id || input.slug, 150);
      const slug = clean(input.slug || id, 150);
      const name = clean(input.name, 300);
      if (!id || !slug || !name) return json({ message: 'id, slug and name are required' }, 400);

      const image = await downloadImage(input.sourceOriginalImage, input.sourceImage);
      const azureImageUrl = await uploadBlob(slug, image);
      const d = await db();
      const existing = await d.collection('products').findOne({ id });
      const now = new Date();
      const price = Number(input.price || 0);
      const regularPrice = Number(input.regularPrice || price);
      const product = {
        id,
        slug,
        name,
        category: clean(input.category, 100),
        collections: Array.isArray(input.collections) ? input.collections.map(x => clean(x, 100)).filter(Boolean) : [],
        price: Number.isFinite(price) && price >= 0 ? price : 0,
        regularPrice: Number.isFinite(regularPrice) && regularPrice >= 0 ? regularPrice : price,
        currency: 'CAD',
        description: clean(input.description, 5000),
        image: azureImageUrl,
        images: [azureImageUrl],
        personalizable: Boolean(input.personalizable),
        stock: 0,
        stockTracked: false,
        inStock: input.inStock !== false,
        active: input.active !== false,
        featured: Boolean(input.featured),
        source: {
          platform: 'Hostinger Website Builder',
          productUrl: clean(input.sourceProductUrl, 3000),
          originalImageUrl: image.source,
          listingImageUrl: clean(input.sourceImage, 3000),
          pricingText: clean(input.pricingText, 300),
          migratedAt: now
        },
        createdAt: existing?.createdAt || now,
        updatedAt: now
      };
      await d.collection('products').updateOne({ id }, { $set: product }, { upsert: true });
      return json({ success: true, product: { id, name, image: azureImageUrl, active: product.active }, created: !existing });
    } catch (e) {
      console.error('Hostinger catalogue migration failed', e?.message || e);
      return json({ message: e?.message || 'Migration failed' }, 500);
    }
  }
});

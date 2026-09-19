const { app } = require('@azure/functions');
const crypto = require('crypto');

const json = (body, status = 200) => ({
  status,
  jsonBody: body,
  headers: { 'Cache-Control': 'no-store' }
});

function principal(req) {
  try {
    const raw = req.headers.get('x-ms-client-principal');
    if (!raw) return null;
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function isAdmin(req) {
  return principal(req)?.userRoles?.includes('admin') === true;
}

function clean(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function safeName(value) {
  return clean(value || 'product-image', 120)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '') || 'product-image';
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
    `x-ms-blob-cache-control:public, max-age=31536000, immutable`,
    'x-ms-blob-type:BlockBlob',
    `x-ms-date:${date}`,
    `x-ms-version:${version}`
  ].join('\n') + '\n';
  const canonicalResource = `/${accountName}/${containerName}/${blobName}`;
  const stringToSign = [
    method,
    '',
    '',
    String(contentLength),
    '',
    contentType,
    '',
    '',
    '',
    '',
    '',
    '',
    canonicalHeaders + canonicalResource
  ].join('\n');
  const signature = crypto.createHmac('sha256', Buffer.from(accountKey, 'base64')).update(stringToSign, 'utf8').digest('base64');
  return `SharedKey ${accountName}:${signature}`;
}

function isWebP(bytes) {
  return bytes.length >= 16 && bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP' &&
    ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16));
}

app.http('adminProductImageUpload', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'manage/product-image',
  handler: async req => {
    if (!isAdmin(req)) return json({ message: 'Forbidden' }, 403);

    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = clean(process.env.AZURE_STORAGE_CONTAINER || 'site-assets', 100);
    if (!connectionString) return json({ message: 'AZURE_STORAGE_CONNECTION_STRING is not configured' }, 500);

    try {
      const body = await req.json();
      const contentType = clean(body.contentType, 100).toLowerCase();
      if (contentType !== 'image/webp') return json({ message: 'Only optimized WebP images are allowed.' }, 400);

      const data = body.data;
      if (typeof data !== 'string' || !data || data.length > 12_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
        return json({ message: 'Image data is invalid or too large.' }, 400);
      }

      const bytes = Buffer.from(data, 'base64');
      if (bytes.length > 8 * 1024 * 1024) return json({ message: 'Image must be 8 MB or smaller.' }, 400);
      if (!isWebP(bytes)) return json({ message: 'The uploaded file is not a WebP image.' }, 400);

      const requestedName = safeName(body.fileName || body.productSlug || 'product-image');
      const withoutExtension = requestedName.replace(/\.(jpg|jpeg|png|webp)$/i, '');
      const blobName = `images/products/${withoutExtension}-${crypto.randomUUID()}.webp`;
      const { accountName, accountKey, blobEndpoint } = parseConnectionString(connectionString);
      const encodedBlobName = blobName.split('/').map(encodeURIComponent).join('/');
      const uploadUrl = `${blobEndpoint}/${encodeURIComponent(containerName)}/${encodedBlobName}`;
      const date = new Date().toUTCString();
      const version = '2023-11-03';
      const authorization = sharedKeyAuthorization({
        accountName,
        accountKey,
        method: 'PUT',
        contentLength: bytes.length,
        contentType,
        containerName,
        blobName,
        date,
        version
      });

      const upload = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          Authorization: authorization,
          'x-ms-date': date,
          'x-ms-version': version,
          'x-ms-blob-type': 'BlockBlob',
          'x-ms-blob-cache-control': 'public, max-age=31536000, immutable',
          'Content-Type': contentType,
          'Content-Length': String(bytes.length)
        },
        body: bytes
      });

      if (!upload.ok) {
        const detail = (await upload.text()).slice(0, 1000);
        const errorCode = upload.headers.get('x-ms-error-code') || 'Unknown';
        const requestId = upload.headers.get('x-ms-request-id') || '';
        console.error('Blob upload failed', upload.status, errorCode, requestId, detail);
        return json({
          message: `Azure Blob upload failed (${upload.status}: ${errorCode}).`,
          storageErrorCode: errorCode,
          requestId
        }, 502);
      }

      return json({
        success: true,
        blobName,
        url: `${blobEndpoint}/${encodeURIComponent(containerName)}/${encodedBlobName}`
      }, 201);
    } catch (e) {
      console.error('Product image upload failed', e?.message || e);
      return json({ message: e?.message || 'Image upload failed.' }, 500);
    }
  }
});

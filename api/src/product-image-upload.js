const { app } = require('@azure/functions');

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

const allowedTypes = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp']
]);

app.http('adminProductImageUpload', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'manage/product-image',
  handler: async req => {
    if (!isAdmin(req)) return json({ message: 'Forbidden' }, 403);

    const sasUrl = process.env.BLOB_CONTAINER_SAS_URL;
    if (!sasUrl) return json({ message: 'BLOB_CONTAINER_SAS_URL is not configured' }, 500);

    try {
      const body = await req.json();
      const contentType = clean(body.contentType, 100).toLowerCase();
      const extension = allowedTypes.get(contentType);
      if (!extension) return json({ message: 'Only JPG, PNG and WEBP images are allowed.' }, 400);

      const data = clean(body.data, 12_000_000);
      if (!data) return json({ message: 'Image data is required.' }, 400);

      const bytes = Buffer.from(data, 'base64');
      if (!bytes.length) return json({ message: 'Image data is invalid.' }, 400);
      if (bytes.length > 8 * 1024 * 1024) return json({ message: 'Image must be 8 MB or smaller.' }, 400);

      const requestedName = safeName(body.fileName || body.productSlug || 'product-image');
      const withoutExtension = requestedName.replace(/\.(jpg|jpeg|png|webp)$/i, '');
      const blobName = `images/products/${withoutExtension}-${Date.now()}${extension}`;

      const q = sasUrl.indexOf('?');
      const containerUrl = (q >= 0 ? sasUrl.slice(0, q) : sasUrl).replace(/\/$/, '');
      const sas = q >= 0 ? sasUrl.slice(q) : '';
      const encodedBlobName = blobName.split('/').map(encodeURIComponent).join('/');
      const uploadUrl = `${containerUrl}/${encodedBlobName}${sas}`;

      const upload = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'x-ms-blob-type': 'BlockBlob',
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable'
        },
        body: bytes
      });

      if (!upload.ok) {
        const detail = (await upload.text()).slice(0, 1000);
        console.error('Blob upload failed', upload.status, detail);
        return json({ message: `Azure Blob upload failed (${upload.status}).` }, 502);
      }

      return json({
        success: true,
        blobName,
        url: `${containerUrl}/${encodedBlobName}`
      }, 201);
    } catch (e) {
      console.error('Product image upload failed', e);
      return json({ message: e.message || 'Image upload failed.' }, 500);
    }
  }
});

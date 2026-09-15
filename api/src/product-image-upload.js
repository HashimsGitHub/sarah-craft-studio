const { app } = require('@azure/functions');
const { BlobServiceClient } = require('@azure/storage-blob');

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

    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = clean(process.env.AZURE_STORAGE_CONTAINER || 'site-assets', 100);
    if (!connectionString) return json({ message: 'AZURE_STORAGE_CONNECTION_STRING is not configured' }, 500);

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

      const service = BlobServiceClient.fromConnectionString(connectionString);
      const container = service.getContainerClient(containerName);
      const blob = container.getBlockBlobClient(blobName);

      await blob.uploadData(bytes, {
        blobHTTPHeaders: {
          blobContentType: contentType,
          blobCacheControl: 'public, max-age=31536000, immutable'
        }
      });

      return json({
        success: true,
        blobName,
        url: blob.url
      }, 201);
    } catch (e) {
      console.error('Product image upload failed', e?.statusCode || '', e?.code || '', e?.message || e);
      const code = clean(e?.code, 100);
      const status = Number(e?.statusCode) || 500;
      return json({
        message: code ? `Azure Blob upload failed (${status}: ${code}).` : (e?.message || 'Image upload failed.'),
        storageErrorCode: code || undefined
      }, status >= 400 && status < 600 ? status : 500);
    }
  }
});

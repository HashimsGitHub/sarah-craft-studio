const { app } = require('@azure/functions');
const { MongoClient, ObjectId } = require('mongodb');

let client;
let database;

async function db() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  if (!client) {
    client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    await client.connect();
  }
  if (!database) database = client.db(process.env.MONGODB_DB || 'sarahcraftstudio');
  return database;
}

const json = (body, status = 200) => ({ status, jsonBody: body, headers: { 'Cache-Control': 'no-store' } });
const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const email = value => clean(value, 320).toLowerCase();
const validEmail = value => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

async function body(req) { try { return await req.json(); } catch { return {}; } }

function principal(req) {
  try {
    const raw = req.headers.get('x-ms-client-principal');
    return raw ? JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) : null;
  } catch { return null; }
}
function requireAdmin(req) {
  if (!principal(req)?.userRoles?.includes('admin')) return json({ message: 'Forbidden' }, 403);
  return null;
}

function reviewerName(input = {}) {
  const mode = ['full', 'initials', 'anonymous'].includes(input.nameMode) ? input.nameMode : 'anonymous';
  const fullName = clean(input.fullName, 120);
  if (mode === 'anonymous') return { nameMode: mode, displayName: 'Anonymous', fullName: '' };
  if (!fullName) throw new Error(mode === 'initials' ? 'Enter a name so initials can be generated.' : 'Full name is required for this display option.');
  if (mode === 'full') return { nameMode: mode, displayName: fullName, fullName };
  const initials = fullName.split(/\s+/).filter(Boolean).slice(0, 3).map(x => x[0]?.toUpperCase()).filter(Boolean).join('.');
  return { nameMode: mode, displayName: initials ? initials + '.' : 'Anonymous', fullName };
}

async function cleanReview(d, input, existing = {}, admin = false) {
  const productId = clean(input.productId ?? existing.productId, 120);
  const product = productId ? await d.collection('products').findOne({ id: productId }) : null;
  if (!product) throw new Error('Select a valid product.');

  const rating = Number(input.rating ?? existing.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Rating must be between 1 and 5 stars.');

  const reviewText = clean(input.reviewText ?? existing.reviewText, 1200);
  if (reviewText.length < 3) throw new Error('Review must contain at least 3 characters.');

  const name = reviewerName({
    nameMode: input.nameMode ?? existing.nameMode,
    fullName: input.fullName ?? existing.fullName
  });
  const reviewerEmail = email(input.email ?? existing.email);
  if (!validEmail(reviewerEmail)) throw new Error('Enter a valid email address or leave it blank.');

  const allowedStatuses = ['pending', 'published', 'rejected'];
  const status = admin && allowedStatuses.includes(input.status) ? input.status : (existing.status || 'pending');
  const submittedAt = admin && input.submittedAt ? new Date(input.submittedAt) : (existing.submittedAt || new Date());
  if (Number.isNaN(submittedAt.getTime())) throw new Error('Review date is invalid.');

  return {
    productId,
    productName: product.name,
    productImage: product.image || '',
    rating,
    reviewText,
    ...name,
    email: reviewerEmail || null,
    status,
    source: clean(input.source || existing.source || (admin ? 'admin' : 'customer'), 30),
    submittedAt,
    updatedAt: new Date(),
    createdAt: existing.createdAt || new Date()
  };
}

app.http('reviewStats', {
  methods: ['GET'], authLevel: 'anonymous', route: 'reviews/stats',
  handler: async () => {
    const d = await db();
    const rows = await d.collection('productReviews').aggregate([
      { $match: { status: 'published' } },
      { $group: { _id: '$productId', reviewCount: { $sum: 1 }, averageRating: { $avg: '$rating' } } }
    ]).toArray();
    const stats = {};
    rows.forEach(x => { stats[x._id] = { reviewCount: x.reviewCount, averageRating: Number(x.averageRating.toFixed(2)) }; });
    return json({ stats });
  }
});

app.http('productReviewsPublic', {
  methods: ['GET'], authLevel: 'anonymous', route: 'reviews/{productId}',
  handler: async req => {
    const d = await db();
    const productId = clean(req.params.productId, 120);
    const reviews = await d.collection('productReviews')
      .find({ productId, status: 'published' }, { projection: { email: 0, fullName: 0 } })
      .sort({ submittedAt: -1 }).limit(100).toArray();
    return json({ reviews });
  }
});

app.http('productReviewSubmit', {
  methods: ['POST'], authLevel: 'anonymous', route: 'reviews',
  handler: async req => {
    try {
      const d = await db();
      const input = await body(req);
      const review = await cleanReview(d, { ...input, status: 'pending', source: 'customer' }, {}, false);
      await d.collection('productReviews').insertOne(review);
      return json({ success: true, message: 'Thank you. Your review has been submitted for approval.' }, 201);
    } catch (e) {
      return json({ message: e.message }, 400);
    }
  }
});

app.http('adminReviews', {
  methods: ['GET', 'POST'], authLevel: 'anonymous', route: 'manage/reviews',
  handler: async req => {
    const denied = requireAdmin(req); if (denied) return denied;
    const d = await db();
    if (req.method === 'GET') {
      const filter = {};
      const status = clean(req.query.get('status'), 30);
      const productId = clean(req.query.get('productId'), 120);
      const rating = Number(req.query.get('rating') || 0);
      if (status) filter.status = status;
      if (productId) filter.productId = productId;
      if (rating >= 1 && rating <= 5) filter.rating = rating;
      const reviews = await d.collection('productReviews').find(filter).sort({ submittedAt: -1 }).limit(1000).toArray();
      return json({ reviews });
    }
    try {
      const input = await body(req);
      const review = await cleanReview(d, {
        ...input,
        status: input.status || 'published',
        source: input.source || 'migrated'
      }, {}, true);
      await d.collection('productReviews').insertOne(review);
      return json({ success: true, review }, 201);
    } catch (e) {
      return json({ message: e.message }, 400);
    }
  }
});

app.http('adminReviewById', {
  methods: ['PUT', 'DELETE'], authLevel: 'anonymous', route: 'manage/reviews/{id}',
  handler: async req => {
    const denied = requireAdmin(req); if (denied) return denied;
    const d = await db();
    if (!ObjectId.isValid(req.params.id)) return json({ message: 'Review not found' }, 404);
    const _id = new ObjectId(req.params.id);
    const existing = await d.collection('productReviews').findOne({ _id });
    if (!existing) return json({ message: 'Review not found' }, 404);
    if (req.method === 'DELETE') {
      await d.collection('productReviews').deleteOne({ _id });
      return json({ success: true });
    }
    try {
      const input = await body(req);
      const review = await cleanReview(d, input, existing, true);
      await d.collection('productReviews').updateOne({ _id }, { $set: review });
      return json({ success: true, review: { ...review, _id } });
    } catch (e) {
      return json({ message: e.message }, 400);
    }
  }
});
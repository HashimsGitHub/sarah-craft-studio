const { app } = require('@azure/functions');
const { MongoClient, ObjectId } = require('mongodb');
const { EmailClient } = require('@azure/communication-email');

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

const json = (body, status = 200) => ({
  status,
  jsonBody: body,
  headers: { 'Cache-Control': 'no-store' }
});

async function readBody(req) {
  try { return await req.json(); } catch { return {}; }
}

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

function requireAdmin(req) {
  if (!isAdmin(req)) return json({ message: 'Forbidden' }, 403);
  return null;
}

function cleanString(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function cleanProduct(input, existing = {}) {
  const now = new Date();
  const id = cleanString(input.id || existing.id || input.slug, 100);
  const slug = cleanString(input.slug || existing.slug || id, 120);
  if (!id || !slug || !cleanString(input.name || existing.name, 200)) {
    throw new Error('Product id, slug and name are required');
  }
  const price = Number(input.price ?? existing.price ?? 0);
  if (!Number.isFinite(price) || price < 0) throw new Error('Product price must be a valid non-negative number');
  const stock = Number(input.stock ?? existing.stock ?? 0);
  return {
    id,
    slug,
    name: cleanString(input.name ?? existing.name, 200),
    category: cleanString(input.category ?? existing.category, 100),
    collections: Array.isArray(input.collections) ? input.collections.map(x => cleanString(x, 100)).filter(Boolean) : (existing.collections || []),
    price,
    currency: cleanString(input.currency || existing.currency || 'CAD', 10) || 'CAD',
    description: cleanString(input.description ?? existing.description, 5000),
    image: cleanString(input.image ?? existing.image, 2000),
    images: Array.isArray(input.images) ? input.images.map(x => cleanString(x, 2000)).filter(Boolean) : (existing.images || []),
    personalizable: input.personalizable !== undefined ? Boolean(input.personalizable) : Boolean(existing.personalizable),
    stock: Number.isFinite(stock) && stock >= 0 ? stock : 0,
    active: input.active !== undefined ? Boolean(input.active) : (existing.active !== false),
    createdAt: existing.createdAt || now,
    updatedAt: now
  };
}

function cleanDiscount(input, existing = {}) {
  const code = cleanString(input.code || existing.code, 50).toUpperCase();
  if (!code) throw new Error('Discount code is required');
  const allowedTypes = ['percentage', 'fixed', 'free_shipping'];
  const type = cleanString(input.type || existing.type || 'percentage', 50);
  if (!allowedTypes.includes(type)) throw new Error('Invalid discount type');
  const value = Number(input.value ?? existing.value ?? 0);
  if (!Number.isFinite(value) || value < 0) throw new Error('Discount value must be a valid non-negative number');
  const minimumOrder = Number(input.minimumOrder ?? existing.minimumOrder ?? 0);
  const usageLimit = input.usageLimit === '' || input.usageLimit == null ? null : Number(input.usageLimit);
  return {
    code,
    type,
    value,
    minimumOrder: Number.isFinite(minimumOrder) && minimumOrder >= 0 ? minimumOrder : 0,
    usageLimit: usageLimit == null ? null : Math.max(0, usageLimit),
    usageCount: Number(existing.usageCount || 0),
    startsAt: input.startsAt ? new Date(input.startsAt) : (existing.startsAt || null),
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : (existing.expiresAt || null),
    active: input.active !== undefined ? Boolean(input.active) : (existing.active !== false),
    createdAt: existing.createdAt || new Date(),
    updatedAt: new Date()
  };
}

function orderFilter(id) {
  const value = cleanString(id, 200);
  const options = [{ orderNumber: value }, { paypalOrderId: value }];
  if (ObjectId.isValid(value)) options.push({ _id: new ObjectId(value) });
  return { $or: options };
}

// -------------------- Public catalogue --------------------
app.http('products', {
  methods: ['GET'], authLevel: 'anonymous', route: 'products',
  handler: async () => {
    const d = await db();
    const products = await d.collection('products').find({ active: { $ne: false } }).sort({ createdAt: -1 }).toArray();
    return json({ products });
  }
});

app.http('discountValidate', {
  methods: ['POST'], authLevel: 'anonymous', route: 'discounts/validate',
  handler: async req => {
    const input = await readBody(req);
    const code = cleanString(input.code, 50).toUpperCase();
    const subtotal = Number(input.subtotal || 0);
    const d = await db();
    const discount = await d.collection('discounts').findOne({ code, active: true });
    if (!discount) return json({ valid: false, message: 'Discount code is not valid.' }, 404);
    const now = new Date();
    if (discount.startsAt && new Date(discount.startsAt) > now) return json({ valid: false, message: 'Discount code is not active yet.' }, 400);
    if (discount.expiresAt && new Date(discount.expiresAt) < now) return json({ valid: false, message: 'Discount code has expired.' }, 400);
    if (discount.minimumOrder && subtotal < discount.minimumOrder) return json({ valid: false, message: `Minimum order is CAD $${Number(discount.minimumOrder).toFixed(2)}.` }, 400);
    if (discount.usageLimit != null && Number(discount.usageCount || 0) >= Number(discount.usageLimit)) return json({ valid: false, message: 'Discount code usage limit has been reached.' }, 400);
    return json({ valid: true, code: discount.code, type: discount.type, value: discount.value || 0 });
  }
});

async function officialCart(d, items = []) {
  let total = 0;
  const out = [];
  for (const i of items) {
    const p = await d.collection('products').findOne({ id: i.productId, active: { $ne: false } });
    if (!p) throw new Error(`Product ${i.productId} is unavailable`);
    const q = Math.max(1, Math.min(99, Number(i.quantity) || 1));
    if (Number.isFinite(Number(p.stock)) && Number(p.stock) > 0 && q > Number(p.stock)) throw new Error(`Only ${p.stock} of ${p.name} are available`);
    out.push({
      productId: p.id,
      name: p.name,
      unitPrice: Number(p.price),
      quantity: q,
      personalization: cleanString(i.personalization, 500)
    });
    total += Number(p.price) * q;
  }
  return { items: out, subtotal: total };
}

async function paypalToken() {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error('PayPal is not configured');
  const base = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';
  const r = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  if (!r.ok) throw new Error('Could not authenticate with PayPal');
  return { base, token: (await r.json()).access_token };
}

app.http('checkoutCreate', {
  methods: ['POST'], authLevel: 'anonymous', route: 'checkout/create',
  handler: async req => {
    try {
      const x = await readBody(req);
      const d = await db();
      const oc = await officialCart(d, x.cart);
      let discount = 0;
      let shipping = oc.subtotal >= 75 ? 0 : 9.95;
      let discountCode = null;
      if (x.discount?.code) {
        const c = await d.collection('discounts').findOne({ code: cleanString(x.discount.code, 50).toUpperCase(), active: true });
        const now = new Date();
        const usable = c && (!c.startsAt || new Date(c.startsAt) <= now) && (!c.expiresAt || new Date(c.expiresAt) >= now) && (!c.minimumOrder || oc.subtotal >= Number(c.minimumOrder)) && (c.usageLimit == null || Number(c.usageCount || 0) < Number(c.usageLimit));
        if (usable) {
          discountCode = c.code;
          if (c.type === 'percentage') discount = oc.subtotal * (Number(c.value) / 100);
          if (c.type === 'fixed') discount = Math.min(oc.subtotal, Number(c.value));
          if (c.type === 'free_shipping') shipping = 0;
        }
      }
      const total = Math.max(0, oc.subtotal - discount + shipping);
      const pp = await paypalToken();
      const site = process.env.PUBLIC_SITE_URL || 'https://gray-plant-097bd000f.6.azurestaticapps.net';
      const r = await fetch(`${pp.base}/v2/checkout/orders`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${pp.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{ amount: { currency_code: 'CAD', value: total.toFixed(2) } }],
          application_context: {
            return_url: `${site}/order-success.html`,
            cancel_url: `${site}/cart.html`
          }
        })
      });
      const p = await r.json();
      if (!r.ok) throw new Error(p.message || 'PayPal order failed');
      const orderNumber = `SCS-${Date.now()}`;
      await d.collection('orders').insertOne({
        orderNumber,
        paypalOrderId: p.id,
        customer: x.customer || {},
        items: oc.items,
        subtotal: oc.subtotal,
        discount,
        discountCode,
        shipping,
        total,
        currency: 'CAD',
        paymentStatus: 'CREATED',
        fulfilmentStatus: 'new',
        delivery: { method: cleanString(x.deliveryMethod || 'shipping', 50), carrier: '', trackingNumber: '', shippedAt: null, deliveredAt: null },
        adminNotes: '',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      return json({ orderId: p.id, orderNumber, approveUrl: p.links?.find(l => l.rel === 'approve')?.href });
    } catch (e) {
      return json({ message: e.message }, 500);
    }
  }
});

app.http('checkoutCapture', {
  methods: ['POST'], authLevel: 'anonymous', route: 'checkout/capture',
  handler: async req => {
    try {
      const x = await readBody(req);
      const pp = await paypalToken();
      const r = await fetch(`${pp.base}/v2/checkout/orders/${encodeURIComponent(x.orderId)}/capture`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${pp.token}`, 'Content-Type': 'application/json' }
      });
      const p = await r.json();
      if (!r.ok) throw new Error(p.message || 'Capture failed');
      const d = await db();
      const o = await d.collection('orders').findOneAndUpdate(
        { paypalOrderId: x.orderId },
        { $set: { paymentStatus: p.status, fulfilmentStatus: 'paid', paidAt: new Date(), updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
      if (o?.discountCode) await d.collection('discounts').updateOne({ code: o.discountCode }, { $inc: { usageCount: 1 }, $set: { updatedAt: new Date() } });
      await sendOrderEmails(o || {});
      return json({ success: true, status: p.status, orderNumber: o?.orderNumber });
    } catch (e) {
      return json({ message: e.message }, 500);
    }
  }
});

async function sendMail(to, subject, html) {
  if (!to || !process.env.ACS_EMAIL_CONNECTION_STRING || !process.env.EMAIL_SENDER) return;
  const c = new EmailClient(process.env.ACS_EMAIL_CONNECTION_STRING);
  await c.beginSend({ senderAddress: process.env.EMAIL_SENDER, content: { subject, html }, recipients: { to: [{ address: to }] } });
}

async function sendOrderEmails(o) {
  if (!o.customer?.email) return;
  await Promise.allSettled([
    sendMail(o.customer.email, `Sarah Craft Studio order ${o.orderNumber || o.paypalOrderId}`, `<h2>Thank you for your order</h2><p>Your payment has been received.</p><p>Total: CAD $${Number(o.total || 0).toFixed(2)}</p>`),
    sendMail(process.env.ADMIN_EMAIL || 'info@sarahcraftstudio.com', `New Sarah Craft Studio order ${o.orderNumber || o.paypalOrderId}`, `<h2>New order</h2><p>${cleanString(o.customer.email, 300)}</p><pre>${JSON.stringify(o.items, null, 2)}</pre>`)
  ]);
}

app.http('contact', {
  methods: ['POST'], authLevel: 'anonymous', route: 'contact',
  handler: async req => {
    const x = await readBody(req);
    await sendMail(process.env.ADMIN_EMAIL || 'info@sarahcraftstudio.com', `Website enquiry${x.orderNumber ? ' - ' + cleanString(x.orderNumber, 100) : ''}`, `<p>From: ${cleanString(x.name, 200)} &lt;${cleanString(x.email, 300)}&gt;</p><p>${cleanString(x.message, 5000).replace(/[<>]/g, '')}</p>`);
    return json({ success: true });
  }
});

// -------------------- Admin --------------------
app.http('adminMe', {
  methods: ['GET'], authLevel: 'anonymous', route: 'manage/me',
  handler: async req => requireAdmin(req) || json(principal(req))
});

app.http('adminDashboard', {
  methods: ['GET'], authLevel: 'anonymous', route: 'manage/dashboard',
  handler: async req => {
    const denied = requireAdmin(req); if (denied) return denied;
    const d = await db();
    const [totalProducts, activeProducts, lowStockProducts, totalOrders, pendingOrders, shippedOrders, deliveredOrders, activeDiscounts, recentOrders, revenueAgg] = await Promise.all([
      d.collection('products').countDocuments({}),
      d.collection('products').countDocuments({ active: { $ne: false } }),
      d.collection('products').countDocuments({ active: { $ne: false }, stock: { $lte: 5 } }),
      d.collection('orders').countDocuments({}),
      d.collection('orders').countDocuments({ fulfilmentStatus: { $in: ['new', 'paid', 'processing', 'ready_for_pickup'] } }),
      d.collection('orders').countDocuments({ fulfilmentStatus: 'shipped' }),
      d.collection('orders').countDocuments({ fulfilmentStatus: 'delivered' }),
      d.collection('discounts').countDocuments({ active: true }),
      d.collection('orders').find({}).sort({ createdAt: -1 }).limit(10).toArray(),
      d.collection('orders').aggregate([{ $match: { paymentStatus: 'COMPLETED' } }, { $group: { _id: null, total: { $sum: '$total' } } }]).toArray()
    ]);
    return json({
      stats: { totalProducts, activeProducts, lowStockProducts, totalOrders, pendingOrders, shippedOrders, deliveredOrders, activeDiscounts, revenue: revenueAgg[0]?.total || 0 },
      recentOrders
    });
  }
});

app.http('adminProducts', {
  methods: ['GET', 'POST'], authLevel: 'anonymous', route: 'manage/products',
  handler: async req => {
    const denied = requireAdmin(req); if (denied) return denied;
    const d = await db();
    if (req.method === 'GET') return json({ products: await d.collection('products').find({}).sort({ createdAt: -1 }).toArray() });
    try {
      const x = await readBody(req);
      const existing = x.id ? await d.collection('products').findOne({ id: cleanString(x.id, 100) }) : null;
      const product = cleanProduct(x, existing || {});
      await d.collection('products').updateOne({ id: product.id }, { $set: product }, { upsert: true });
      return json({ success: true, product }, existing ? 200 : 201);
    } catch (e) { return json({ message: e.message }, 400); }
  }
});

app.http('adminProductById', {
  methods: ['GET', 'PUT', 'DELETE'], authLevel: 'anonymous', route: 'manage/products/{id}',
  handler: async (req, context) => {
    const denied = requireAdmin(req); if (denied) return denied;
    const d = await db();
    const id = cleanString(req.params.id, 100);
    const existing = await d.collection('products').findOne({ id });
    if (!existing) return json({ message: 'Product not found' }, 404);
    if (req.method === 'GET') return json({ product: existing });
    if (req.method === 'DELETE') {
      await d.collection('products').deleteOne({ id });
      return json({ success: true });
    }
    try {
      const product = cleanProduct({ ...(await readBody(req)), id }, existing);
      await d.collection('products').updateOne({ id }, { $set: product });
      return json({ success: true, product });
    } catch (e) { return json({ message: e.message }, 400); }
  }
});

app.http('adminDiscounts', {
  methods: ['GET', 'POST'], authLevel: 'anonymous', route: 'manage/discounts',
  handler: async req => {
    const denied = requireAdmin(req); if (denied) return denied;
    const d = await db();
    if (req.method === 'GET') return json({ discounts: await d.collection('discounts').find({}).sort({ createdAt: -1 }).toArray() });
    try {
      const x = await readBody(req);
      const code = cleanString(x.code, 50).toUpperCase();
      const existing = code ? await d.collection('discounts').findOne({ code }) : null;
      const discount = cleanDiscount(x, existing || {});
      await d.collection('discounts').updateOne({ code: discount.code }, { $set: discount }, { upsert: true });
      return json({ success: true, discount }, existing ? 200 : 201);
    } catch (e) { return json({ message: e.message }, 400); }
  }
});

app.http('adminDiscountByCode', {
  methods: ['GET', 'PUT', 'DELETE'], authLevel: 'anonymous', route: 'manage/discounts/{code}',
  handler: async req => {
    const denied = requireAdmin(req); if (denied) return denied;
    const d = await db();
    const code = cleanString(req.params.code, 50).toUpperCase();
    const existing = await d.collection('discounts').findOne({ code });
    if (!existing) return json({ message: 'Discount not found' }, 404);
    if (req.method === 'GET') return json({ discount: existing });
    if (req.method === 'DELETE') {
      await d.collection('discounts').deleteOne({ code });
      return json({ success: true });
    }
    try {
      const discount = cleanDiscount({ ...(await readBody(req)), code }, existing);
      await d.collection('discounts').updateOne({ code }, { $set: discount });
      return json({ success: true, discount });
    } catch (e) { return json({ message: e.message }, 400); }
  }
});

app.http('adminOrders', {
  methods: ['GET'], authLevel: 'anonymous', route: 'manage/orders',
  handler: async req => {
    const denied = requireAdmin(req); if (denied) return denied;
    const d = await db();
    const status = cleanString(req.query.get('status'), 50);
    const filter = status ? { fulfilmentStatus: status } : {};
    return json({ orders: await d.collection('orders').find(filter).sort({ createdAt: -1 }).limit(500).toArray() });
  }
});

app.http('adminOrderById', {
  methods: ['GET', 'PUT'], authLevel: 'anonymous', route: 'manage/orders/{id}',
  handler: async req => {
    const denied = requireAdmin(req); if (denied) return denied;
    const d = await db();
    const filter = orderFilter(req.params.id);
    const existing = await d.collection('orders').findOne(filter);
    if (!existing) return json({ message: 'Order not found' }, 404);
    if (req.method === 'GET') return json({ order: existing });
    const x = await readBody(req);
    const allowedStatuses = ['new', 'paid', 'processing', 'ready_for_pickup', 'shipped', 'delivered', 'cancelled'];
    const $set = { updatedAt: new Date() };
    if (x.fulfilmentStatus !== undefined) {
      const s = cleanString(x.fulfilmentStatus, 50);
      if (!allowedStatuses.includes(s)) return json({ message: 'Invalid fulfilment status' }, 400);
      $set.fulfilmentStatus = s;
      if (s === 'shipped' && !existing.delivery?.shippedAt) $set['delivery.shippedAt'] = new Date();
      if (s === 'delivered' && !existing.delivery?.deliveredAt) $set['delivery.deliveredAt'] = new Date();
    }
    if (x.adminNotes !== undefined) $set.adminNotes = cleanString(x.adminNotes, 5000);
    if (x.delivery && typeof x.delivery === 'object') {
      if (x.delivery.method !== undefined) $set['delivery.method'] = cleanString(x.delivery.method, 50);
      if (x.delivery.carrier !== undefined) $set['delivery.carrier'] = cleanString(x.delivery.carrier, 100);
      if (x.delivery.trackingNumber !== undefined) $set['delivery.trackingNumber'] = cleanString(x.delivery.trackingNumber, 200);
    }
    const order = await d.collection('orders').findOneAndUpdate(filter, { $set }, { returnDocument: 'after' });
    return json({ success: true, order });
  }
});

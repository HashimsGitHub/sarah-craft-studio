const { app } = require('@azure/functions');
const { MongoClient } = require('mongodb');

let client;
let database;

const DEFAULT_MESSAGE = 'We’re taking a short break. You’re welcome to browse, but ordering is temporarily unavailable.';
const json = (body, status = 200) => ({ status, jsonBody: body, headers: { 'Cache-Control': 'no-store' } });
const cleanString = (value, max = 500) => String(value ?? '').trim().slice(0, max);

async function db() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  if (!client) {
    client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    await client.connect();
  }
  if (!database) database = client.db(process.env.MONGODB_DB || 'sarahcraftstudio');
  return database;
}

async function readBody(req) { try { return await req.json(); } catch { return {}; } }

function principal(req) {
  try {
    const raw = req.headers.get('x-ms-client-principal');
    if (!raw) return null;
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch { return null; }
}

function isAdmin(req) { return principal(req)?.userRoles?.includes('admin') === true; }

async function getSettings(d) {
  const s = await d.collection('settings').findOne({ _id: 'store' });
  return {
    vacationMode: s?.vacationMode === true,
    vacationMessage: cleanString(s?.vacationMessage || DEFAULT_MESSAGE, 500) || DEFAULT_MESSAGE,
    updatedAt: s?.updatedAt || null
  };
}

app.http('storeStatus', {
  methods: ['GET'], authLevel: 'anonymous', route: 'store-status',
  handler: async () => {
    try {
      const d = await db();
      return json(await getSettings(d));
    } catch (e) {
      return json({ vacationMode: false, vacationMessage: DEFAULT_MESSAGE });
    }
  }
});

app.http('adminStoreSettings', {
  methods: ['GET', 'PUT'], authLevel: 'anonymous', route: 'manage/store-settings',
  handler: async req => {
    if (!isAdmin(req)) return json({ message: 'Forbidden' }, 403);
    const d = await db();
    if (req.method === 'GET') return json(await getSettings(d));
    const x = await readBody(req);
    const update = {
      vacationMode: x.vacationMode === true,
      vacationMessage: cleanString(x.vacationMessage || DEFAULT_MESSAGE, 500) || DEFAULT_MESSAGE,
      updatedAt: new Date()
    };
    await d.collection('settings').updateOne({ _id: 'store' }, { $set: update }, { upsert: true });
    return json({ success: true, ...update });
  }
});

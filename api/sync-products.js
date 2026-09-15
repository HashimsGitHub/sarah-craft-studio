const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const apply = process.argv.includes('--apply');
const keepExisting = process.argv.includes('--keep-existing');

(async () => {
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI first');

  const products = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'data', 'products.json'), 'utf8')
  );

  const ids = products.map(p => p.id);
  console.log(`Catalog contains ${products.length} products:`);
  for (const p of products) console.log(` - ${p.name} (${p.id}) CAD $${Number(p.price).toFixed(2)}`);

  if (!apply) {
    console.log('\nDry run only. No MongoDB changes made.');
    console.log('Run with --apply to upsert this catalog.');
    console.log('By default, products not in this catalog are deactivated so MongoDB matches the imported inventory.');
    console.log('Add --keep-existing to leave other products active.');
    return;
  }

  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'sarahcraftstudio');
  const collection = db.collection('products');
  const now = new Date();

  for (const product of products) {
    await collection.updateOne(
      { id: product.id },
      {
        $set: { ...product, updatedAt: now },
        $setOnInsert: { createdAt: now }
      },
      { upsert: true }
    );
  }

  let deactivated = 0;
  if (!keepExisting) {
    const result = await collection.updateMany(
      { id: { $nin: ids }, active: { $ne: false } },
      { $set: { active: false, updatedAt: now, archivedReason: 'Not present in WooCommerce inventory import' } }
    );
    deactivated = result.modifiedCount;
  }

  console.log(`\nUpserted ${products.length} products.`);
  if (keepExisting) console.log('Existing products not in the import were left unchanged.');
  else console.log(`Deactivated ${deactivated} product(s) not present in the imported catalog.`);

  await client.close();
})().catch(err => {
  console.error(err);
  process.exit(1);
});

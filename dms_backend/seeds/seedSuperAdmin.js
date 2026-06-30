/**
 * Seeds the first super admin into the analytics DB super_admins collection.
 * Safe to re-run — skips insert if email already exists.
 *
 * Usage:
 *   node dms_backend/seeds/seedSuperAdmin.js
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const ANALYTICS_URI = process.env.ANALYTICS_MONGO_URI;
const ANALYTICS_DB  = process.env.ANALYTICS_MONGO_DB_NAME || 'dms';

if (!ANALYTICS_URI) {
  console.error('❌ ANALYTICS_MONGO_URI not set in .env');
  process.exit(1);
}

const EMAIL    = 'connectgenai@gmail.com';
const PASSWORD = 'JaiSriGanesha/99';

async function main() {
  console.log('🔗 Connecting to analytics DB...');
  const conn = await mongoose.createConnection(ANALYTICS_URI, {
    dbName:    ANALYTICS_DB,
    autoIndex: false,
  }).asPromise();

  const db = conn.db;

  const existing = await db.collection('super_admins').findOne({ email: EMAIL });
  if (existing) {
    console.log(`✅ Super admin already exists: ${EMAIL} (id: ${existing._id})`);
    await conn.close();
    process.exit(0);
  }

  const hashed = await bcrypt.hash(PASSWORD, 10);
  const result = await db.collection('super_admins').insertOne({
    email:     EMAIL,
    password:  hashed,
    firstName: 'Connect',
    lastName:  'Admin',
    status:    'active',
    createdAt: new Date(),
  });

  console.log(`✅ Super admin created: ${EMAIL} (id: ${result.insertedId})`);
  console.log('   Login at /connect-desk with the seeded credentials.');

  await conn.close();
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});

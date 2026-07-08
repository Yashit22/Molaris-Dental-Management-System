/**
 * One-time backfill for credit_ledger debit rows created before the ledger
 * started storing `patientName` and `durationSeconds` in meta.
 *
 * For each debit row missing those fields, it opens the owning tenant's DB
 * (looked up from the global `tenants` collection), reads the ReportJob (exact
 * audio duration) and the Patient (name), and patches the ledger row's meta.
 *
 * Run:  node seeds/backfillLedgerMeta.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';

async function run() {
  const analytics = await mongoose.createConnection(process.env.ANALYTICS_MONGO_URI, {
    dbName: process.env.ANALYTICS_MONGO_DB_NAME || 'dms',
  }).asPromise();

  const ledgerCol  = analytics.collection('credit_ledger');
  const tenantsCol = analytics.collection('tenants');

  const rows = await ledgerCol.find({
    type: 'debit',
    $or: [
      { 'meta.durationSeconds': { $exists: false } },
      { 'meta.patientName':     { $exists: false } },
    ],
  }).toArray();

  console.log(`Found ${rows.length} debit row(s) to backfill.`);

  const tenantConnCache = new Map();
  async function tenantConn(tenantId) {
    const key = String(tenantId);
    if (tenantConnCache.has(key)) return tenantConnCache.get(key);
    const tenant = await tenantsCol.findOne({ _id: new mongoose.Types.ObjectId(key) });
    if (!tenant?.mongoUri || !tenant?.mongoDbName) return null;
    const conn = await mongoose.createConnection(tenant.mongoUri, { dbName: tenant.mongoDbName }).asPromise();
    tenantConnCache.set(key, conn);
    return conn;
  }

  let patched = 0;
  for (const r of rows) {
    const set = {};
    try {
      const conn = await tenantConn(r.tenantId);
      if (!conn) { console.warn('  skip: tenant DB not configured for', String(r.tenantId)); continue; }

      // Exact duration from the job if available; else derive from billed amount.
      if (r.meta?.jobId) {
        const job = await conn.collection('reportjobs').findOne(
          { _id: new mongoose.Types.ObjectId(r.meta.jobId) },
          { projection: { audioDurationSeconds: 1 } },
        );
        if (job?.audioDurationSeconds != null) set['meta.durationSeconds'] = job.audioDurationSeconds;
      }
      if (set['meta.durationSeconds'] == null) {
        // Fallback: cost = duration × templateCount  →  duration = |seconds| / tmpl
        const tmpl = r.meta?.templateCount || 1;
        set['meta.durationSeconds'] = Math.round(Math.abs(r.seconds) / tmpl);
      }

      if (r.meta?.patientId) {
        const p = await conn.collection('patients').findOne(
          { _id: new mongoose.Types.ObjectId(r.meta.patientId) },
          { projection: { first_name: 1, last_name: 1 } },
        );
        if (p) set['meta.patientName'] = `${p.first_name || ''} ${p.last_name || ''}`.trim();
      }

      if (Object.keys(set).length) {
        await ledgerCol.updateOne({ _id: r._id }, { $set: set });
        patched++;
        console.log('  patched', String(r._id), set);
      }
    } catch (err) {
      console.warn('  error on', String(r._id), '-', err.message);
    }
  }

  console.log(`Backfill complete. Patched ${patched}/${rows.length}.`);
  for (const c of tenantConnCache.values()) await c.close();
  await analytics.close();
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });

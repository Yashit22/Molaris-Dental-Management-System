/**
 * One-time backfill of visit links, run BEFORE removing the same-day fallback in
 * the Documents matcher. For every tenant DB it fills:
 *
 *   • ReportJob.visitId        — from appointmentId (Visit.appointment_id), else a
 *                                 same-day visit (by createdAt).
 *   • Patient.files[].visit_id — from a same-day visit (by the file's uploaded_at).
 *
 * Invoices already receive visit_id at creation when a visit context exists;
 * genuinely visit-less (walk-in) invoices are left as-is and not touched here.
 *
 * Idempotent: only rows/subdocs still missing a link are updated. Nothing is
 * created — a document with no same-day visit is simply left unlinked and logged.
 *
 * Run:  node seeds/backfillVisitLinks.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const dayRange = (d) => {
  const start = new Date(d); start.setHours(0, 0, 0, 0);
  const end   = new Date(d); end.setHours(23, 59, 59, 999);
  return { start, end };
};

async function backfillTenant(conn, label) {
  const Visit      = conn.collection('visits');
  const ReportJob  = conn.collection('reportjobs');
  const Patient    = conn.collection('patients');

  let reportsLinked = 0, reportsUnmatched = 0;
  let filesLinked = 0, filesUnmatched = 0;

  // ── ReportJobs ──
  const jobs = await ReportJob.find({ visitId: { $in: [null, undefined] } }).toArray();
  for (const job of jobs) {
    let visitId = null;

    if (job.appointmentId) {
      const v = await Visit.findOne({ appointment_id: job.appointmentId }, { projection: { _id: 1 } });
      if (v) visitId = v._id;
    }
    if (!visitId) {
      const { start, end } = dayRange(job.createdAt || new Date());
      const v = await Visit.findOne(
        { patient_id: job.patientId, date: { $gte: start, $lte: end } },
        { projection: { _id: 1 }, sort: { date: -1 } },
      );
      if (v) visitId = v._id;
    }

    if (visitId) {
      await ReportJob.updateOne({ _id: job._id }, { $set: { visitId } });
      reportsLinked++;
    } else {
      reportsUnmatched++;
    }
  }

  // ── Patient.files[] ──
  // Only patients that actually have files needing a link.
  const patients = await Patient.find(
    { 'files.0': { $exists: true } },
    { projection: { files: 1 } },
  ).toArray();

  for (const p of patients) {
    let dirty = false;
    for (const f of p.files) {
      if (f.visit_id) continue;
      const { start, end } = dayRange(f.uploaded_at || new Date());
      const v = await Visit.findOne(
        { patient_id: p._id, date: { $gte: start, $lte: end } },
        { projection: { _id: 1 }, sort: { date: -1 } },
      );
      if (v) { f.visit_id = v._id; dirty = true; filesLinked++; }
      else { filesUnmatched++; }
    }
    if (dirty) await Patient.updateOne({ _id: p._id }, { $set: { files: p.files } });
  }

  console.log(`  [${label}] reports: ${reportsLinked} linked, ${reportsUnmatched} unmatched | files: ${filesLinked} linked, ${filesUnmatched} unmatched`);
}

async function run() {
  const analytics = await mongoose.createConnection(process.env.ANALYTICS_MONGO_URI, {
    dbName: process.env.ANALYTICS_MONGO_DB_NAME || 'dms',
  }).asPromise();

  const tenants = await analytics.collection('tenants').find(
    { mongoUri: { $exists: true, $ne: '' }, mongoDbName: { $exists: true, $ne: '' } },
  ).toArray();

  console.log(`Backfilling ${tenants.length} tenant(s)…`);

  for (const t of tenants) {
    let conn;
    try {
      conn = await mongoose.createConnection(t.mongoUri, { dbName: t.mongoDbName }).asPromise();
      await backfillTenant(conn, t.name || String(t._id));
    } catch (err) {
      console.warn(`  [${t.name || t._id}] skipped — ${err.message}`);
    } finally {
      if (conn) await conn.close();
    }
  }

  await analytics.close();
  console.log('Done.');
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });

/**
 * One-time backfill of Visit.appointment_id, run BEFORE removing the same-day
 * fallback in the Documents matcher. For every tenant DB, each visit that lacks
 * an appointment_id is matched to the patient's appointment on the SAME DAY —
 * but ONLY when exactly one such appointment exists that day (so we never guess
 * between two same-day appointments).
 *
 * Idempotent: skips visits that already have an appointment_id. Nothing created.
 *
 * Run:  node seeds/backfillVisitAppointment.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const dayRange = (d) => {
  const start = new Date(d); start.setHours(0, 0, 0, 0);
  const end   = new Date(d); end.setHours(23, 59, 59, 999);
  return { start, end };
};

async function backfillTenant(conn, label) {
  const Visit       = conn.collection('visits');
  const Appointment = conn.collection('appointments');

  let linked = 0, noMatch = 0, ambiguous = 0;

  const visits = await Visit.find({ appointment_id: { $in: [null, undefined] } }).toArray();

  for (const v of visits) {
    const { start, end } = dayRange(v.date || v.createdAt || new Date());
    const appts = await Appointment.find({
      patient_id: v.patient_id,
      start_time: { $gte: start, $lte: end },
    }).project({ _id: 1 }).toArray();

    if (appts.length === 1) {
      await Visit.updateOne({ _id: v._id }, { $set: { appointment_id: appts[0]._id } });
      linked++;
    } else if (appts.length === 0) {
      noMatch++;
    } else {
      ambiguous++; // 2+ same-day appointments — left unlinked deliberately
    }
  }

  console.log(`  [${label}] visits: ${linked} linked, ${noMatch} no-appt, ${ambiguous} ambiguous (left unlinked)`);
}

async function run() {
  const analytics = await mongoose.createConnection(process.env.ANALYTICS_MONGO_URI, {
    dbName: process.env.ANALYTICS_MONGO_DB_NAME || 'dms',
  }).asPromise();

  const tenants = await analytics.collection('tenants').find(
    { mongoUri: { $exists: true, $ne: '' }, mongoDbName: { $exists: true, $ne: '' } },
  ).toArray();

  console.log(`Backfilling appointment links across ${tenants.length} tenant(s)…`);

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

import mongoose from 'mongoose';
import { getAnalyticsDb } from '../config/analyticsDb.js';

// ══════════════════════════════════════════════════════════════════════════════
//  AI Report Credits
//
//  Balances live in the GLOBAL analytics DB (not per-tenant DBs) so the super
//  admin manages them and tenants can't tamper. The stored unit is INTEGER
//  SECONDS (`tenants.creditSeconds`) — the exact source of truth. "Credits" is a
//  display projection: 1 credit = 60 seconds, rendered to 2 decimals.
//
//  Every mutation appends a row to the `credit_ledger` collection.
// ══════════════════════════════════════════════════════════════════════════════

function toObjectId(id) {
  try { return new mongoose.Types.ObjectId(id); } catch { return null; }
}

/** Convert whole seconds → credits, rounded to 2 decimal places. */
export function secondsToCredits(seconds) {
  return +(((seconds || 0) / 60).toFixed(2));
}

const tenantsCol = () => getAnalyticsDb().collection('tenants');
const ledgerCol  = () => getAnalyticsDb().collection('credit_ledger');

/** Current balance in whole seconds for a tenant (0 if unset). */
export async function getBalanceSeconds(tenantId) {
  const _id = toObjectId(tenantId);
  if (!_id) return 0;
  const t = await tenantsCol().findOne({ _id }, { projection: { creditSeconds: 1 } });
  return t?.creditSeconds || 0;
}

/** Does the tenant have at least `requiredSeconds` of credit? */
export async function hasCredits(tenantId, requiredSeconds) {
  return (await getBalanceSeconds(tenantId)) >= requiredSeconds;
}

async function appendLedger(tenantId, type, seconds, balanceAfter, meta = {}) {
  await ledgerCol().insertOne({
    tenantId: toObjectId(tenantId),
    type,               // 'debit' | 'topup' | 'adjustment'
    seconds,            // signed delta in seconds (negative for debit)
    balanceAfter,       // resulting balance in seconds
    meta,
    at: new Date(),
  });
}

/**
 * Atomically debit `seconds` from a tenant's balance.
 * Guarded by `{ creditSeconds: { $gte: seconds } }` so it can never go negative,
 * even under concurrent requests. Returns `false` if the balance was insufficient
 * (no change made); `true` on success (ledger row written).
 */
export async function debit(tenantId, seconds, meta = {}) {
  const _id = toObjectId(tenantId);
  if (!_id) return false;
  if (!seconds || seconds <= 0) return true; // nothing to charge

  const result = await tenantsCol().findOneAndUpdate(
    { _id, creditSeconds: { $gte: seconds } },
    { $inc: { creditSeconds: -seconds }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' }
  );

  // findOneAndUpdate returns the doc (or { value } depending on driver version).
  const updated = result?.value ?? result;
  if (!updated) return false; // insufficient balance — filter didn't match

  await appendLedger(tenantId, 'debit', -seconds, updated.creditSeconds, meta);
  return true;
}

/**
 * Manually adjust a tenant's balance by a SIGNED delta of seconds (super-admin).
 * Positive adds, negative deducts. Deductions are floored at 0 (balance can never
 * go negative) — the ledger records the actual applied delta. Returns the new
 * balance in seconds. `meta.note` (if provided) is stored on the ledger row.
 */
export async function adjust(tenantId, seconds, meta = {}) {
  const _id = toObjectId(tenantId);
  if (!_id) throw new Error('Invalid tenantId');
  const delta = Math.round(seconds || 0);
  if (delta === 0) throw new Error('adjustment must be non-zero');

  const before = await getBalanceSeconds(tenantId);
  const after = Math.max(0, before + delta);
  const applied = after - before; // actual change after flooring at 0

  const result = await tenantsCol().findOneAndUpdate(
    { _id },
    { $set: { creditSeconds: after, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  const updated = result?.value ?? result;
  if (!updated) throw new Error('Tenant not found');

  await appendLedger(tenantId, 'adjustment', applied, after, meta);
  return after;
}

/** Add `seconds` to a tenant's balance (super-admin top-up). */
export async function topUp(tenantId, seconds, meta = {}) {
  const _id = toObjectId(tenantId);
  if (!_id) throw new Error('Invalid tenantId');
  if (!seconds || seconds <= 0) throw new Error('seconds must be positive');

  const result = await tenantsCol().findOneAndUpdate(
    { _id },
    { $inc: { creditSeconds: seconds }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after', upsert: false }
  );
  const updated = result?.value ?? result;
  if (!updated) throw new Error('Tenant not found');

  await appendLedger(tenantId, 'topup', seconds, updated.creditSeconds, meta);
  return updated.creditSeconds;
}

/** Set a tenant's balance to an exact number of seconds (super-admin adjustment). */
export async function setBalance(tenantId, seconds, meta = {}) {
  const _id = toObjectId(tenantId);
  if (!_id) throw new Error('Invalid tenantId');
  const value = Math.max(0, Math.round(seconds || 0));

  const before = await getBalanceSeconds(tenantId);
  const result = await tenantsCol().findOneAndUpdate(
    { _id },
    { $set: { creditSeconds: value, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  const updated = result?.value ?? result;
  if (!updated) throw new Error('Tenant not found');

  await appendLedger(tenantId, 'adjustment', value - before, value, meta);
  return value;
}

/** Recent ledger rows for a tenant, newest first. */
export async function getLedger(tenantId, limit = 100) {
  const tid = toObjectId(tenantId);
  if (!tid) return [];
  return ledgerCol()
    .find({ tenantId: tid })
    .sort({ at: -1 })
    .limit(Math.min(Number(limit) || 100, 500))
    .toArray();
}

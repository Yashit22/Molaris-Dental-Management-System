import { getBalanceSeconds, getLedger, secondsToCredits } from '../services/credits.service.js';

// Tenant-facing, READ-ONLY view of the caller's own AI report credits.
// Scoped strictly to req.user.tenantId — a tenant can only ever see its own data.
// Top-ups / adjustments remain super-admin-only (Connect Desk).

// GET /api/credits/balance
export async function getMyBalance(req, res) {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(403).json({ error: 'No tenant assigned' });
    const creditSeconds = await getBalanceSeconds(tenantId);
    res.json({ creditSeconds, credits: secondsToCredits(creditSeconds) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Sanitize a ledger row's meta for the TENANT-facing view. The super admin's
// identity (e.g. connectgenai@gmail.com) and other Connect-Desk-internal fields
// are never exposed to tenants — a super-admin top-up/adjustment is surfaced as
// a neutral "Automated increment". The raw row is untouched in the DB and stays
// visible in the Connect Desk (super-admin) view.
function sanitizeMetaForTenant(row) {
  const meta = row.meta || {};
  const isSuperAdminAction = !!meta.by; // topup/adjust/set are stamped with `by`
  if (isSuperAdminAction) {
    // Hide the super admin's identity AND any admin-authored note (which could
    // name them) — surface a neutral label instead.
    return { ...row, meta: { source: 'Automated increment' } };
  }
  // Usage debits: keep patient/duration/report details, drop internal flags.
  const { by, kind, legacy, ...safe } = meta;
  return { ...row, meta: safe };
}

// GET /api/credits/ledger?limit=
export async function getMyLedger(req, res) {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(403).json({ error: 'No tenant assigned' });
    const rows = await getLedger(tenantId, req.query.limit);
    res.json(rows.map(r => {
      const clean = sanitizeMetaForTenant(r);
      return {
        ...clean,
        credits: secondsToCredits(r.seconds),
        balanceCredits: secondsToCredits(r.balanceAfter),
      };
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

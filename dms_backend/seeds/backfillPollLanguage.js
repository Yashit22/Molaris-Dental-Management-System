/**
 * Backfill PollTemplate.language for polls created before polls were language-aware.
 *
 * Polls used to be pinned by id (settings.events.feedbackPoll.pollTemplateId) with no
 * language dimension, so a patient who booked in Hindi still got the English poll.
 * Now polls resolve by the appointment's language, which requires every existing poll
 * to declare one.
 *
 * Rules:
 *   - the poll pinned in WhatsAppSettings is the tenant's primary -> language 'en', stays active
 *   - a poll whose text contains Devanagari                       -> language 'hi', stays active
 *   - any OTHER un-pinned poll is a leftover duplicate. Resolution is now keyed on
 *     (tenantId, language, isActive), so leaving several active polls in the same
 *     language would make the resolver pick an arbitrary one. Those are stamped 'en'
 *     and DEACTIVATED — the content is preserved, it just stops competing.
 *
 * Idempotent: polls that already have a language are left alone.
 *
 * Usage:  node seeds/backfillPollLanguage.js          (dry run)
 *         node seeds/backfillPollLanguage.js --apply  (write)
 */
import 'dotenv/config';
import { connectAnalyticsDb, getAnalyticsDb } from '../config/analyticsDb.js';
import { resolveTenantContext } from '../config/resolveTenantContext.js';

const APPLY = process.argv.includes('--apply');
const DEVANAGARI = /[ऀ-ॿ]/;

async function main() {
  await connectAnalyticsDb();
  const conn = getAnalyticsDb();
  const db = conn.db || conn;
  const tenants = await db.collection('tenants').find({}).toArray();

  let scanned = 0;
  let changed = 0;

  for (const t of tenants) {
    let tenantModels;
    try {
      ({ tenantModels } = await resolveTenantContext(t._id.toString()));
    } catch (err) {
      console.log(`[skip] ${t.name}: ${err.message}`);
      continue;
    }

    const { PollTemplate, WhatsAppSettings } = tenantModels;
    const polls = await PollTemplate.find({}).lean();
    if (!polls.length) continue;

    const settings = await WhatsAppSettings.findOne({}).lean();
    const pinnedId = settings?.events?.feedbackPoll?.pollTemplateId || null;

    console.log(`\n[${t.name}] ${polls.length} poll(s)`);

    for (const p of polls) {
      scanned++;
      if (p.language) {
        console.log(`   = ${p._id} already language=${p.language}`);
        continue;
      }

      const isPinned = pinnedId && p._id.toString() === pinnedId.toString();
      const text = `${p.name} ${(p.options || []).join(' ')}`;
      const isHindi = DEVANAGARI.test(text);
      const lang = isHindi ? 'hi' : 'en';

      // Keep exactly one active poll per language: the pinned primary, or a genuine
      // non-English poll. Everything else is a leftover duplicate — preserve it but
      // deactivate it so it can't win an arbitrary findOne.
      const keepActive = isPinned || isHindi;
      const set = { language: lang };
      if (!keepActive) set.isActive = false;

      const note = isPinned ? ' (pinned/primary)' : isHindi ? ' (hindi)' : ' (duplicate → deactivated)';
      console.log(
        `   ${APPLY ? '+' : '~'} ${p._id} -> ${lang}${note}  "${String(p.name).replace(/\s+/g, ' ').slice(0, 45)}"`,
      );

      if (APPLY) {
        await PollTemplate.updateOne({ _id: p._id }, { $set: set });
      }
      changed++;
    }
  }

  console.log(
    `\n${APPLY ? 'Updated' : 'Would update'} ${changed} of ${scanned} poll(s).` +
      (APPLY ? '' : '  Re-run with --apply to write.'),
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

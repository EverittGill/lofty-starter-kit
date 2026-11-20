// Writes the KTS drips into the FUB-to-Lofty Chrome extension's data folder, so the extension
// uploads the kit's cleaned emails (this agent's website, links and brokerage filled in, and the
// merge fields already swapped for Lofty variables) instead of the copies it shipped with.
//
//   node tools/build-lofty-extension-data.mjs          (writes into ./extension/data)
//
// Needs config.json (website, links, brokerage) and lofty/variable-map.json filled in.
// Steps Lofty has no match for become tasks with plain instructions:
//   stop another plan / pause other plans / change stage  ->  a Follow Up task saying what to do.
import fs from 'node:fs';
import path from 'node:path';

const extDir = process.argv[2] || 'extension';
if (!fs.existsSync(path.join(extDir, 'manifest.json'))) {
  console.error('Usage: node tools/build-lofty-extension-data.mjs <path to the extension folder (the one with manifest.json)>');
  process.exit(1);
}
if (!fs.existsSync('config.json')) { console.error('Make config.json first: cp config.example.json config.json, then fill it in.'); process.exit(1); }

const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const vmap = JSON.parse(fs.readFileSync('lofty/variable-map.json', 'utf8'));
const plans = JSON.parse(fs.readFileSync('data/action-plans.json', 'utf8'));
const templates = JSON.parse(fs.readFileSync('data/email-templates.json', 'utf8'));
const byKey = Object.fromEntries(templates.map(t => [t.key, t]));
const planName = key => plans.find(p => p.key === key)?.name ?? `plan ${key}`;

const fill = s => (s ?? '')
  .replaceAll('{{WEBSITE}}', cfg.website.replace(/\/$/, ''))
  .replaceAll('{{ABOUT_ME_URL}}', cfg.aboutMeUrl || cfg.website)
  .replaceAll('{{GOOGLE_REVIEWS_URL}}', cfg.googleReviewsUrl || cfg.website)
  .replaceAll('{{BROKERAGE}}', cfg.brokerage)
  .replaceAll('{{SELLERS_GUIDE_URL}}', cfg.sellersGuideUrl || cfg.website);
const missing = new Set();
const swap = s => s.replace(/%[a-z_]+%/g, m => {
  const v = vmap[m]?.lofty;
  if (!v) { missing.add(m); return m; }
  return v.startsWith('text:') ? v.slice(5) : v;
});

// --- Triggers, taken from the kit's capture of the source account (data/automations.json) ---
// kind: 'tag' (start when one of these tags is added), 'stage' (start when the lead moves to one of
// these pipeline stages), 'calendar' (date-based: skipped, set up in Lofty), 'byHand' (uploaded with
// no trigger; the note says what started it in Follow Up Boss), 'manual' (started by a lead source).
const automations = JSON.parse(fs.readFileSync('data/automations.json', 'utf8'));
const list = d => (d ?? '').replace(/^.*?:\s*/, '').split(/,\s*/).map(x => x.trim()).filter(Boolean);
const HWC = ['A - Hot 1-3 Months', 'B - Warm 3-6 Months', 'C - Cold 6+ Months'];
// Start when the lead moves to one of these stages AND has this tag (Lofty's pipeline trigger with a tag filter).
const STAGE_TAG = {
  '*KTS AP Nurture Buyer': { stages: HWC, tag: 'Buyer', keepOnStageChange: true, note: 'FUB also started it when the Buyer tag was added to a lead already in one of those stages, and left out leads tagged past client, sphere or RENTER.' },
  '*KTS AP Nurture Seller': { stages: HWC, tag: 'Seller', keepOnStageChange: true, note: 'FUB also started it when the Seller tag was added to a lead already in one of those stages, and left out leads tagged past client, sphere or RENTER.' },
  '*KTS AP Nurture Buyer + Seller': { stages: HWC, tag: 'Buyer/Seller', keepOnStageChange: true, note: 'FUB also started it when the Buyer/Seller tag was added to a lead already in one of those stages, and left out leads tagged past client, sphere or RENTER.' },
  '*KTS AP Buyer Active': { stages: ['Active Client'], tag: 'Buyer', note: 'FUB started it when a deal in the Buyers pipeline moved to Buyer Contract. Here it is a lead stage plus the Buyer tag; change the stage if yours differs.' },
  '*KTS AP Buyer Pending': { stages: ['Pending'], tag: 'Buyer', note: 'FUB started it when a deal in the Buyers pipeline moved to Pending.' },
  '*KTS AP Seller Listed': { stages: ['Active Client'], tag: 'Seller', note: 'FUB started it when a deal in the Sellers pipeline moved to Listed. Here it is a lead stage plus the Seller tag; change the stage if yours differs.' },
  '*KTS AP Seller Pending': { stages: ['Pending'], tag: 'Seller', note: 'FUB started it when a deal in the Sellers pipeline moved to Pending.' },
};
const BY_HAND = {
  '*KTS AP Need to know if buyer, seller, buyer/seller, luxury etc.': 'In FUB: stage changes to A - Hot, B - Warm or C - Cold and the lead has none of the tags Buyer, Seller, Buyer/Seller, past client, sphere, RENTER, expired, fsbo.',
  '*KTS AP Seller Pre-Listed': 'In FUB: a deal in the Sellers pipeline moves to Pre-Listing. Apply it by hand or use your own stage.',
  '*KTS AP Pause action plans': 'In FUB: stage changes to Active Client or Archive, or a Ylopo AI Voice tag is added. Its one step pauses the lead\'s other drips.',
  '*KTS AP New Open House Lead - Manual - Task': 'In FUB: the tag "open house" is added and Open House Address is EMPTY. (The "- Manual" plan has the open house tag trigger; with both on that tag a lead would get both.)',
  'AP Unsubscribed': 'In FUB: an inquiry arrives from a lead tagged Unsubscribed / NOTEXT / do_not_text / optout.',
};
const leadFlow = Object.fromEntries(JSON.parse(fs.readFileSync('data/lead-flow.json', 'utf8')).map(x => [x.worker, x.leadSources]));
function triggerFor(name) {
  if (BY_HAND[name]) return { kind: 'byHand', note: BY_HAND[name] };
  if (STAGE_TAG[name]) return { kind: 'stageTag', ...STAGE_TAG[name] };
  if (name === '*KTS AP Recent Online Activity') return { kind: 'activity', activities: ['viewListing', 'saveListings'], days: 7, note: 'FUB also required: created more than 30 days ago, no contact for 14 days, stage Lead / Warm / Cold / Archive / Renter, and not tagged past client or sphere.' };
  const feeders = automations.filter(a => a.steps.some(s => s.kind === 'runAutomation' && s.automation === name));
  const trig = feeders.flatMap(a => a.triggers.filter(t => t.type !== 'Manual'));
  const filters = feeders.flatMap(a => a.steps.filter(s => s.kind === 'condition').flatMap(s => s.rules));
  const note = filters.length ? `FUB also required: ${[...new Set(filters)].join('; ')}. Add that as a condition in Lofty if you want it.` : undefined;
  if (!trig.length) return { kind: 'manual', note: leadFlow[name] ? `New-lead drip. In FUB it started for new leads from: ${leadFlow[name].join('; ')}. Attach it to your matching lead source.` : (/ New /.test(name) || /Branded Website/.test(name) ? 'New-lead drip. Attach it to your matching lead source, or apply it by hand.' : undefined) };
  if (trig.every(t => t.type === 'Calendar Date')) return { kind: 'byHand', note: `Yearly drip. In FUB it started on the date: ${trig.map(t => t.detail).join('; ')}, and each email is 365 days after the one before. Use Lofty's date-based option (birthday / anniversary) to start it.` };
  if (trig.every(t => t.type === 'Tag Added')) return { kind: 'tag', tags: [...new Set(trig.flatMap(t => list(t.detail)))], note };
  if (trig.every(t => t.type === 'Stage Change')) return { kind: 'stage', stages: [...new Set(trig.flatMap(t => list(t.detail)))], note };
  return { kind: 'byHand', note: `In FUB: ${trig.map(t => `${t.type} ${t.detail ?? ''}`).join(' / ')}` };
}
const worker = name => automations.find(a => a.name === name);

const KEEP_RUNNING = ['Happy Birthday', 'Happy Birthday - Relationship', 'Home Anniversary', 'Home Anniversary - Agnostic'];
const task = (s, name) => ({ action: 'createTask', position: s.position, runAfterDays: s.runAfterDays, taskType: 'Follow Up', taskName: name });

// In Lofty a task step HOLDS the plan until someone marks the task complete (seen live, Nov 2026).
// In Follow Up Boss it doesn't. So a reminder step ("pause other plans", "pause plan X", "change
// stage") that has steps after it is taken out of the flow and listed in finishNotes instead.
// Reminder steps at the very end stay as tasks: nothing waits behind them.
const REMINDERS = new Set(['stopPlan', 'stopOtherPlans', 'changeStage']);
const reminderText = s => s.action === 'stopPlan' ? `pause the Smart Plan "${planName(s.stopPlanKey)}" for the lead`
  : s.action === 'stopOtherPlans' ? `pause the lead's other KTS Smart Plans (FUB left ${KEEP_RUNNING.join(', ')} running)`
  : `move the lead to the stage "${s.stage}"`;
function splitReminders(steps) {
  const sorted = steps.slice().sort((a, b) => a.position - b.position);
  let lastReal = -1;
  sorted.forEach((s, i) => { if (!REMINDERS.has(s.action) && s.action !== 'addNote') lastReal = i; });
  const kept = [], finishNotes = [];
  let carry = 0;
  sorted.forEach((s, i) => {
    if (REMINDERS.has(s.action) && i < lastReal) {
      carry += s.runAfterDays || 0;
      finishNotes.push(`In FUB this drip's step ${i + 1} was: ${reminderText(s)}. Left out, because a task step holds a Lofty plan until it is ticked off. Do it by hand when the plan starts, or add Lofty's own step for it in the plan editor.`);
    } else {
      kept.push(carry ? { ...s, runAfterDays: (s.runAfterDays || 0) + carry } : s);
      carry = 0;
    }
  });
  return { kept, finishNotes };
}

const usedTemplates = new Set();
const actionPlans = plans.map(p => { const { kept, finishNotes } = splitReminders(p.steps); return ({
  id: p.key,
  name: p.name,
  stepCount: kept.length,
  finishNotes,
  trigger: triggerFor(p.name),
  pauseOnReply: !!(p.stopOnContacted || worker(p.name)?.pauseWhenLeadResponds),
  firstText: p.initialTextMessageEnabled ? { body: swap(p.initialTextMessage), delayMinutes: p.delaySmsMinutes } : undefined,
  steps: kept.map(s => {
    switch (s.action) {
      case 'sendEmail': usedTemplates.add(s.emailTemplateKey);
        return { action: 'sendEmail', position: s.position, runAfterDays: s.runAfterDays, emailTemplateId: s.emailTemplateKey };
      case 'addTags': case 'removeTags':
        return { action: s.action, position: s.position, runAfterDays: s.runAfterDays, tags: s.tags };
      case 'createTask':
        return task(s, s.taskName);
      case 'addNote':
        return { action: 'addNote', position: s.position, runAfterDays: s.runAfterDays, noteDesc: s.note };
      case 'stopPlan':
        return task(s, `Pause the Smart Plan "${planName(s.stopPlanKey)}" for this lead`);
      case 'stopOtherPlans':
        return task(s, `Pause this lead's other KTS Smart Plans (leave ${KEEP_RUNNING.join(', ')} running)`);
      case 'changeStage':
        return task(s, `Move this lead to the stage: ${s.stage}`);
      default:
        return task(s, `KTS step "${s.action}" has no Lofty match: check the plan sheet`);
    }
  }),
}); });

const tplOut = {};
for (const key of usedTemplates) {
  const t = byKey[key];
  if (!t) { console.error(`Email template ${key} is missing from data/email-templates.json`); process.exit(1); }
  tplOut[key] = { id: key, name: t.name, subject: swap(fill(t.subject)), body: swap(fill(t.body)) };
}
if (missing.size) {
  console.error('These merge fields need a Lofty value in lofty/variable-map.json first:\n  ' + [...missing].join('\n  '));
  process.exit(1);
}
const leftovers = Object.values(tplOut).filter(t => /\{\{[A-Z_]+\}\}/.test(t.subject + t.body)).length;
if (leftovers) { console.error(`${leftovers} emails still contain a {{PLACEHOLDER}}: check config.json`); process.exit(1); }

const meta = { source: 'lofty-starter-kit', builtAt: new Date().toISOString(), website: cfg.website, brokerage: cfg.brokerage };
fs.mkdirSync(path.join(extDir, 'data'), { recursive: true });
fs.writeFileSync(path.join(extDir, 'data/action-plans.json'), JSON.stringify({ _metadata: meta, actionPlans }, null, 1));
fs.writeFileSync(path.join(extDir, 'data/templates.json'), JSON.stringify({ _metadata: meta, templates: tplOut }, null, 1));
const unconfirmed = Object.entries(vmap).filter(([k, v]) => k.startsWith('%') && v.lofty && !v.confirmed).length;
const kinds = {}; for (const p of actionPlans) kinds[p.trigger.kind] = (kinds[p.trigger.kind] || 0) + 1;
console.log('Triggers:', JSON.stringify(kinds));
console.log(`Wrote ${actionPlans.length} plans and ${Object.keys(tplOut).length} emails to ${extDir}/data`);
if (unconfirmed) console.log(`Note: ${unconfirmed} Lofty variables are not yet confirmed in Lofty's variable picker (lofty/variable-map.json).`);
console.log('Reload the extension in chrome://extensions so it picks up the new data.');

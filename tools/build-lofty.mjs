// Turns KTS drips into Lofty build sheets: every step with its wait, and every email with the
// FUB merge fields swapped for Lofty variables and the {{PLACEHOLDERS}} filled from config.json.
// Lofty's API can't create templates or Smart Plans, so these sheets are what gets built on screen.
//
//   node tools/build-lofty.mjs --list                       list the drips
//   node tools/build-lofty.mjs "Seller Listed" "Sphere"     build the drips whose names contain these
//   node tools/build-lofty.mjs --all                        build all 47
//
// Output: lofty/build/<drip>/index.html (open in a browser: each email rendered, ready to copy)
//         lofty/build/<drip>/README.md  (the Smart Plan steps, in order, with waits)
// It stops if a drip needs a merge field that lofty/variable-map.json hasn't mapped yet.
import fs from 'node:fs';

const plans = JSON.parse(fs.readFileSync('data/action-plans.json', 'utf8'));
const templates = Object.fromEntries(JSON.parse(fs.readFileSync('data/email-templates.json', 'utf8')).map(t => [t.key, t]));
const vmap = JSON.parse(fs.readFileSync('lofty/variable-map.json', 'utf8'));
const args = process.argv.slice(2);

if (!args.length || args.includes('--list')) {
  for (const p of plans) console.log(`${String(p.steps.filter(s => s.action === 'sendEmail').length).padStart(3)} emails  ${p.name}`);
  if (!args.length) console.log('\nUsage: node tools/build-lofty.mjs "<part of a drip name>" ... | --all');
  process.exit(0);
}

const cfg = fs.existsSync('config.json') ? JSON.parse(fs.readFileSync('config.json', 'utf8')) : null;
if (!cfg) { console.error('Make config.json first: cp config.example.json config.json, then fill in website, links and brokerage.'); process.exit(1); }
const fill = s => (s ?? '')
  .replaceAll('{{WEBSITE}}', cfg.website.replace(/\/$/, ''))
  .replaceAll('{{ABOUT_ME_URL}}', cfg.aboutMeUrl || cfg.website)
  .replaceAll('{{GOOGLE_REVIEWS_URL}}', cfg.googleReviewsUrl || cfg.website)
  .replaceAll('{{BROKERAGE}}', cfg.brokerage)
  .replaceAll('{{SELLERS_GUIDE_URL}}', cfg.sellersGuideUrl || cfg.website);

const chosen = args.includes('--all') ? plans
  : plans.filter(p => args.some(a => p.name.toLowerCase().includes(a.toLowerCase())));
if (!chosen.length) { console.error('No drip matched. Run with --list to see the names.'); process.exit(1); }

// Check every merge field the chosen drips use is mapped.
const used = new Set();
for (const p of chosen) for (const s of p.steps) if (s.action === 'sendEmail') {
  const t = templates[s.emailTemplateKey];
  for (const m of ((t?.subject ?? '') + (t?.body ?? '')).match(/%[a-z_]+%/g) ?? []) used.add(m);
}
const missing = [...used].filter(m => !vmap[m]?.lofty);
if (missing.length) {
  console.error('These merge fields need a Lofty value in lofty/variable-map.json first:');
  for (const m of missing) console.error(`  ${m}  (${vmap[m]?.means ?? 'not in the map: add it'})`);
  process.exit(1);
}
const unconfirmed = [...used].filter(m => !vmap[m].confirmed);
const swap = s => s.replace(/%[a-z_]+%/g, m => { const v = vmap[m].lofty; return v.startsWith('text:') ? v.slice(5) : v; });

const planName = key => plans.find(p => p.key === key)?.name ?? `plan ${key}`;
const slug = s => s.replace(/^\*/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const when = d => d === 0 ? 'same day as the step before' : `${d} day${d === 1 ? '' : 's'} after the step before`;

for (const p of chosen) {
  const dir = `lofty/build/${slug(p.name)}`;
  fs.mkdirSync(dir, { recursive: true });
  const md = [`# ${p.name} (Lofty build sheet)`, '',
    `Smart Plan name: **${p.name}**. Build it with auto-apply **off**. Waits count from the step before.`,
    `Stop when the lead replies (FUB "stop when contacted"): **${p.stopOnContacted ? 'yes' : 'no'}**.`, ''];
  if (p.initialTextMessageEnabled) md.push(`First text (FUB sent it from lead flow, ${p.delaySmsMinutes} min after the lead arrived): "${swap(p.initialTextMessage)}"`, '');
  md.push('| # | When | Lofty step | Detail |', '|---|---|---|---|');
  const cards = [];
  let n = 0;
  for (const s of p.steps) {
    let what, detail;
    if (s.action === 'sendEmail') {
      const t = templates[s.emailTemplateKey]; n++;
      what = 'Send email'; detail = `Email ${n}: subject "${swap(fill(t.subject))}" (copy from index.html, card ${n})`;
      cards.push(`<section><h2>Email ${n} &middot; ${esc(when(s.runAfterDays))}</h2><p class="meta">Template name: <b>${esc(t.name)}</b><br>Subject: <b>${esc(swap(fill(t.subject)))}</b></p><div class="body">${swap(fill(t.body))}</div></section>`);
    } else if (s.action === 'addTags') { what = 'Add tag'; detail = s.tags.join(', '); }
    else if (s.action === 'removeTags') { what = 'Remove tag'; detail = s.tags.join(', '); }
    else if (s.action === 'stopPlan') { what = 'Pause/stop another Smart Plan'; detail = planName(s.stopPlanKey); }
    else if (s.action === 'stopOtherPlans') { what = 'Pause other Smart Plans'; detail = 'Only the other KTS plans; leave Happy Birthday, Happy Birthday - Relationship, Home Anniversary and Home Anniversary - Agnostic running (owner decision).'; }
    else if (s.action === 'changeStage') { what = 'Change stage'; detail = s.stage ?? JSON.stringify(s); }
    else if (s.action === 'createTask') { what = 'Create task'; detail = `${s.taskType ?? "Task"}: ${s.taskName ?? JSON.stringify(s)}`; }
    else if (s.action === 'addNote') { what = 'Add note'; detail = s.note ?? s.body ?? JSON.stringify(s); }
    else { what = s.action; detail = JSON.stringify(s); }
    md.push(`| ${s.position} | ${when(s.runAfterDays)} | ${what} | ${String(detail).replace(/\|/g, '/')} |`);
  }
  md.push('', `Steps: ${p.steps.length}. Emails: ${n}.`);
  if (unconfirmed.length) md.push('', `Not yet checked against Lofty's variable picker: ${unconfirmed.join(', ')}.`);
  fs.writeFileSync(`${dir}/README.md`, md.join('\n') + '\n');
  fs.writeFileSync(`${dir}/index.html`, `<!doctype html><meta charset="utf-8"><title>${esc(p.name)}</title>
<style>body{font:15px/1.5 -apple-system,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#222;background:#fff}
section{border:1px solid #ccc;border-radius:8px;padding:16px;margin:16px 0}h2{font-size:16px;margin:0 0 8px}.meta{color:#555;font-size:13px}.body{border-top:1px dashed #ccc;padding-top:12px}</style>
<h1>${esc(p.name)}</h1><p>Copy each email body (inside the dashed line) into the Lofty template editor. Variables like #lead_first_name# are Lofty's own.</p>
${cards.join('\n')}`);
  console.log(`${dir}  (${p.steps.length} steps, ${n} emails)`);
}
if (unconfirmed.length) console.log(`\nStill to confirm in Lofty's variable picker: ${unconfirmed.join(', ')}`);

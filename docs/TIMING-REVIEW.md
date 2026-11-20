# On/off, timing and overlap review (2026-11-19)

A check of the captured automations (`data/automations.json`), action plans, lead flows and smart lists
for anything that would make the rebuilt system fire at the wrong time, or not at all.

## 1. On/off

- **In the source account every automation is off**, and no lead source starts any of them (see 2).
  The source account isn't running KTS today.
- **In a new account, build everything off.** Switch on in pairs: the trigger **and** the worker it
  runs. We haven't confirmed whether FUB runs a worker that is off when a trigger calls it, so the
  first test should prove it: trigger on and worker off, then add the tag and see whether anything
  happens.
- Switch-on order: the new-lead workers and their lead flows; then Post Closing, Sphere Nurture,
  Birthday and Home Anniversary; then the Hot/Warm/Cold nurtures; then the Ylopo pieces (only with
  Ylopo).

## 2. Lead flow: this is how new leads get their drip

The new-lead workers (New Buyer Lead, Branded Website, Zillow, Home Valuation and the rest) have **no
trigger of their own**. Only the Lead Flow page starts them. In the source account, moving to
Automations 2.0 left every lead flow on **"Automation: No automation"**, and the KTS lead sources are
archived. What they were attached to before is still recorded on the classic plans:

| Worker | Lead source (rule) |
|---|---|
| New Buyer Lead - delayed text | Ylopo • Buyers (default rule) |
| New Ylopo Direct Connect | Ylopo • Buyers (rule: tags YLOPO_DIRECT_CONNECT_FB or _PPC), Direct Connect FB, Direct Connect PPC, Ylopo Seller (rule 1, same tags) |
| New Seller Lead - Cash Offer | Ylopo Seller (rule 2: tag Y_SELLER_CASH_OFFER_REQUESTED) |
| Automated Valuation Engagement - Ylopo | Ylopo Seller (default rule) |
| Branded Website - New Form | Branded Website |
| Branded Website - Realtor.com | realtordotcom (Sellers), UpNest by Realtor.com (Sellers) |

**In the new account:** for each lead source they get, open Admin → Lead Flow and set **Automation**
to the matching worker. Zillow, Realtor.com and the agent's own website use the matching New… worker.

### The first text

Fourteen KTS plans start with an automatic text (for example "Hi {first name}. This is {agent} with
{company}. I just received your request…"), some sent right away and some after a delay (1, 45 or 60
minutes, or 24 hours). FUB's help center says a plan's first text
**only sends when the plan is applied from the Lead Flow page, not when an automation starts it**,
and the automations have no text step. So, in the new account:

- Put the first text in the lead flow's **initial response / auto outreach** message box for each
  source, with the same delay. The exact wording for each is in `data/action-plans.json`
  (`initialTextMessage` and `delaySmsMinutes`).
- Each of those texts already tells the lead how to stop texts. Keep that line.

## 3. Timing

- **Waits count from the step before**, and every one is a plain "wait, then run". None is set to a
  time of day.
- **Every email only goes out between 8:00 am and 7:00 pm**, in the FUB account's time zone. Set the
  new account's time zone first (Admin → Settings).
- **Birthday and Home Anniversary** start on the day itself ("is in 0 days"), run once per person,
  then wait 365 days between emails for up to 19 years. 365-day waits drift one day every four years
  (leap years), which is harmless.
- **Same-day pairs:** Nurture Seller and New Buyer Lead - referral source each have one spot where two
  emails go out back to back on the same day. That's in the original KTS plans too.
- The long drips really are long: Post Closing runs about 11.5 years, Nurture Buyer + Seller about
  5 years, Sphere Nurture about 5 years.

## 4. Re-entry and overlap

- **Each person goes through each drip once.** "Repeat this automation" is off on every KTS worker
  and trigger, except two tag-cleanup automations (Remove Handraiser tag, Tag Removals - Ylopo).
  Someone who goes nurture → active → back to nurture won't restart the nurture drip. That matches
  the source.
- **Two triggers feed each nurture worker** (one on the tag, one on the stage). Because the worker
  doesn't repeat, a person who gets both should still go through it once. Test this.
- **Pausing other drips (changed on purpose).** In the source, 11 workers start by pausing **all**
  automations for that person, which would also stop the yearly Birthday and Home Anniversary drips.
  **The owner decided (2026-11-19) that these pause only the other KTS drips.** Each of those sheets
  lists the 32 drips to select under "Pause selected automation(s)" and marks the step "changed from
  source". Happy Birthday, Happy Birthday - Relationship, Home Anniversary and Home Anniversary -
  Agnostic keep running.
- **"Pause when the lead responds"** is on for the new-lead, Stale, Recent Online Activity and Ylopo
  workers, and off for nurture, Post Closing, Sphere, Birthday and Anniversary. That matches the
  source.

## 5. Smart lists

The 13 KTS smart lists (`docs/SMART-LISTS.md`) are the daily call lists that go with the drips. They
filter on the stages above plus **Pending**, which the import script now creates. They use the tags the
Ylopo pieces add, so without Ylopo some lists (Handraisers, Automated Valuation Engaged) stay mostly
empty. That's expected.

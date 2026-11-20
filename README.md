# KTS Drips to Lofty

A small Chrome extension that puts the KTS follow-up system (47 email drips, 490 emails) into your
Lofty account as Smart Plans. Every plan arrives as a **personal draft with auto-apply off**, so
nothing is sent to anyone until you apply a plan to a lead or turn it on.

It is not an official Lofty product. It uses the same requests Lofty's website makes while you are
logged in, and Lofty could change that at any time.

## Set it up (about 5 minutes)

1. On this page click the green **Code** button, then **Download ZIP**. Unzip it.
2. In Chrome go to `chrome://extensions`, turn on **Developer mode** (top right), click
   **Load unpacked**, and choose the unzipped folder.
3. Log in at [crm.lofty.com](https://crm.lofty.com) and leave that tab open.
4. Click the puzzle-piece icon in Chrome's toolbar and choose **KTS Drips to Lofty**. It opens in
   its own tab.

## Use it

1. **Your details.** Your website and brokerage are filled in from your Lofty account. Fix them if
   they are wrong (for example, if you use a different website than your Lofty one), add your About
   page and Google review link if you have them, and press **Save**. These go into the emails.
2. **Lofty connection** should say Connected. If not, reload the Lofty tab and press
   **Check Connection**.
3. **Tags.** Press **Check tags**, then **Create missing tags**. The drips need these tags to work.
   If you are on a team account, the tags are added for the whole team, so ask your team lead first.
4. **Pick drips.** Start with just `*KTS AP Seller Listed`, press **Upload**, and look at it in
   Lofty under Smart Plans. Then upload the rest, a few at a time. Skip anything with "Ylopo" in
   the name unless you use Ylopo. Keep this tab open while it uploads.
5. **The "to finish" list** appears when an upload ends. Press **Copy** and save it somewhere. It
   tells you, for each drip, what still needs doing in Lofty: which trigger was set and should be
   checked, which drips need you to pick a lead source, and the wording of each first text.

## Test before you turn anything on

Make a lead with your own email address, open it, go to **Automations**, add a Smart Plan and pick
`*KTS AP Seller Listed`. The first email should arrive within about ten minutes. Check your first
name and your website links look right, then remove the plan from that lead.

## Good to know

- Triggers look for these lead stages by name: Hot 1-3 Months, Warm 3-6 Months, Cold 6+ Months,
  Active Client, Pending, Past Client, Sphere, Renter to Buyer. If yours are named differently, the
  drip uploads without a trigger and the list tells you.
- It doesn't create text messages. The first text for each new-lead drip is in the list for you to
  add by hand if you want it.
- A drip uploaded once is skipped next time. "Forget upload history" resets that.
- If an upload fails with a message you don't understand, stop and send the log to Everitt.

Private. Please don't share it further.

# Smart lists

Read from the source account on 2026-11-19. FUB has no way to import smart lists, so build each one in
**People → Smart Lists → New**: add every filter below (a list shows people who match **all** of them),
set the columns, and name it exactly as shown, emoji included. Filters that are dates ("more than 7 days
ago") use the "was more than" option. Copy tag lists exactly; spelling matters.

The 13 KTS lists work as a daily call list: start at the top and work down.

## KTS daily call lists (13)

### 🤩 Active & Pending Clients

_A static list of the clients you are currently working with. This smart list displays everyone in current (active/signed) and pending (under contract) stages._

Filters (all must match):

- Stage includes any of: Active Client or Pending

Columns: Created, Stage, Source, Last Visit, Pages Viewed, Properties Viewed, Properties Saved, Last Communication, Calls Made, Texts Sent, Emails Sent, Last Marketing Message Reply

### 🚨 New Leads: No Call Attempt

_New leads (added to FUB within the past 14 days) with a valid phone number and no logged phone call._

Filters (all must match):

- Last Call is empty
- Phone is good
- Created less than 14 days ago
- Stage includes any of: Lead

Columns: Created, Stage, Source, Last Visit, Pages Viewed, Properties Viewed, Properties Saved, Last Communication, Calls Made, Texts Sent, Emails Sent, Last Marketing Message Reply

### 📞 New Leads: Not Reached/Daily

_New leads (added to FUB within the past 14 days) you are continuing to try and connect with once a day. Requires a manual call, text, or email._

Filters (all must match):

- Last Sent Email more than 1 day ago
- Last Text Sent more than 1 day ago
- Last Call Made more than 1 day ago
- Calls Made is less than 10
- Last Call is not empty
- Phone is good
- Created less than 14 days ago
- Stage includes any of: Lead

Columns: Created, Stage, Source, Last Visit, Pages Viewed, Properties Viewed, Properties Saved, Last Communication, Calls Made, Texts Sent, Emails Sent, Last Marketing Message Reply

### 💬 AI Replies

_Contacts you haven't reached out to manually (call, text, or email) in the past day that have replied to a text from the AI digital assistant in the past 14 days. Requires a manual call, text, or email._

Filters (all must match):

- Last Sent Email more than 1 day ago
- Last Text Sent more than 1 day ago
- Last Call Made more than 1 day ago
- Last Marketing Message Reply less than 14 days ago
- Phone is good
- Created more than 14 days ago
- Stage excludes any of: Archive

Columns: Last Marketing Message Reply, Created, Stage, Source, Last Visit, Pages Viewed, Properties Viewed, Properties Saved, Last Communication, Calls Made, Texts Sent, Emails Sent

### ✋ Handraisers

_Contacts you haven't reached out to manually (call, text, or email) in the past day that have what we consider to be a high priority activity tag on their FUB profile and have been recently active on a platform, lead source, or website integrated with your FUB account. Requires a manual call, text, or email and/or manually removing the tag(s) from their profiles._

Filters (all must match):

- Last Sent Email more than 1 day ago
- Last Text Sent more than 1 day ago
- Last Call Made more than 1 day ago
- Last Activity less than 1 day ago
- Tags include any of: AI VOICE, AI_VOICES_NEEDS_FOLLOW_UP, CALLBACK_SCHEDULED, ISA_TRANSFER_UNSUCCESSFUL, ISA_ATTEMPTED_TRANSFER, ISA_ATTEMPTED_TRANSFER_REALTOR_UNAVAILABLE, NURTURE, Y_SELLER_CALL_AGENT, Y_SELLER_EMAIL_AGENT, Y_SELLER_UNDERSTAND_TREND, Y_SELLER_LEARN_MORE_EQUITY, HANDRAISER, call_now="yes", Y_SELLER_HEATMAP_INQUIRY, Y_SELLER_3_VIEW, Y_SELLER_PRIVATE_SHOWING or Y_AI_PRIORITY
- Last Marketing Message Reply more than 14 days ago
- Phone is good
- Created more than 14 days ago
- Stage excludes any of: Active Client or Pending

Columns: Created, Stage, Source, Last Visit, Pages Viewed, Properties Viewed, Properties Saved, Last Communication, Calls Made, Texts Sent, Emails Sent, Last Marketing Message Reply

### 🏠 Automated Valuation Engaged

_Contacts you haven't reached out to manually (call, text, or email) in the past 2 days that have been tagged as viewing their home valuation report in the past 14 days. Requires a manual call, text, or email and/or manually removing the tag(s) from their profiles._

Filters (all must match):

- Last Sent Email more than 2 days ago
- Last Text Sent more than 2 days ago
- Last Call Made more than 2 days ago
- Updated less than 14 days ago
- Tags include any of: Y_SELLER_REPORT_VIEWED, Y_SELLER_SELF_GENERATED, Y_SELLER_REPORT_ENGAGED, Y_SELLER_TUNE_HOME_VALUE, Y_SELLER_NEW_HOME_UPGRADES, Y_SELLER_VIEWED_SIMILAR_LISTINGS, HOMEBOT_ENGAGED, Y_SELLER_SEARCH_MORE_PROPERTIES or Y_SELLER_SEE_MORE_LISTINGS
- Tags exclude any of: AI VOICE, AI_VOICES_NEEDS_FOLLOW_UP, CALLBACK_SCHEDULED, ISA_TRANSFER_UNSUCCESSFUL, ISA_ATTEMPTED_TRANSFER, ISA_ATTEMPTED_TRANSFER_REALTOR_UNAVAILABLE, NURTURE, Y_SELLER_CALL_AGENT, Y_SELLER_EMAIL_AGENT, Y_SELLER_UNDERSTAND_TREND, Y_SELLER_LEARN_MORE_EQUITY, HANDRAISER, call_now="yes", Y_SELLER_HEATMAP_INQUIRY, Y_SELLER_3_VIEW or Y_SELLER_PRIVATE_SHOWING
- Last Marketing Message Reply more than 14 days ago
- Phone is good
- Created more than 14 days ago
- Stage excludes any of: Archive, Active Client or Pending

Columns: Created, Stage, Source, Last Visit, Pages Viewed, Properties Viewed, Properties Saved, Last Communication, Calls Made, Texts Sent, Emails Sent, Last Marketing Message Reply

### 💻 Recent Online Activity

_Contacts you haven't reached out to manually (call, text, or email) in the past 2 days that have been recently active on a platform, lead source, or website integrated with your FUB account._

Filters (all must match):

- Last Sent Email more than 2 days ago
- Last Text Sent more than 2 days ago
- Last Call Made more than 2 days ago
- Last Activity less than 14 days ago
- Tags exclude any of: AI VOICE, AI_VOICES_NEEDS_FOLLOW_UP, CALLBACK_SCHEDULED, ISA_TRANSFER_UNSUCCESSFUL, ISA_ATTEMPTED_TRANSFER, ISA_ATTEMPTED_TRANSFER_REALTOR_UNAVAILABLE, NURTURE, Y_SELLER_CALL_AGENT, Y_SELLER_EMAIL_AGENT, Y_SELLER_UNDERSTAND_TREND, Y_SELLER_LEARN_MORE_EQUITY, HANDRAISER, call_now="yes", Y_SELLER_REPORT_VIEWED, Y_SELLER_REPORT_ENGAGED, Y_SELLER_SELF_GENERATED, Y_SELLER_VIEWED_SIMILAR_LISTINGS, Y_SELLER_TUNE_HOME_VALUE, Y_SELLER_NEW_HOME_UPGRADES, HOMEBOT_ENGAGED, Y_SELLER_HEATMAP_INQUIRY, Y_SELLER_SEARCH_MORE_PROPERTIES, Y_SELLER_3_VIEW, Y_SELLER_PRIVATE_SHOWING or Y_SELLER_SEE_MORE_LISTINGS
- Last Marketing Message Reply more than 14 days ago
- Phone is good
- Created more than 14 days ago
- Stage excludes any of: Archive, Active Client or Pending

Columns: Created, Stage, Source, Last Visit, Pages Viewed, Properties Viewed, Properties Saved, Last Communication, Calls Made, Texts Sent, Emails Sent, Last Marketing Message Reply

### 🔥 Hot/Weekly

_Contacts in your hot stage(s) - this smart list reminds you to reach out to these leads at least once every 7 days. Requires a manual call, text, or email._

Filters (all must match):

- Last Sent Email more than 7 days ago
- Last Text Sent more than 7 days ago
- Last Call Made more than 7 days ago
- Stage includes any of: A - Hot 1-3 Months

Columns: Created, Stage, Source, Last Visit, Pages Viewed, Properties Viewed, Properties Saved, Last Communication, Calls Made, Texts Sent, Emails Sent, Last Marketing Message Reply

### 🌤 Warm/Bi-Weekly

_Contacts in your warm stage(s) - this smart list reminds you to reach out to these leads at least once every 14 days. Requires a manual call, text, or email._

Filters (all must match):

- Last Sent Email more than 14 days ago
- Last Text Sent more than 14 days ago
- Last Call Made more than 14 days ago
- Stage includes any of: B - Warm 3-6 Months

Columns: Created, Stage, Source, Last Visit, Pages Viewed, Properties Viewed, Properties Saved, Last Communication, Calls Made, Texts Sent, Emails Sent, Last Marketing Message Reply

### ❄ Cold/Bi-Monthly

_Contacts in your cold stage(s) - this smart list reminds you to reach out to these leads at least once every 60 days. Requires a manual call, text, or email._

Filters (all must match):

- Last Sent Email more than 60 days ago
- Last Text Sent more than 60 days ago
- Last Call Made more than 60 days ago
- Stage includes any of: C - Cold 6+ Months or Renter - future buyer

Columns: Created, Stage, Source, Last Visit, Pages Viewed, Properties Viewed, Properties Saved, Last Communication, Calls Made, Texts Sent, Emails Sent, Last Marketing Message Reply

### 🤝 Past Clients/Sphere: Quarterly

_Contacts in your past client and sphere stages - this smart list reminds you to reach out to these contacts at least once every 90 days. Requires a manual call, text, or email._

Filters (all must match):

- Last Sent Email more than 90 days ago
- Last Text Sent more than 90 days ago
- Last Call Made more than 90 days ago
- Stage includes any of: Past Client or Sphere

Columns: Created, Stage, Source, Last Visit, Pages Viewed, Properties Viewed, Properties Saved, Last Communication, Calls Made, Texts Sent, Emails Sent, Last Marketing Message Reply

### 😮 Old Leads: No Call Attempt

_14+ day-old leads with a valid phone number and no logged phone call._

Filters (all must match):

- Last Call is empty
- Phone is good
- Created more than 14 days ago
- Stage includes any of: Lead

Columns: Created, Stage, Source, Last Visit, Pages Viewed, Properties Viewed, Properties Saved, Last Communication, Calls Made, Texts Sent, Emails Sent, Last Marketing Message Reply

### ☎ Old Leads: Not Reached/Monthly

_14+ day-old leads you are continuing to try and connect with once every 30 days. Requires a manual call, text, or email._

Filters (all must match):

- Last Sent Email more than 30 days ago
- Last Text Sent more than 30 days ago
- Last Call Made more than 30 days ago
- Calls Made is less than 10
- Last Call is not empty
- Phone is good
- Created more than 14 days ago
- Stage includes any of: Lead

Columns: Created, Stage, Source, Last Visit, Pages Viewed, Properties Viewed, Properties Saved, Last Communication, Calls Made, Texts Sent, Emails Sent, Last Marketing Message Reply

## Ylopo AI Voice lists (3, only if you use Ylopo AI Voice / Raiya)

### Leads In The Call Center Cadence

_For Raiya Voice users_

Filters (all must match):

- Created less than 90 days ago
- Tags include any of: YLOPO_AI_VOICE
- Tags exclude any of: DO_NOT_CALL, ISA_TRANSFER_SUCCESSFUL, ISA_TRANSFER_UNSUCCESSFUL, NOT_INTERESTED, NURTURE, WRONG_NUMBER, YLOPO_AI_VOICE_COMPLETED, DECLINED_BY_REALTOR, YLOPO_LSA or ISA_ATTEMPTED_TRANSFER_REALTOR_UNAVAILABLE

Columns: FUB default.

### Leads That Completed The Call Center Cadence

_For Raiya Voice users_

Filters (all must match):

- Tags exclude any of: YLOPO_LSA
- Tags include any of: YLOPO_AI_VOICE
- Tags exclude any of: DO_NOT_CALL, ISA_TRANSFER_SUCCESSFUL, ISA_TRANSFER_UNSUCCESSFUL, NOT_INTERESTED, NURTURE, WRONG_NUMBER, YLOPO_AI_VOICE_COMPLETED, DECLINED_BY_REALTOR or ISA_ATTEMPTED_TRANSFER_REALTOR_UNAVAILABLE

Columns: FUB default.

### AI Voice Needs Follow Up

_For Ylopo AI Voice users only_

Filters (all must match):

- Tags include any of: NURTURE, ISA_TRANSFER_UNSUCCESSFUL, ISA_ATTEMPTED_TRANSFER_REALTOR_UNAVAILABLE, NON_ENGLISH_SPEAKER or ISA_ATTEMPTED_TRANSFER
- Tags include any of: RAIYA_VOICE or YLOPO_AI_VOICE
- Stage includes any of: Lead

Columns: FUB default.

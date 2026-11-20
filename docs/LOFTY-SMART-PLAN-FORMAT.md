# Lofty Smart Plan format, version 2 (captured 2026-11-19)

Lofty rebuilt Smart Plans as a flow builder (Trigger / Condition / Action nodes). The January 2026
endpoint `POST /api/smart-plan-server/settings/save` now answers
`[Code 110003] The smart plan has been upgraded to new version`. Request signing is unchanged.

## Requests the new editor makes

| What | Request |
|---|---|
| Store one email's content | `POST /api/smart-plan-server/settings/draft/lang/templates`, body `[{label:"English",value:"en",status:"published",subject,body,editing:true,lang:"en",id:0}]` -> `{data:[<negative template id>]}` |
| Save a plan | `POST /api/smart-plan-server/settings/save/v2` -> `{data:<plan id>}` |
| Read a plan | `GET /api/smart-plan-server/smartplan/{id}/detail/v2` |
| List plans | `GET /api/smart-plan-server/settings/list/page?accessFlagList=0|1&pageSize=50&pageNo=1&queryName=&sortField=updateTime&sortDesc=true&autoApply=true|false` |
| Pipelines, sources, option lists | `GET /api/smart-plan-server/settings/condition` |
| Pipeline stages | `GET /api/user/stage/list` (the old `/api/user/pipeline/settings` is 404) |

Account ids come from `localStorage["infoData<n>"]`: `teamId`, `userId`, `teamOwnerId`. A new plan
made in the editor is saved with `creatorId = teamOwnerId`.

## Plan body (save/v2)

Top level: `id:0, libraryPlanId:0, scenario:0, teamId, creatorId, name, state:0, accessFlag (0 My
Plan, 1 Company), leadTypeItems:[{type:"one_of"|"equal_to", ids:[1,2,5,6,7,8,9,-1]}], autoPause{…},
triggerConditions:[…], planStepPackListV2:[…], startStepLevel, endStepLevel, reApplySwitch:false,
…` (full list in `extension/services/converter-v2.js`).

Nodes are a linked list. Each has `stepLevel` (`"system&<number>"`), `prev`, `next`,
`previousStepLevels`, `nextStepLevel`, and `relatedNodeStepLevel` = the end node's level.

| Node | Key fields |
|---|---|
| Wait | `stepType:"condition_wait_time", viewType:"condition", type:2, wait:<days>, timing:<ms for hours+minutes>` |
| Auto email | `stepType:"action", leftAction:{type:5, subject, body, name, params:'{"cc2Members":false}', langList:[…], langTemplateIds:[<draft id>], ext:"[]"}` |
| Tag | `leftActionType:"TAG", leftAction:{type:17, addItems:[{id,name}], delItems:[…]}` |
| Custom task | `type:1, leftAction:{type:-1, title, name, subject, body, description:"", remindAssignee:0, reminderType:2, timeType:2}` |
| Call task / text task / notification / auto text | `leftAction.type` 1 / 4 / 13 / 6 (seen in an older plan re-serialized by the editor; not yet sent by this tool) |
| End | `stepType:"end", viewType:"end", type:1, next:[]` |

Triggers (`viewType:"trigger"`, `stepType:"trigger"`, `stepLevel:"TEMP_TRIGGER_<n>"`, `next:[first node]`):

| Trigger | Fields |
|---|---|
| Pipeline changed | `type:6, advancedSpecificParam:"Pipeline", advancedLogic:3, advancedValues:[stage ids], triggerType:"PipelineChanged"` |
| Tag changed | `type:4, advancedSpecificParam:"Tags", advancedLogic:0, advancedValues:[tag ids], triggerType:"TagChanged"` |
| Criteria on a trigger | one per field: `tagLogic:"INCLUDE_ONE"|"INCLUDE_ALL"|"EXCLUDE_ONE"|"EXCLUDE_ALL"|"EXISTS"|"NOT_EXIST", tagIds:[…]`; also pipeline, segment, source, property type, time frame |

The editor also sends `conditionList`, `displayValue` and `displayObj` on triggers. They are UI
state: a plan saved without them opens correctly (verified on plan 1090114).

Other things the new editor offers, not yet captured: triggers Lead Created, Lead Assignment
Changed, Segment Changed, Lead Meets Specified Criteria, Lead Engagement, Lead Date; actions Change
Pipeline, Change Segment, Add Note, Reassignment; conditions Wait Until a Specific Date, Wait Until
an Event, Branch. Waits take days, hours and minutes. The variable picker inserts plain text such
as `#lead_first_name#`.

## Live test, 2026-11-19

`*KTS AP Seller Listed` uploaded as a My Plan with auto apply off (plan 1090114): task, 4 emails,
waits 3 / 7 / 7 days, trigger "Pipeline changed to Active Client" with criteria "Tag, Include One
Of: Seller", lead type "Include one of" all eight types. It opens in the editor and reads as built.

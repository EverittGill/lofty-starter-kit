/**
 * Converter V2: FUB Action Plan -> Lofty Smart Plan, "flow" format.
 *
 * Lofty rebuilt Smart Plans in 2026. The old save endpoint answers
 * [Code 110003] "The smart plan has been upgraded to new version". The new editor saves with
 *   POST /api/smart-plan-server/settings/save/v2
 * and the plan is a linked list of nodes (trigger -> wait / action ... -> end), each with a
 * stepLevel id and prev/next links. Every email's content is first stored with
 *   POST /api/smart-plan-server/settings/draft/lang/templates   (body: [langItem]) -> { data: [templateId] }
 * and the email node carries that id in langTemplateIds.
 *
 * Shapes below were captured from Lofty's own editor on 2026-11-19 (see
 * Reference/09_SMART_PLAN_V2_FORMAT.md). Uses Converter (converter.js) for merge fields,
 * unicode clean-up and the email wrapper.
 */
class ConverterV2 {
  static LEAD_TYPE_IDS = [1, 2, 5, 6, 7, 8, 9, -1]; // Buyer, Seller, Renter, Investor, Agent, Homeowner, Landlord, Other

  static stepParams = '{"dependStepLevels":[],"depNodeNameList":[]}';

  /**
   * @param {Object} plan      kit plan: { name, steps[], pauseOnReply, firstText?, trigger }
   * @param {Object} trig      resolved trigger from popup getTriggerConfig()
   * @param {Object} options   { accessFlag, pauseOnReply, pauseOnStageChange }
   * @param {Object} account   { teamId, creatorId } from the signed-in Lofty account
   * @returns {{ payload: Object, drafts: Array<{node: Object, lang: Object}> }}
   *   drafts: one per email node; the client stores each draft, then sets
   *   node.leftAction.langTemplateIds = [id] before saving the payload.
   */
  static build(plan, trig, options = {}, account = {}) {
    const C = window.Converter;
    const base = Date.now();
    let n = 0;
    const level = () => `system&${base + (++n)}`;
    const endLevel = level();
    const nodes = [];
    const drafts = [];

    const link = (node) => { node.stepLevel = level(); nodes.push(node); return node; };
    const common = () => ({
      id: 0, originalId: 0, relatedNodeStepLevel: endLevel, nextStepId: 0,
      locationOrder: 0, position: 0, params: this.stepParams, sortOrder: 0, y: 0
    });
    const wait = (days, ms = 0) => link({
      ...common(), teamId: 0, smartPlanId: 0, wait: days, timing: ms, type: 2, deleteFlag: false,
      workingHoursStart: -1, workingHoursEnd: -1, assignToRole: 0,
      stepType: 'condition_wait_time', viewType: 'condition'
    });
    const action = (extra) => link({ ...common(), allDay: false, stepType: 'action', viewType: 'action', ...extra });
    const task = (title) => action({
      type: 1, wait: 0, timing: 0, assignToRole: 10,
      leftAction: {
        assignToRole: 10, title, name: title, subject: title, body: title, description: '',
        remindAssignee: 0, reminderType: 2, timeType: 2, allDay: false, type: -1
      }
    });

    const steps = (plan.steps || []).slice().sort((a, b) => a.position - b.position);
    for (const s of steps) {
      if (s.runAfterDays > 0) wait(s.runAfterDays);
      switch (s.action) {
        case 'sendEmail': {
          const tpl = C.templateMapping[s.emailTemplateId];
          if (!tpl) throw new Error(`Email template ${s.emailTemplateId} is missing from the plan data`);
          const subject = C.convertMergeFields(tpl.subject || 'No Subject');
          const body = C.wrapEmailBody(C.convertMergeFields(tpl.body || ''));
          const node = action({
            assignToRole: 10,
            leftAction: {
              subject, body, name: subject, type: 5, params: '{"cc2Members":false}',
              langList: [{ label: 'English', value: 'en', status: 'published', subject, body }],
              langTemplateIds: [], assignToRole: 10, ext: '[]', allDay: false
            },
            useActionVariables: [{ isActionVariable: true }]
          });
          drafts.push({ node, lang: { label: 'English', value: 'en', status: 'published', subject, body, editing: true, lang: 'en', id: 0 } });
          break;
        }
        case 'addTags':
        case 'removeTags': {
          const items = [];
          for (const name of s.tags || []) {
            const t = C.tagMapping[name] || C.tagMapping[name.toLowerCase()];
            if (!t) throw new Error(`Tag "${name}" does not exist in this Lofty account`);
            items.push({ id: t.id, name: t.name });
          }
          action({
            leftAction: { addItems: s.action === 'addTags' ? items : [], delItems: s.action === 'removeTags' ? items : [], id: 0, type: 17, allDay: false },
            leftActionType: 'TAG'
          });
          break;
        }
        case 'addNote':
          task(C.sanitizeUnicode('Note: ' + (s.noteDesc || 'Follow up')));
          break;
        default: // createTask and anything the kit turned into a task
          task(C.sanitizeUnicode(s.taskName || `KTS step "${s.action}": see the plan sheet`));
      }
    }

    // prev/next links, then the end node
    nodes.forEach((node, i) => {
      const prev = i > 0 ? nodes[i - 1].stepLevel : '';
      const next = i < nodes.length - 1 ? nodes[i + 1].stepLevel : endLevel;
      node.previousStepLevels = prev;
      node.prev = prev ? [prev] : [];
      node.nextStepLevel = next;
      node.next = [next];
    });
    const last = nodes.length ? nodes[nodes.length - 1].stepLevel : '';
    const end = {
      id: 0, originalId: 0, teamId: account.teamId || 0, wait: 0, timing: 0, type: 1, deleteFlag: false,
      workingHoursStart: -1, workingHoursEnd: -1, assignToRole: 0, stepType: 'end', stepLevel: endLevel,
      previousStepLevels: last, nextStepId: 0, viewType: 'end', next: [], prev: last ? [last] : [],
      params: '{"depNodeNameList":[]}'
    };
    const startLevel = nodes.length ? nodes[0].stepLevel : endLevel;

    const trigger = this.trigger(trig, startLevel, base);

    const payload = {
      id: 0, libraryPlanId: 0, scenario: 0,
      teamId: account.teamId || 0, creatorId: account.creatorId || 0,
      name: C.sanitizeUnicode(plan.name),
      state: 0,
      accessFlag: options.accessFlag !== undefined ? options.accessFlag : 0, // 0 = My Plan, 1 = Company
      leadTypeItems: [{ type: 'one_of', ids: this.LEAD_TYPE_IDS }],
      sourceIdList: [], recurringDataName: '', pipelineIdList: [], groupIdList: [],
      repeatType: 'ONCE', tags: [], timeFrames: [], propertyTypes: [], contactWay: [], leadActivities: [],
      pauseCondition: 0,
      autoPause: {
        smartPlanId: 0, leadResponse: !!options.pauseOnReply, addSegment: false,
        homeownerIntentChange: false, homeownerNurturingStatusChange: false, outboundCall: false,
        appointmentMade: false, pipelineChange: !!options.pauseOnStageChange, pauseOtherPlan: false, tagChange: false,
        sourceChange: false, actionTrigger: 'NoAction', pipeline: 0, groups: [], tags: [], tagModels: [], addSegmentList: []
      },
      forType: 0, withAgent: 'N/A', withLender: 'N/A', category: 1, contactPeriod: 0,
      recurringType: 1, recurringTimes: -1, autoMove: false, autoMoveSmartPlan: false, visitSitePeriod: 7,
      leadScoreMin: -1, leadScoreMax: -1, revaluateScoreMin: -1, revaluateScoreMax: -1,
      customFieldId: '', customFieldName: '', excludeMatchLeads: false, aiPlanFlag: false, includeFamilyMembers: true,
      triggerConditions: trigger ? [trigger] : [],
      planStepPackListV2: [...nodes, end],
      description: '', type: '', startStepLevel: startLevel, endStepLevel: endLevel, originId: 0,
      pondStatus: 0, pondIds: [], reApplySwitch: false, validationFailed: false, wait: 0, timing: 0
    };
    return { payload, drafts };
  }

  /** Trigger node. trig: { type: 'manual' | 'tag' | 'pipeline' | 'compound', tagIds, pipelineIds, excludeTagIds } */
  static trigger(trig, startLevel, base) {
    if (!trig || trig.type === 'manual') return null;
    const t = {
      viewType: 'trigger', interactionType: null, customFieldCriteria: [], createDateLogic: null, createDateValue: null,
      pipelineIds: [], segmentIds: [], sourceIds: [], propertyTypes: [], timeFrames: [],
      withAgent: null, withLender: null, callOptIn: null, textOptIn: null, emailOptIn: null, withPhone: null,
      leadScoreMin: -1, leadScoreMax: -1, segmentLogic: 0, sourceLogic: null,
      tagLogic: null, tagIds: [],
      stepType: 'trigger', stepLevel: `TEMP_TRIGGER_${base}`, id: 0, originalId: 0, sortNum: 1,
      next: [startLevel], y: 0, levelNumber: 1, nextStepLevel: startLevel, otherConditions: []
    };
    if (trig.type === 'tag') {
      Object.assign(t, { type: 4, advancedSpecificParam: 'Tags', advancedLogic: 0, advancedValues: trig.tagIds, triggerType: 'TagChanged' });
    } else if (trig.type === 'pipeline' || trig.type === 'compound') {
      Object.assign(t, { type: 6, advancedSpecificParam: 'Pipeline', advancedLogic: 3, advancedValues: trig.pipelineIds, triggerType: 'PipelineChanged' });
      // One Tag criteria per trigger: "has this tag" wins over "doesn't have these tags".
      if (trig.type === 'compound' && trig.tagIds?.length) Object.assign(t, { tagLogic: 'INCLUDE_ONE', tagIds: trig.tagIds });
      else if (trig.excludeTagIds?.length) Object.assign(t, { tagLogic: 'EXCLUDE_ONE', tagIds: trig.excludeTagIds });
    } else {
      return null;
    }
    return t;
  }
}

window.ConverterV2 = ConverterV2;

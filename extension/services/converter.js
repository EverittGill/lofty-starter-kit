/**
 * FUB to Lofty Converter
 * Transforms FUB Action Plans into Lofty Smart Plan format
 */

class Converter {
  /**
   * Lofty action type constants
   */
  static LOFTY_ACTION_TYPES = {
    PHONE_CALL: 1,
    MANUAL_TEXT: 4,
    AUTO_EMAIL: 5,
    AUTO_TEXT: 6,
    NOTIFICATION: 13,
    TAG: 17,
    SMART_PLAN: 18,
    OTHER: -1
  };

  /**
   * Tag mapping: FUB tag name -> Lofty tag {id, name}
   * Must be populated before conversion by calling setTagMapping()
   */
  static tagMapping = {};

  /**
   * Template mapping: FUB emailTemplateId -> {subject, body, name}
   * Must be populated before conversion by calling setTemplateMapping()
   */
  static templateMapping = {};

  /**
   * Pipeline mapping: FUB stageId -> Lofty pipelineId
   * Must be populated before conversion by calling setPipelineMapping()
   */
  static pipelineMapping = {};

  /**
   * Pipeline names for logging: Lofty pipelineId -> name
   */
  static pipelineNames = {};

  /**
   * Lofty step type constants
   */
  static LOFTY_STEP_TYPES = {
    IMMEDIATE: 1,
    NOTIFICATION: 2,
    SCHEDULED: 3
  };

  /**
   * Wrap email body in Lofty's expected HTML structure
   */
  static wrapEmailBody(htmlContent) {
    // Check if already wrapped
    if (htmlContent.includes('crm-ckeditor-email-wrap')) {
      return htmlContent;
    }

    return `<div class="crm-ckeditor-email-wrap" style="color:#515666;font-size:16px;-webkit-font-smoothing: antialiased;-moz-osx-font-smoothing: grayscale;font-family:-apple-system, BlinkMacSystemFont, Arial;line-height:1.5;">${htmlContent}</div>`;
  }

  /**
   * Sanitize text to replace problematic Unicode characters with ASCII equivalents
   * This prevents signature mismatches caused by different Unicode handling
   */
  static sanitizeUnicode(text) {
    if (!text) return text;

    return text
      // Curly/smart quotes to straight quotes
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")  // Single quotes
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')  // Double quotes
      // Dashes to regular dashes
      .replace(/[\u2013]/g, '-')   // En-dash
      .replace(/[\u2014]/g, '--')  // Em-dash (double dash for width)
      // Spaces
      .replace(/[\u00A0]/g, ' ')   // Non-breaking space to regular space
      .replace(/[\u2003]/g, ' ')   // Em-space
      .replace(/[\u2002]/g, ' ')   // En-space
      // Ellipsis
      .replace(/[\u2026]/g, '...')
      // Other common problematic chars
      .replace(/[\u2022]/g, '*')   // Bullet
      .replace(/[\u00B7]/g, '*')   // Middle dot
      .replace(/[\u2212]/g, '-')   // Minus sign
      // Invisible characters that break signatures
      .replace(/[\uFEFF\u200B\u200C\u200D]/g, '')  // BOM and zero-width chars
      // Remove emojis (anything outside BMP that's not already handled)
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, '');  // Common emoji ranges
  }

  /**
   * Convert FUB merge fields to Lofty format
   * FUB uses %field_name%, Lofty uses #field_name#
   */
  static convertMergeFields(text) {
    if (!text) return text;

    // Complete FUB to Lofty field mapping (based on template audit of 490 emails)
    const fieldMap = {
      // Contact fields
      'contact_name': 'lead_name',
      'contact_first_name': 'lead_first_name',
      'contact_last_name': 'lead_last_name',
      'contact_rels_first_name': 'lead_first_name',  // 446 usages - FUB returns comma-list, Lofty has no equivalent
      'contact_email': 'lead_email',
      'contact_phone': 'lead_phone',
      'contact_address': 'lead_mailing_address',
      'contact_street': 'lead_mailing_address_street',
      'contact_city': 'lead_mailing_address_city',
      'contact_state': 'lead_mailing_address_state',
      'contact_zipcode': 'lead_mailing_address_zip',

      // Sender fields (map to agent - 474 usages for sender_name)
      'sender_name': 'agent_name',
      'sender_first_name': 'agent_first_name',
      'sender_last_name': 'agent_last_name',
      'sender_email': 'agent_email',
      'sender_phone': 'agent_phone',

      // Agent fields
      'agent_name': 'agent_name',
      'agent_first_name': 'agent_first_name',
      'agent_last_name': 'agent_last_name',
      'agent_email': 'agent_email',
      'agent_phone': 'agent_phone',
      'agent_mobile_phone': 'agent_phone',  // Lofty doesn't distinguish mobile vs office

      // Lender fields
      'lender_name': 'lender_name',
      'lender_first_name': 'lender_first_name',
      'lender_last_name': 'lender_last_name',
      'lender_email': 'lender_email',
      'lender_phone': 'lender_phone',

      // Property/Inquiry fields
      'inquiry_address': 'buyer_property_address',
      'inquiry_address_preview': 'buyer_property_address',
      'viewed_address': 'latest_saved_listing_address',
      'viewed_address_preview': 'latest_saved_listing_address',
      'property_address': 'latest_requested_showing_listing_address',

      // Lead source
      'source_name': 'lead_source',
      'lead_source': 'lead_source',

      // General/Time
      'greeting_time': 'time_of_day',

      // Company
      'company_name': 'assigned_agent_company_name',
      'company': 'assigned_agent_company_name',

      // Custom fields (user creates in Lofty with same name)
      'custom_open_house_address': 'custom_open_house_address',
      'custom_ylopo_seller_report': 'custom_ylopo_seller_report'
    };

    // Replace %field% with #lofty_field#
    let result = text.replace(/%([a-z_]+)%/gi, (match, field) => {
      const loftyField = fieldMap[field.toLowerCase()] || field;
      return `#${loftyField}#`;
    });

    // Sanitize Unicode characters to prevent signature mismatches
    return this.sanitizeUnicode(result);
  }

  /**
   * Convert time of day to milliseconds from midnight
   * Default to 9:00 AM if not specified
   */
  static getTimingMs(hour = 9, minute = 0) {
    return (hour * 3600000) + (minute * 60000);
  }

  /**
   * Convert a single FUB step to Lofty step format
   */
  static convertStep(fubStep, index) {
    const isImmediate = fubStep.runAfterDays === 0;

    // Base step structure
    const loftyStep = {
      realIndex: index,
      leftActionType: 'NORMAL',
      decision: null,
      id: 0,
      teamId: 0, // Will be set by LoftyClient
      smartPlanId: 0,
      assignToRole: 10, // Lead Owner
      workingHoursStart: -1,
      workingHoursEnd: -1,
      immediate: isImmediate,
      wait: isImmediate ? null : fubStep.runAfterDays,
      timing: isImmediate ? null : this.getTimingMs(9, 0), // 9:00 AM default
      type: isImmediate ? this.LOFTY_STEP_TYPES.IMMEDIATE : this.LOFTY_STEP_TYPES.SCHEDULED
    };

    // Convert based on FUB action type
    switch (fubStep.action) {
      case 'sendEmail':
        loftyStep.leftAction = this.createEmailAction(fubStep);
        break;

      case 'sendSms':
      case 'sendText':
        loftyStep.leftAction = this.createTextAction(fubStep);
        break;

      case 'task':
      case 'createTask':
        loftyStep.leftAction = this.createTaskAction(fubStep);
        break;

      case 'addNote':
        // Convert notes to tasks in Lofty (no direct equivalent)
        loftyStep.leftAction = this.createTaskAction({
          ...fubStep,
          taskName: 'Note: ' + (fubStep.noteDesc || 'Follow up'),
          taskType: 'Follow Up'
        });
        break;

      case 'addTags':
        loftyStep.leftActionType = 'TAG';
        loftyStep.leftAction = this.createTagAction(fubStep, 'add');
        break;

      case 'removeTags':
        loftyStep.leftActionType = 'TAG';
        loftyStep.leftAction = this.createTagAction(fubStep, 'remove');
        break;

      case 'modifyTags':
        // Automations 2.0 use modifyTags with add/remove in options
        loftyStep.leftActionType = 'TAG';
        const addTags = fubStep.options?.add || fubStep.add || [];
        const removeTags = fubStep.options?.remove || fubStep.remove || [];
        loftyStep.leftAction = {
          type: this.LOFTY_ACTION_TYPES.TAG,
          id: 0,
          addItems: addTags.map(tagName => {
            const loftyTag = this.tagMapping[tagName] || this.tagMapping[tagName.toLowerCase()];
            return loftyTag ? { id: loftyTag.id, name: loftyTag.name } : null;
          }).filter(Boolean),
          delItems: removeTags.map(tagName => {
            const loftyTag = this.tagMapping[tagName] || this.tagMapping[tagName.toLowerCase()];
            return loftyTag ? { id: loftyTag.id, name: loftyTag.name } : null;
          }).filter(Boolean)
        };
        break;

      case 'changeStage':
        // Convert FUB stage change to a task reminder (Lofty doesn't have direct pipeline change action)
        const loftyPipelineId = this.pipelineMapping[fubStep.stageId];
        if (loftyPipelineId) {
          const pipelineName = this.pipelineNames[loftyPipelineId] || `Pipeline ${loftyPipelineId}`;
          loftyStep.leftAction = this.createTaskAction({
            taskName: `Move lead to: ${pipelineName}`,
            taskType: 'Follow Up'
          });
          console.log(`[Converter] changeStage: FUB stage ${fubStep.stageId} → Lofty pipeline "${pipelineName}" (${loftyPipelineId})`);
        } else {
          loftyStep.leftAction = this.createTaskAction({
            taskName: `[UNMAPPED] Change to FUB stage: ${fubStep.stageId}`,
            taskType: 'Follow Up'
          });
          console.warn(`[Converter] Unmapped stageId: ${fubStep.stageId}`);
        }
        break;

      default:
        // Unsupported action - create a placeholder task
        loftyStep.leftAction = this.createTaskAction({
          taskName: `[Unsupported: ${fubStep.action}]`,
          taskType: 'Follow Up'
        });
        console.warn(`Unsupported FUB action type: ${fubStep.action}`);
    }

    return loftyStep;
  }

  /**
   * Create Lofty email action
   */
  static createEmailAction(fubStep) {
    // Try to get email content from template mapping if emailTemplateId is provided
    let emailSubject = fubStep.emailSubject;
    let emailBody = fubStep.emailBody;

    if (!emailSubject && !emailBody && fubStep.emailTemplateId) {
      const template = this.templateMapping[fubStep.emailTemplateId];
      if (template) {
        emailSubject = template.subject;
        emailBody = template.body;
        console.log(`[Converter] Using template ${fubStep.emailTemplateId}: ${template.name}`);
      } else {
        console.warn(`[Converter] Template ${fubStep.emailTemplateId} not found in mapping`);
      }
    }

    const subject = this.convertMergeFields(emailSubject || 'No Subject');
    const body = this.wrapEmailBody(this.convertMergeFields(emailBody || ''));

    return {
      langTemplateIds: [-(Date.now() + Math.random() * 1000 | 0)], // Negative = new template
      langList: [
        {
          label: 'English',
          value: 'en',
          status: 'published',
          subject: subject,
          body: body,
          editing: true,
          lang: 'en',
          id: 0
        }
      ],
      params: '{"cc2Members":false}',
      subject: subject,
      body: body,
      editorJson: '',
      ext: '[]',
      type: this.LOFTY_ACTION_TYPES.AUTO_EMAIL,
      name: subject,
      id: 0,
      planStepId: 0,
      teamId: 0,
      allDay: false
    };
  }

  /**
   * Create Lofty text/SMS action
   */
  static createTextAction(fubStep) {
    const content = this.convertMergeFields(fubStep.smsBody || fubStep.body || '');

    return {
      subject: content,
      body: content,
      images: '',
      imageList: [],
      uploading: false,
      ext: '{"images":""}',
      langTemplateIds: [-(Date.now() + Math.random() * 1000 | 0)],
      langList: [
        {
          id: 0,
          status: 'published',
          actionTemplateId: 0,
          lang: 'en',
          subject: content,
          body: content,
          editing: true,
          value: 'en'
        }
      ],
      params: '{}',
      type: this.LOFTY_ACTION_TYPES.AUTO_TEXT,
      name: content.substring(0, 50),
      id: 0,
      planStepId: 0,
      teamId: 0,
      allDay: false
    };
  }

  /**
   * Create Lofty task action (phone call or generic task)
   */
  static createTaskAction(fubStep) {
    const taskName = this.sanitizeUnicode(fubStep.taskName || 'Follow up task');
    const isCall = fubStep.taskType?.toLowerCase().includes('call');

    return {
      subject: taskName,
      body: taskName,
      remindAssignee: 1,
      reminderType: 2,
      timeType: 1,
      type: isCall ? this.LOFTY_ACTION_TYPES.PHONE_CALL : this.LOFTY_ACTION_TYPES.MANUAL_TEXT,
      name: taskName,
      id: 0,
      planStepId: 0,
      teamId: 0,
      allDay: true
    };
  }

  /**
   * Set the tag mapping from Lofty tags
   * @param {Array} loftyTags - Array of {id, name} from Lofty API
   */
  static setTagMapping(loftyTags) {
    this.tagMapping = {};
    for (const tag of loftyTags) {
      // Store by exact name and lowercase for flexible matching
      this.tagMapping[tag.name] = { id: tag.id, name: tag.name };
      this.tagMapping[tag.name.toLowerCase()] = { id: tag.id, name: tag.name };
    }
    console.log(`[Converter] Tag mapping set with ${loftyTags.length} tags`);
  }

  /**
   * Set the template mapping from exported FUB templates
   * @param {Object} templates - Object keyed by template ID with {subject, body, name}
   */
  static setTemplateMapping(templates) {
    this.templateMapping = {};
    for (const [id, template] of Object.entries(templates)) {
      this.templateMapping[id] = {
        subject: template.subject || '',
        body: template.body || '',
        name: template.name || ''
      };
    }
    console.log(`[Converter] Template mapping set with ${Object.keys(this.templateMapping).length} templates`);
  }

  /**
   * Set the pipeline mapping from FUB stage IDs to Lofty pipeline IDs
   * @param {Object} mapping - Object of { fubStageId: { loftyId, name } }
   */
  static setPipelineMapping(mapping) {
    this.pipelineMapping = {};
    this.pipelineNames = {};
    for (const [fubStageId, config] of Object.entries(mapping)) {
      this.pipelineMapping[fubStageId] = config.loftyId;
      this.pipelineNames[config.loftyId] = config.name;
    }
    console.log(`[Converter] Pipeline mapping set with ${Object.keys(this.pipelineMapping).length} stages`);
  }

  /**
   * Create Lofty tag action (type 17)
   * @param {Object} fubStep - FUB step with tags array
   * @param {string} operation - 'add' or 'remove'
   * @returns {Object} Lofty tag action
   */
  static createTagAction(fubStep, operation = 'add') {
    const tagNames = fubStep.tags || [];
    const items = [];
    const unmappedTags = [];

    for (const tagName of tagNames) {
      // Try exact match first, then lowercase
      const loftyTag = this.tagMapping[tagName] || this.tagMapping[tagName.toLowerCase()];
      if (loftyTag) {
        items.push({ id: loftyTag.id, name: loftyTag.name });
      } else {
        unmappedTags.push(tagName);
      }
    }

    if (unmappedTags.length > 0) {
      console.warn(`[Converter] Unmapped tags for ${operation}: ${unmappedTags.join(', ')}`);
    }

    return {
      type: this.LOFTY_ACTION_TYPES.TAG,
      id: 0,
      addItems: operation === 'add' ? items : [],
      delItems: operation === 'remove' ? items : []
    };
  }

  /**
   * Create default trigger condition (Lead Created)
   */
  static createDefaultTrigger() {
    return {
      type: 1,
      advancedSpecificParam: 'Lead Created',
      advancedLogic: null,
      advancedValues: null,
      pipelineIds: [-3] // All pipelines
    };
  }

  /**
   * Create pipeline-only trigger (triggers when lead moves to specified pipeline(s))
   * @param {number[]} pipelineIds - Array of Lofty pipeline IDs
   */
  static createPipelineTrigger(pipelineIds) {
    return {
      type: 6,
      advancedSpecificParam: 'Pipeline',
      advancedLogic: 3,  // 3 = "Has Changed To"
      advancedValues: pipelineIds
      // No pipelineIds field - removes the extra "Is" filter
    };
  }

  /**
   * Create compound trigger (triggers when lead is in specified pipeline(s) AND has specified tag(s))
   * @param {number[]} pipelineIds - Array of Lofty pipeline IDs
   * @param {number[]} tagIds - Array of Lofty tag IDs
   */
  static createCompoundTrigger(pipelineIds, tagIds) {
    return {
      type: 6,
      advancedSpecificParam: 'Pipeline',
      advancedLogic: 3,  // 3 = "Has Changed To"
      advancedValues: pipelineIds,
      // No pipelineIds field - removes the extra "Is" filter
      tagLogic: 1,
      tagIds: tagIds
    };
  }

  /**
   * Create tag-only trigger (triggers when specified tag(s) are added)
   * @param {number[]} tagIds - Array of Lofty tag IDs
   */
  static createTagTrigger(tagIds) {
    // WORKING structure captured from Lofty UI (2026-01-06)
    // Key: Do NOT include triggerType or pipelineIds - those break it!
    return {
      type: 4,
      advancedSpecificParam: 'Tags',
      advancedLogic: 0,
      advancedValues: tagIds
    };
  }

  /**
   * Get array of tag trigger variants to try (brute-force discovery)
   * @param {number[]} tagIds - Array of Lofty tag IDs
   * @returns {Object[]} Array of trigger configurations to try
   */
  static getTagTriggerVariants(tagIds) {
    return [
      // Variant 0: Documented structure (advancedLogic: 0)
      {
        name: 'Documented (advancedLogic: 0)',
        trigger: {
          type: 4,
          advancedSpecificParam: 'Tags',
          advancedLogic: 0,
          advancedValues: tagIds,
          pipelineIds: [-3],
          triggerType: "TagChanged"
        }
      },
      // Variant 1: What shows "Tags Removed" (advancedLogic: 1)
      {
        name: 'advancedLogic: 1 (known to show "Tags Removed")',
        trigger: {
          type: 4,
          advancedSpecificParam: 'Tags',
          advancedLogic: 1,
          advancedValues: tagIds,
          pipelineIds: [-3],
          triggerType: "TagChanged"
        }
      },
      // Variant 2: advancedLogic: 0 with tagLogic: 0
      {
        name: 'advancedLogic: 0 + tagLogic: 0',
        trigger: {
          type: 4,
          advancedSpecificParam: 'Tags',
          advancedLogic: 0,
          advancedValues: tagIds,
          tagLogic: 0,
          pipelineIds: [-3],
          triggerType: "TagChanged"
        }
      },
      // Variant 3: advancedLogic: 1 with tagLogic: 0
      {
        name: 'advancedLogic: 1 + tagLogic: 0',
        trigger: {
          type: 4,
          advancedSpecificParam: 'Tags',
          advancedLogic: 1,
          advancedValues: tagIds,
          tagLogic: 0,
          pipelineIds: [-3],
          triggerType: "TagChanged"
        }
      },
      // Variant 4: Try advancedLogic: 4
      {
        name: 'advancedLogic: 4',
        trigger: {
          type: 4,
          advancedSpecificParam: 'Tags',
          advancedLogic: 4,
          advancedValues: tagIds,
          pipelineIds: [-3],
          triggerType: "TagChanged"
        }
      },
      // Variant 5: Try advancedLogic: 5
      {
        name: 'advancedLogic: 5',
        trigger: {
          type: 4,
          advancedSpecificParam: 'Tags',
          advancedLogic: 5,
          advancedValues: tagIds,
          pipelineIds: [-3],
          triggerType: "TagChanged"
        }
      },
      // Variant 6: Without pipelineIds
      {
        name: 'No pipelineIds field',
        trigger: {
          type: 4,
          advancedSpecificParam: 'Tags',
          advancedLogic: 0,
          advancedValues: tagIds,
          triggerType: "TagChanged"
        }
      },
      // Variant 7: String tag IDs instead of numbers
      {
        name: 'String tag IDs',
        trigger: {
          type: 4,
          advancedSpecificParam: 'Tags',
          advancedLogic: 0,
          advancedValues: tagIds.map(id => String(id)),
          pipelineIds: [-3],
          triggerType: "TagChanged"
        }
      },
      // Variant 8: Try advancedLogic: 6 (maybe "Added"?)
      {
        name: 'advancedLogic: 6',
        trigger: {
          type: 4,
          advancedSpecificParam: 'Tags',
          advancedLogic: 6,
          advancedValues: tagIds,
          pipelineIds: [-3],
          triggerType: "TagChanged"
        }
      },
      // Variant 9: Try without triggerType (maybe it's inferred?)
      {
        name: 'No triggerType field',
        trigger: {
          type: 4,
          advancedSpecificParam: 'Tags',
          advancedLogic: 0,
          advancedValues: tagIds,
          pipelineIds: [-3]
        }
      }
    ];
  }

  /**
   * Convert complete FUB Action Plan to Lofty Smart Plan
   * @param {Object} fubPlan - FUB action plan object
   * @param {Object} [triggerConfig] - Optional trigger configuration
   * @param {string} [triggerConfig.type] - 'pipeline', 'compound', 'tag', or 'default'
   * @param {number[]} [triggerConfig.pipelineIds] - Lofty pipeline IDs for trigger
   * @param {number[]} [triggerConfig.tagIds] - Lofty tag IDs for trigger
   */
  static convertActionPlan(fubPlan, triggerConfig = null, options = {}) {
    // Convert all steps
    const steps = (fubPlan.steps || [])
      .sort((a, b) => a.position - b.position)
      .map(step => ({ ...step }));
    // Optional first text (FUB sent it from lead flow). Lofty waits in whole days, so a delay
    // under a day sends right away and a 24-hour delay becomes "wait 1 day".
    if (options.firstText && fubPlan.firstText?.body) {
      steps.unshift({ action: 'sendText', position: 0, runAfterDays: fubPlan.firstText.delayMinutes >= 1440 ? 1 : 0, smsBody: fubPlan.firstText.body });
    }
    for (let i = 0; i < steps.length; i++) steps[i] = this.convertStep(steps[i], i);

    // Determine trigger based on config
    let trigger;
    if (triggerConfig) {
      switch (triggerConfig.type) {
        case 'manual':
          trigger = null;  // No auto-trigger - plan is started manually
          console.log(`[Converter] Using manual trigger (no auto-trigger)`);
          break;
        case 'pipeline':
          trigger = this.createPipelineTrigger(triggerConfig.pipelineIds);
          console.log(`[Converter] Using pipeline trigger: ${triggerConfig.pipelineIds.join(', ')}`);
          break;
        case 'compound':
          trigger = this.createCompoundTrigger(triggerConfig.pipelineIds, triggerConfig.tagIds);
          console.log(`[Converter] Using compound trigger: pipelines=${triggerConfig.pipelineIds.join(', ')}, tags=${triggerConfig.tagIds.join(', ')}`);
          break;
        case 'activity':
          // Type 9, shape captured from Lofty's UI (January 2026) without its segment filter
          trigger = { type: 9, advancedSpecificParam: triggerConfig.days, advancedLogic: 1, advancedValues: triggerConfig.activities };
          break;
        case 'tag':
          trigger = this.createTagTrigger(triggerConfig.tagIds);
          console.log(`[Converter] Using tag trigger: ${triggerConfig.tagIds.join(', ')}`);
          break;
        default:
          trigger = this.createDefaultTrigger();
          console.log(`[Converter] Using default trigger (Lead Created)`);
      }
    } else {
      trigger = this.createDefaultTrigger();
    }

    // Build the Lofty Smart Plan payload
    // IMPORTANT: Property order matters for signature! Must match Lofty's expected order.
    return {
      id: 0, // New plan
      name: this.sanitizeUnicode(fubPlan.name),
      state: 0, // Draft - user can activate manually
      accessFlag: options.accessFlag !== undefined ? options.accessFlag : 1, // 0=Personal, 1=Shared
      category: 1,
      repeatType: 'ONCE',
      recurringType: 1,
      recurringTimes: 1,
      aiPlanFlag: false,
      planStepPackList: steps,
      triggerConditions: trigger ? [trigger] : [],
      autoPause: {
        leadResponse: !!options.pauseOnReply,  // FUB "stop when the lead replies"
        outboundCall: false,
        tagChange: false,
        sourceChange: false,
        pipelineChange: options.keepOnStageChange ? false : true,  // Auto-pause when pipeline changes
        pauseOtherPlan: false,
        actionTrigger: 'NoAction',
        pipeline: '',
        groups: [],
        tags: []
      },
      paymentInfo: {
        payType: 1,
        payerId: null,
        payerName: ''
      },
      leadTypeItems: [{ type: 'one_of', ids: ['1', '2', '5', '6', '7', '8', '9', '-1'] }], // "Include one of": Seller, Buyer, Renter, Investor, Agent, Homeowner, Landlord, Other
      sourceIdList: [],
      pipelineIdList: [],
      groupIdList: [],
      tags: [],
      timeFrames: [],
      propertyTypes: [],
      withAgent: 'N/A',
      withLender: 'N/A',
      contactWay: [],
      contactPeriod: 0,
      visitSitePeriod: 7,
      leadScoreMin: -1,
      leadScoreMax: -1,
      revaluateScoreMin: -1,
      revaluateScoreMax: -1,
      excludeMatchLeads: false,
      pauseCondition: 0,
      forType: '',
      timeBasedType: '',
      autoMove: null,
      leadActivities: [],
      pondStatus: 0,
      pondIds: [],
      teamId: 0, // Will be set by LoftyClient
      creatorId: 0 // Will be set by LoftyClient
    };
  }

  /**
   * Get summary of conversion
   */
  static getConversionSummary(fubPlan, loftyPlan) {
    const stepTypes = {};
    for (const step of fubPlan.steps || []) {
      stepTypes[step.action] = (stepTypes[step.action] || 0) + 1;
    }

    return {
      planName: fubPlan.name,
      totalSteps: fubPlan.steps?.length || 0,
      stepTypes: stepTypes,
      loftySteps: loftyPlan.planStepPackList.length
    };
  }
}

// Export for use in popup.js
window.Converter = Converter;

/**
 * Lofty Internal API Client
 * Handles creating Smart Plans via Lofty's internal API
 * Uses message passing to injected script for authenticated requests
 */

class LoftyClient {
  constructor() {
    this.baseUrl = 'https://crm.lofty.com';
    this.teamId = null;
    this.creatorId = null;
    this.isConnected = false;
  }

  /**
   * Check connection to Lofty via background script
   */
  async testConnection() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'CHECK_LOFTY_TAB' }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({
            success: false,
            error: chrome.runtime.lastError.message
          });
          return;
        }

        if (response?.success) {
          this.isConnected = true;
          this.creatorId = response.userId;
          resolve({
            success: true,
            userId: response.userId,
            tabId: response.tabId
          });
        } else {
          resolve({
            success: false,
            error: response?.error || 'Could not connect to Lofty'
          });
        }
      });
    });
  }

  /**
   * Get user info from Lofty page
   */
  async getUserInfo() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'GET_LOFTY_USER_INFO' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (response?.success) {
          this.creatorId = response.userId;
          resolve(response);
        } else {
          reject(new Error(response?.error || 'Could not get user info'));
        }
      });
    });
  }

  /**
   * Set user info manually
   */
  setUserInfo(teamId, creatorId) {
    this.teamId = teamId;
    this.creatorId = creatorId;
  }

  /**
   * Create a Smart Plan in Lofty
   * Sends request through background -> content -> injected script chain
   */
  async createSmartPlan(smartPlanPayload) {
    // Inject teamId and creatorId into payload if we have them
    const payload = {
      ...smartPlanPayload
    };

    if (this.teamId) {
      payload.teamId = this.teamId;
    }
    // Only inject creatorId if it's a valid number (not 'unknown' or other strings)
    if (this.creatorId && !isNaN(Number(this.creatorId))) {
      payload.creatorId = this.creatorId;
    }

    // Also inject into each step
    if (payload.planStepPackList && this.teamId) {
      payload.planStepPackList = payload.planStepPackList.map(step => ({
        ...step,
        teamId: this.teamId
      }));
    }

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'CREATE_SMART_PLAN',
        payload: payload
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (response?.success) {
          resolve(response.data);
        } else {
          // Create an error with additional details attached
          const error = new Error(response?.error || 'Failed to create Smart Plan');
          error.errorCode = response?.errorCode;
          error.triggerError = response?.triggerError;
          error.signatureError = response?.signatureError;
          error.fullResponse = response?.fullResponse;
          error.errorStack = response?.errorStack;

          console.error('[LoftyClient] API Error:', {
            message: error.message,
            errorCode: error.errorCode,
            triggerError: error.triggerError,
            signatureError: error.signatureError,
            fullResponse: error.fullResponse
          });

          reject(error);
        }
      });
    });
  }

  /** One signed request through the Lofty tab. Resolves with Lofty's JSON; rejects on any error. */
  request(endpoint, method, payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'LOFTY_REQUEST', endpoint, method, payload }, (response) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response?.success) return reject(new Error(response?.error || 'Lofty request failed'));
        let data = response.data;
        if (data && data.success === false) return reject(new Error(data.error || 'Lofty refused the request'));
        // The page script wraps Lofty's JSON as { success: true, data: <Lofty JSON> }
        if (data && data.success === true && data.data && data.data.status) data = data.data;
        if (data?.status && data.status.code !== 0) return reject(new Error(`[Code ${data.status.code}] ${data.status.msg}`));
        resolve(data);
      });
    });
  }

  /** teamId / creatorId the new editor uses for this account. */
  async getAccount() {
    if (this.account) return this.account;
    const r = await chrome.runtime.sendMessage({ type: 'GET_LOFTY_ACCOUNT' });
    if (!r?.success) throw new Error(r?.error || 'Could not read the Lofty account');
    this.account = r.data;
    return this.account;
  }

  /**
   * Create a Smart Plan in the new (flow) format: store each email as a draft template, put the
   * returned ids on the email nodes, then save. built = ConverterV2.build(...) -> { payload, drafts }.
   */
  async createSmartPlanV2(built, onProgress) {
    for (let i = 0; i < built.drafts.length; i++) {
      const d = built.drafts[i];
      const res = await this.request('/api/smart-plan-server/settings/draft/lang/templates', 'POST', [d.lang]);
      const id = Array.isArray(res?.data) ? res.data[0] : null;
      if (typeof id !== 'number') throw new Error(`Lofty did not return a template id for email ${i + 1}`);
      d.node.leftAction.langTemplateIds = [id];
      if (onProgress) onProgress(i + 1, built.drafts.length);
      await new Promise(r => setTimeout(r, 150));
    }
    const saved = await this.request('/api/smart-plan-server/settings/save/v2', 'POST', built.payload);
    return saved?.data; // new plan id
  }

  /**
   * Test creating a minimal Smart Plan
   * Use this to verify the API is working
   */
  async testCreatePlan() {
    const testPayload = {
      planStepPackList: [],
      autoPause: {
        leadResponse: false,
        outboundCall: false,
        tagChange: false,
        sourceChange: false,
        pipelineChange: false,
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
      recurringType: 1,
      recurringTimes: 1,
      timeBasedType: '',
      id: 0,
      name: '[TEST] FUB Migration Test - Delete Me',
      state: 0,
      accessFlag: 0,
      leadTypeItems: [{ type: 'all', ids: ['-1'] }],
      sourceIdList: [],
      pipelineIdList: [],
      groupIdList: [],
      pauseCondition: 0,
      forType: '',
      tags: [],
      aiPlanFlag: false,
      timeFrames: [],
      propertyTypes: [],
      withAgent: 'N/A',
      withLender: 'N/A',
      category: 1,
      contactWay: [],
      contactPeriod: 0,
      autoMove: null,
      leadActivities: [],
      visitSitePeriod: 7,
      leadScoreMin: -1,
      leadScoreMax: -1,
      revaluateScoreMin: -1,
      revaluateScoreMax: -1,
      excludeMatchLeads: false,
      triggerConditions: [
        {
          type: 1,
          advancedSpecificParam: 'Lead Created',
          advancedLogic: null,
          advancedValues: null
        }
      ],
      repeatType: 'ONCE',
      pondStatus: 0,
      pondIds: []
    };

    return this.createSmartPlan(testPayload);
  }
}

// Export for use in popup.js
window.LoftyClient = LoftyClient;

/**
 * Follow Up Boss API Client
 * Handles fetching Action Plans and Templates from FUB
 */

class FUBClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.followupboss.com/v1';
  }

  /**
   * Make authenticated request to FUB API
   */
  async request(endpoint, options = {}) {
    const credentials = btoa(`${this.apiKey}:`);

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.errorMessage || `FUB API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Test API connection
   */
  async testConnection() {
    try {
      const data = await this.request('/identity');
      return {
        success: true,
        account: data.account?.domain || 'Unknown',
        user: data.user?.name || 'Unknown'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Fetch all action plans (paginated)
   */
  async getActionPlans() {
    const allPlans = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const data = await this.request(`/actionPlans?limit=${limit}&offset=${offset}&status=Active`);
      const plans = data.actionPlans || [];
      allPlans.push(...plans);

      if (plans.length < limit) break;
      offset += limit;
    }

    return allPlans;
  }

  /**
   * Fetch single action plan with steps
   */
  async getActionPlan(planId) {
    return this.request(`/actionPlans/${planId}`);
  }

  /**
   * Fetch all templates (paginated)
   */
  async getTemplates() {
    const allTemplates = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const data = await this.request(`/templates?limit=${limit}&offset=${offset}`);
      const templates = data.templates || [];
      allTemplates.push(...templates);

      if (templates.length < limit) break;
      offset += limit;
    }

    return allTemplates;
  }

  /**
   * Fetch single template
   */
  async getTemplate(templateId) {
    return this.request(`/templates/${templateId}`);
  }

  /**
   * Get fully hydrated action plan with template content
   */
  async getHydratedActionPlan(planId, templateCache = {}) {
    const plan = await this.getActionPlan(planId);

    // Hydrate steps with template content
    for (const step of plan.steps || []) {
      if (step.action === 'sendEmail' && step.emailTemplateId) {
        // Use cache if available
        if (!templateCache[step.emailTemplateId]) {
          try {
            templateCache[step.emailTemplateId] = await this.getTemplate(step.emailTemplateId);
          } catch (e) {
            console.warn(`Failed to fetch template ${step.emailTemplateId}:`, e);
            templateCache[step.emailTemplateId] = null;
          }
        }

        const template = templateCache[step.emailTemplateId];
        if (template) {
          step.emailSubject = template.subject;
          step.emailBody = template.body;
          step.templateName = template.name;
        }
      }
    }

    return plan;
  }

  /**
   * Batch hydrate multiple action plans
   */
  async getHydratedActionPlans(planIds, onProgress = () => {}) {
    // First, fetch all templates to build cache
    onProgress({ phase: 'templates', message: 'Fetching email templates...' });
    const templates = await this.getTemplates();
    const templateCache = {};
    templates.forEach(t => templateCache[t.id] = t);

    // Then fetch and hydrate each plan
    const hydratedPlans = [];
    for (let i = 0; i < planIds.length; i++) {
      const planId = planIds[i];
      onProgress({
        phase: 'plans',
        current: i + 1,
        total: planIds.length,
        message: `Fetching plan ${i + 1} of ${planIds.length}...`
      });

      try {
        const plan = await this.getHydratedActionPlan(planId, templateCache);
        hydratedPlans.push(plan);
      } catch (e) {
        console.error(`Failed to fetch plan ${planId}:`, e);
        hydratedPlans.push({ id: planId, error: e.message });
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));
    }

    return hydratedPlans;
  }
}

// Export for use in popup.js
window.FUBClient = FUBClient;

/**
 * FUB to Lofty Migrator - Popup UI
 */

// State
let fubClient = null;
let loftyClient = null;
let actionPlans = [];
let selectedPlanIds = new Set();
let tagMapping = {};  // FUB tag name -> Lofty tag ID

// DOM Elements
const elements = {
  fubApiKey: document.getElementById('fub-api-key'),
  saveFubKey: document.getElementById('save-fub-key'),
  fubStatus: document.getElementById('fub-status'),
  checkLofty: document.getElementById('check-lofty'),
  loftyStatus: document.getElementById('lofty-status'),
  fetchPlans: document.getElementById('fetch-plans'),
  plansContainer: document.getElementById('plans-container'),
  plansList: document.getElementById('plans-list'),
  selectAll: document.getElementById('select-all'),
  selectNone: document.getElementById('select-none'),
  startMigration: document.getElementById('start-migration'),
  progressContainer: document.getElementById('progress-container'),
  progressFill: document.getElementById('progress-fill'),
  progressText: document.getElementById('progress-text'),
  log: document.getElementById('log')
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Load saved API key
  const saved = await chrome.storage.sync.get(['fubApiKey']);
  if (saved.fubApiKey) {
    elements.fubApiKey.value = saved.fubApiKey;
    fubClient = new FUBClient(saved.fubApiKey);
    setStatus(elements.fubStatus, 'API key loaded', 'info');
  }

  // Initialize Lofty client
  loftyClient = new LoftyClient();

  // Load email templates for converter
  await loadEmailTemplates();

  // Set up pipeline mapping (FUB stage IDs → Lofty pipeline IDs)
  initPipelineMapping();

  // Load action plans from bundled data (no FUB API needed)
  await loadActionPlans();

  // Event listeners
  elements.saveFubKey.addEventListener('click', saveFubKey);
  elements.checkLofty.addEventListener('click', checkLoftyConnection);
  elements.testLoftyApi = document.getElementById('test-lofty-api');
  elements.testLoftyApi.addEventListener('click', testLoftyApi);
  elements.createTestPlan = document.getElementById('create-test-plan');
  elements.createTestPlan.addEventListener('click', createTestSmartPlan);
  elements.debugInfo = document.getElementById('debug-info');
  elements.debugOutput = document.getElementById('debug-output');
  elements.debugInfo.addEventListener('click', showDebugInfo);
  elements.analyzeSig = document.getElementById('analyze-sig');
  elements.analyzeSig.addEventListener('click', analyzeSignatures);
  elements.sigTestSection = document.getElementById('sig-test-section');
  elements.sigToken = document.getElementById('sig-token');
  elements.sigTimestamp = document.getElementById('sig-timestamp');
  elements.sigExpected = document.getElementById('sig-expected');
  elements.testSigAlgo = document.getElementById('test-sig-algo');
  elements.sigTestResult = document.getElementById('sig-test-result');
  elements.captureSig = document.getElementById('capture-sig');
  elements.captureStatus = document.getElementById('capture-status');
  elements.captureSig.addEventListener('click', captureSignatureData);
  elements.testSigAlgo.addEventListener('click', testSignatureAlgorithm);
  elements.searchScripts = document.getElementById('search-scripts');
  elements.searchStatus = document.getElementById('search-status');
  elements.searchResults = document.getElementById('search-results');
  elements.searchScripts.addEventListener('click', searchAllScripts);
  elements.fetchPlans.addEventListener('click', fetchPlans);
  elements.selectAll.addEventListener('click', () => selectPlans(true));
  elements.selectNone.addEventListener('click', () => selectPlans(false));
  elements.startMigration.addEventListener('click', startMigration);
  const forget = document.getElementById('forget-history');
  if (forget) forget.addEventListener('click', async () => {
    await chrome.storage.local.remove(['uploadedPlans', 'finishList']);
    log('Upload history cleared.', 'info');
  });

  // Tag sync event listeners
  elements.analyzeTags = document.getElementById('analyze-tags');
  elements.syncTags = document.getElementById('sync-tags');
  elements.tagSyncStatus = document.getElementById('tag-sync-status');
  elements.tagSyncProgress = document.getElementById('tag-sync-progress');
  elements.tagProgressFill = document.getElementById('tag-progress-fill');
  elements.tagProgressText = document.getElementById('tag-progress-text');
  elements.tagResults = document.getElementById('tag-results');
  elements.tagSummary = document.getElementById('tag-summary');
  elements.tagList = document.getElementById('tag-list');
  elements.analyzeTags.addEventListener('click', analyzeTags);
  elements.syncTags.addEventListener('click', syncMissingTags);

  await loadDetails();
  const copyBtn = document.getElementById('copy-finish');
  copyBtn.addEventListener('click', async () => { await navigator.clipboard.writeText(elements.debugOutput.textContent); copyBtn.textContent = 'Copied'; });
  const last = (await chrome.storage.local.get(['finishList'])).finishList;
  if (last) { elements.debugOutput.textContent = last; elements.debugOutput.style.display = 'block'; copyBtn.style.display = 'inline-block'; }
  checkLoftyConnection();
}

// Agent details: website, brokerage and links that fill the {{PLACEHOLDERS}} in the emails.
let rawTemplates = {};
let agentDetails = null;
function applyDetails() {
  const d = agentDetails;
  const out = {};
  for (const [k, t] of Object.entries(rawTemplates)) {
    const fill = s => !d ? s : (s || '')
      .replaceAll('{{WEBSITE}}', d.website).replaceAll('{{ABOUT_ME_URL}}', d.about || d.website)
      .replaceAll('{{GOOGLE_REVIEWS_URL}}', d.reviews || d.website).replaceAll('{{BROKERAGE}}', d.brokerage)
      .replaceAll('{{SELLERS_GUIDE_URL}}', d.website);
    out[k] = { ...t, subject: fill(t.subject), body: fill(t.body) };
  }
  Converter.setTemplateMapping(out);
}
function needsDetails() { return Object.values(rawTemplates).some(t => /\{\{[A-Z_]+\}\}/.test((t.subject || '') + (t.body || ''))); }
async function loadDetails() {
  agentDetails = (await chrome.storage.local.get(['agentDetails'])).agentDetails || null;
  const st = document.getElementById('details-status');
  if (!needsDetails()) { document.getElementById('agent-details').style.display = 'none'; return; }
  if (agentDetails) {
    document.getElementById('d-website').value = agentDetails.website; document.getElementById('d-brokerage').value = agentDetails.brokerage;
    document.getElementById('d-about').value = agentDetails.about || ''; document.getElementById('d-reviews').value = agentDetails.reviews || '';
    setStatus(st, 'Saved', 'success'); applyDetails();
  } else {
    // Nothing saved yet: offer what the signed-in Lofty account already says. She checks it and presses Save.
    loftyClient.getAccount().then(a => {
      const w = document.getElementById('d-website'), b = document.getElementById('d-brokerage');
      if (a.siteUrl && !w.value) w.value = a.siteUrl;
      if (a.companyName && !b.value) b.value = a.companyName;
      if (a.siteUrl || a.companyName) setStatus(st, 'Filled in from your Lofty account. Change anything that is wrong (for example, if you use a different website), then press Save.', 'info');
    }).catch(() => {});
  }
  loftyClient.getAccount().then(a => {
    if (a.onTeam) document.querySelector('#tag-sync .hint').textContent = 'You are on a team account: tags you create here are added for your whole team. Ask your team lead before pressing Create missing tags.';
  }).catch(() => {});
  document.getElementById('save-details').addEventListener('click', async () => {
    const v = id => document.getElementById(id).value.trim();
    let website = v('d-website').replace(/\/$/, '');
    if (website && !/^https?:\/\//.test(website)) website = 'https://' + website;
    const link = s => s && !/^https?:\/\//.test(s) ? 'https://' + s : s;
    if (!website || !v('d-brokerage')) { setStatus(st, 'Website and brokerage are both needed', 'error'); return; }
    agentDetails = { website, brokerage: v('d-brokerage'), about: link(v('d-about')), reviews: link(v('d-reviews')) };
    await chrome.storage.local.set({ agentDetails });
    applyDetails();
    setStatus(st, 'Saved', 'success');
  });
}

// Logging
function log(message, type = 'info') {
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `<span class="time">[${time}]</span> ${message}`;
  elements.log.appendChild(entry);
  elements.log.scrollTop = elements.log.scrollHeight;
}

function setStatus(element, message, type) {
  element.textContent = message;
  element.className = `status ${type}`;
}

/**
 * Load email templates from bundled JSON file
 */
async function loadEmailTemplates() {
  try {
    const response = await fetch(chrome.runtime.getURL('data/templates.json'));
    if (!response.ok) {
      throw new Error(`Failed to load templates: ${response.status}`);
    }
    const data = await response.json();

    rawTemplates = data.templates;
    applyDetails();
    log(`Loaded ${Object.keys(data.templates).length} email templates`, 'success');
  } catch (error) {
    log(`Warning: Could not load email templates: ${error.message}`, 'error');
    console.error('Template loading error:', error);
  }
}

/**
 * Pipeline mapping: none needed. The kit data turns FUB "change stage" steps into tasks, and
 * pipeline triggers are looked up by name in the signed-in account (loadLoftyAccount).
 */
function initPipelineMapping() {
  Converter.setPipelineMapping({});
}

/**
 * Load action plans from bundled JSON file (no FUB API needed)
 */
async function loadActionPlans() {
  try {
    const response = await fetch(chrome.runtime.getURL('data/action-plans.json'));
    if (!response.ok) {
      throw new Error(`Failed to load action plans: ${response.status}`);
    }
    const data = await response.json();
    actionPlans = data.actionPlans || [];
    log(`Loaded ${actionPlans.length} action plans from local data`, 'success');

    // Auto-render the plans list
    renderPlansList();
    elements.plansContainer.style.display = 'block';

    return actionPlans;
  } catch (error) {
    log(`No plan data found. Build it from the kit first: node tools/build-lofty-extension-data.mjs <this extension folder>, then reload the extension. (${error.message})`, 'error');
    console.error('Action plans loading error:', error);
    return [];
  }
}

// FUB API Key
async function saveFubKey() {
  const apiKey = elements.fubApiKey.value.trim();
  if (!apiKey) {
    setStatus(elements.fubStatus, 'Please enter an API key', 'error');
    return;
  }

  setStatus(elements.fubStatus, 'Testing connection...', 'info');

  fubClient = new FUBClient(apiKey);
  const result = await fubClient.testConnection();

  if (result.success) {
    await chrome.storage.sync.set({ fubApiKey: apiKey });
    setStatus(elements.fubStatus, `Connected: ${result.account} (${result.user})`, 'success');
    log(`FUB connected: ${result.account}`, 'success');
  } else {
    setStatus(elements.fubStatus, `Error: ${result.error}`, 'error');
    log(`FUB connection failed: ${result.error}`, 'error');
  }
}

// Lofty Connection
async function checkLoftyConnection() {
  setStatus(elements.loftyStatus, 'Checking connection...', 'info');

  const result = await loftyClient.testConnection();

  if (result.success) {
    const userDisplay = result.userId !== 'unknown' ? `User: ${result.userId}` : 'Session found';
    setStatus(elements.loftyStatus, `Connected (${userDisplay})`, 'success');
    log(`Lofty connected! Auth token: ${result.hasAuthToken ? 'yes' : 'no'}, Session token: ${result.hasToken ? 'yes' : 'no'}`, 'success');
  } else {
    setStatus(elements.loftyStatus, `Error: ${result.error}`, 'error');
    log(`Lofty connection failed: ${result.error}`, 'error');
  }
}

// Test Lofty API - creates a test Smart Plan
async function testLoftyApi() {
  setStatus(elements.loftyStatus, 'Testing API...', 'info');
  log('Creating test Smart Plan...', 'info');

  try {
    const result = await loftyClient.testCreatePlan();
    setStatus(elements.loftyStatus, 'API test successful!', 'success');
    log(`Test plan created! Response: ${JSON.stringify(result)}`, 'success');
    log('Check Lofty Smart Plans - look for "[TEST] FUB Migration Test"', 'info');
  } catch (error) {
    setStatus(elements.loftyStatus, `API Error: ${error.message}`, 'error');
    log(`API test failed: ${error.message}`, 'error');
  }
}

// Create a test Smart Plan with two emails to test the internal API
async function createTestSmartPlan() {
  setStatus(elements.loftyStatus, 'Creating test Smart Plan with emails...', 'info');
  log('Creating Smart Plan with 2 email steps...', 'info');
  elements.createTestPlan.disabled = true;
  elements.createTestPlan.textContent = 'Creating...';

  // Full test payload with two email steps (from HANDOFF.md)
  const testPayload = {
    id: 0,
    // teamId and creatorId will be injected by loftyClient.createSmartPlan()
    name: "[TEST] Two Email Sequence - Delete Me",
    state: 0,  // 0 = draft (won't auto-send)
    accessFlag: 0,
    category: 1,
    repeatType: "ONCE",
    recurringType: 1,
    recurringTimes: 1,
    aiPlanFlag: false,

    // Two email steps
    planStepPackList: [
      // EMAIL 1: Immediate
      {
        realIndex: 0,
        leftActionType: "NORMAL",
        leftAction: {
          type: 5,  // 5 = email
          name: "Welcome Email",
          subject: "Welcome! We're excited to help you",
          body: "<div class=\"crm-ckeditor-email-wrap\" style=\"color:#515666;font-size:16px;font-family:-apple-system, BlinkMacSystemFont, Arial;line-height:1.5;\">Hi #lead_first_name#,<br><br>Thank you for reaching out! I'm excited to help you with your real estate needs.<br><br>I'll be in touch soon to learn more about what you're looking for.<br><br>Best regards</div>",
          editorJson: "",
          ext: "[]",
          params: "{\"cc2Members\":false}",
          langTemplateIds: [-1],
          langList: [{
            label: "English",
            value: "en",
            lang: "en",
            status: "published",
            subject: "Welcome! We're excited to help you",
            body: "<div class=\"crm-ckeditor-email-wrap\" style=\"color:#515666;font-size:16px;font-family:-apple-system, BlinkMacSystemFont, Arial;line-height:1.5;\">Hi #lead_first_name#,<br><br>Thank you for reaching out! I'm excited to help you with your real estate needs.<br><br>I'll be in touch soon to learn more about what you're looking for.<br><br>Best regards</div>",
            editing: true,
            id: 0
          }],
          id: 0,
          planStepId: 0,
          teamId: 0,
          allDay: false
        },
        decision: null,
        id: 0,
        teamId: 0,  // Will be injected
        smartPlanId: 0,
        type: 1,  // 1 = immediate
        assignToRole: 10,
        timing: null,
        wait: null,
        immediate: true,
        workingHoursStart: -1,
        workingHoursEnd: -1
      },

      // EMAIL 2: Day 1 (24 hours later) at 9:30 AM
      {
        realIndex: 1,
        leftActionType: "NORMAL",
        leftAction: {
          type: 5,  // 5 = email
          name: "Follow Up Email",
          subject: "Following up - any questions?",
          body: "<div class=\"crm-ckeditor-email-wrap\" style=\"color:#515666;font-size:16px;font-family:-apple-system, BlinkMacSystemFont, Arial;line-height:1.5;\">Hi #lead_first_name#,<br><br>I wanted to follow up and see if you had any questions about your home search.<br><br>I'm here to help whenever you're ready!<br><br>Best regards</div>",
          editorJson: "",
          ext: "[]",
          params: "{\"cc2Members\":false}",
          langTemplateIds: [-2],
          langList: [{
            label: "English",
            value: "en",
            lang: "en",
            status: "published",
            subject: "Following up - any questions?",
            body: "<div class=\"crm-ckeditor-email-wrap\" style=\"color:#515666;font-size:16px;font-family:-apple-system, BlinkMacSystemFont, Arial;line-height:1.5;\">Hi #lead_first_name#,<br><br>I wanted to follow up and see if you had any questions about your home search.<br><br>I'm here to help whenever you're ready!<br><br>Best regards</div>",
            editing: true,
            id: 0
          }],
          id: 0,
          planStepId: 0,
          teamId: 0,
          allDay: false
        },
        decision: null,
        id: 0,
        teamId: 0,  // Will be injected
        smartPlanId: 0,
        type: 3,  // 3 = scheduled
        assignToRole: 10,
        timing: 34200000,  // 9:30 AM (milliseconds from midnight)
        wait: 1,  // 1 day wait
        immediate: false,
        workingHoursStart: -1,
        workingHoursEnd: -1
      }
    ],

    // Trigger: Manual only (no auto-trigger)
    triggerConditions: [],

    // Auto-pause settings
    autoPause: {
      leadResponse: false,
      outboundCall: false,
      tagChange: false,
      sourceChange: false,
      pipelineChange: false,
      pauseOtherPlan: false,
      actionTrigger: "NoAction",
      pipeline: "",
      groups: [],
      tags: []
    },

    paymentInfo: { payType: 1, payerId: null, payerName: "" },
    leadTypeItems: [{ type: "all", ids: ["-1"] }],
    sourceIdList: [],
    pipelineIdList: [],
    groupIdList: [],
    tags: [],
    timeFrames: [],
    propertyTypes: [],
    withAgent: "N/A",
    withLender: "N/A",
    contactWay: [],
    contactPeriod: 0,
    visitSitePeriod: 7,
    leadScoreMin: -1,
    leadScoreMax: -1,
    revaluateScoreMin: -1,
    revaluateScoreMax: -1,
    excludeMatchLeads: false,
    pauseCondition: 0,
    forType: "",
    timeBasedType: "",
    autoMove: null,
    leadActivities: [],
    pondStatus: 0,
    pondIds: []
  };

  try {
    const result = await loftyClient.createSmartPlan(testPayload);
    setStatus(elements.loftyStatus, 'Smart Plan created successfully!', 'success');
    log('Smart Plan created! Check Lofty > Automation > Smart Plans', 'success');
    log(`Response: ${JSON.stringify(result)}`, 'info');

    // Show response in debug output
    elements.debugOutput.textContent = JSON.stringify(result, null, 2);
    elements.debugOutput.style.display = 'block';
  } catch (error) {
    setStatus(elements.loftyStatus, `Failed: ${error.message}`, 'error');
    log(`Creation failed: ${error.message}`, 'error');
  } finally {
    elements.createTestPlan.disabled = false;
    elements.createTestPlan.textContent = 'Create Test Smart Plan';
  }
}

// Show debug info - reads cookies and connection status
async function showDebugInfo() {
  setStatus(elements.loftyStatus, 'Getting debug info...', 'info');

  try {
    const result = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'GET_DEBUG_INFO' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    // Format and display
    const output = JSON.stringify(result, null, 2);
    elements.debugOutput.textContent = output;
    elements.debugOutput.style.display = 'block';

    // Log summary
    if (result.authCookies) {
      log(`Debug: _T=${result.authCookies._T}, _AT=${result.authCookies._AT}`, 'info');
    }
    if (result.loftyTab) {
      log(`Debug: Lofty tab found (id: ${result.loftyTab.id})`, 'info');
    } else {
      log('Debug: No Lofty tab found!', 'error');
    }

    setStatus(elements.loftyStatus, 'Debug info shown below', 'info');
  } catch (error) {
    setStatus(elements.loftyStatus, `Debug error: ${error.message}`, 'error');
    log(`Debug failed: ${error.message}`, 'error');
  }
}

// Search all Lofty scripts for the signature algorithm
async function searchAllScripts() {
  elements.searchStatus.textContent = 'Searching all Lofty JavaScript files...';
  elements.searchStatus.style.color = '#4a9eff';
  elements.searchScripts.disabled = true;
  elements.searchResults.style.display = 'none';
  log('Starting automated script search...', 'info');

  try {
    // Check if Lofty tab is available
    const checkResult = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'CHECK_LOFTY_TAB' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    if (!checkResult?.success) {
      elements.searchStatus.textContent = 'Please open crm.lofty.com in a browser tab first';
      elements.searchStatus.style.color = '#ff6b6b';
      log('No Lofty tab found', 'error');
      return;
    }

    // Send search request to content script
    const result = await sendToLoftyTab('SEARCH_ALL_SCRIPTS');

    if (result?.success && result?.data) {
      const data = result.data;
      let output = '=== SCRIPT SEARCH RESULTS ===\n\n';

      // Check for high-priority findings
      const highPriority = data.signaturePatterns.filter(p => p.priority === 'HIGH');
      if (highPriority.length > 0) {
        output += '🎯 HIGH PRIORITY - LIKELY ALGORITHM FOUND:\n';
        output += '=' .repeat(50) + '\n';
        highPriority.forEach((p, i) => {
          output += `\n${i + 1}. File: ${p.script}\n`;
          output += `   Match: ${p.match}\n`;
          if (p.context) {
            output += `   Context: ${p.context.substring(0, 300)}...\n`;
          }
        });
        output += '\n';
        log(`*** FOUND ${highPriority.length} HIGH PRIORITY MATCHES! ***`, 'success');
      }

      // Signature patterns
      if (data.signaturePatterns.length > 0) {
        output += `\n📝 SIGNATURE PATTERNS (${data.signaturePatterns.length}):\n`;
        output += '-'.repeat(40) + '\n';
        data.signaturePatterns.slice(0, 15).forEach((p, i) => {
          output += `${i + 1}. [${p.script}] ${p.pattern}: ${p.match.substring(0, 100)}\n`;
        });
      }

      // MD5 patterns
      if (data.md5Patterns.length > 0) {
        output += `\n🔐 MD5 USAGES (${data.md5Patterns.length}):\n`;
        output += '-'.repeat(40) + '\n';
        data.md5Patterns.slice(0, 10).forEach((p, i) => {
          output += `${i + 1}. [${p.script}]: ${p.match.substring(0, 100)}\n`;
        });
      }

      // AJAX patterns
      if (data.ajaxPatterns.length > 0) {
        output += `\n🌐 AJAX PATTERNS (${data.ajaxPatterns.length}):\n`;
        output += '-'.repeat(40) + '\n';
        data.ajaxPatterns.slice(0, 5).forEach((p, i) => {
          output += `${i + 1}. [${p.script}] ${p.pattern}: ${p.match.substring(0, 150)}...\n`;
        });
      }

      const totalFindings = data.signaturePatterns.length + data.md5Patterns.length +
                           data.timestampPatterns.length + data.ajaxPatterns.length;

      elements.searchResults.textContent = output;
      elements.searchResults.style.display = 'block';
      elements.searchStatus.textContent = `Found ${totalFindings} relevant code patterns!`;
      elements.searchStatus.style.color = '#4ade80';
      log(`Search complete: ${totalFindings} patterns found`, 'success');

      if (highPriority.length > 0) {
        setStatus(elements.loftyStatus, `Found ${highPriority.length} likely algorithm matches!`, 'success');
      }
    } else {
      elements.searchStatus.textContent = 'Search completed but no results returned';
      elements.searchStatus.style.color = '#fbbf24';
      log('Search completed but got no results', 'info');
    }

  } catch (error) {
    elements.searchStatus.textContent = `Error: ${error.message}`;
    elements.searchStatus.style.color = '#ff6b6b';
    log(`Search error: ${error.message}`, 'error');
    log('Try refreshing the Lofty tab and clicking Search again', 'info');
  } finally {
    elements.searchScripts.disabled = false;
  }
}

// Analyze signatures - triggers capture analysis in injected script
async function analyzeSignatures() {
  setStatus(elements.loftyStatus, 'Analyzing signatures...', 'info');
  log('Running signature analysis - check Lofty tab console for results', 'info');

  // Show manual test section
  elements.sigTestSection.style.display = 'block';

  // Auto-capture
  await captureSignatureData();
}

// Capture signature data using browser-level webRequest API
async function captureSignatureData() {
  elements.captureStatus.textContent = 'Getting captured signatures from browser...';
  elements.captureStatus.style.color = '#4a9eff';
  elements.captureSig.disabled = true;

  try {
    // Step 1: Get the _T cookie from background script
    const authCookies = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'GET_AUTH_COOKIES' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    if (authCookies?._T) {
      elements.sigToken.value = authCookies._T;
      log(`Got _T cookie: ${authCookies._T.substring(0, 10)}...`, 'success');
      if (authCookies._MT) {
        log(`Got _MT cookie: ${authCookies._MT.substring(0, 10)}...`, 'info');
        // Store _MT for testing
        window._mtCookie = authCookies._MT;
      }
    } else {
      elements.captureStatus.textContent = 'Could not get _T cookie - are you logged into Lofty?';
      elements.captureStatus.style.color = '#ff6b6b';
      elements.captureSig.disabled = false;
      return;
    }

    // Step 2: Get captured signatures from browser-level interception
    const result = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'GET_CAPTURED_SIGNATURES' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    if (result?.signatures?.length > 0) {
      const latest = result.signatures[result.signatures.length - 1];

      if (latest.timestamp) elements.sigTimestamp.value = latest.timestamp;
      if (latest.signature) elements.sigExpected.value = latest.signature;

      // Store URL for algorithm testing
      lastCapturedUrl = latest.url || '';

      elements.captureStatus.textContent = `Found ${result.count} captured request(s)! Click "Test Algorithms"`;
      elements.captureStatus.style.color = '#4ade80';
      log(`Captured: timestamp=${latest.timestamp}, signature=${latest.signature}`, 'success');
      log(`URL: ${latest.url}`, 'info');
      log(`Method: ${latest.method || 'unknown'}`, 'info');

      // Show all captured in debug output with URL prominently
      const displayData = result.signatures.slice(-5).map(s => ({
        url: s.url,
        method: s.method,
        signature: s.signature,
        timestamp: s.timestamp
      }));
      elements.debugOutput.textContent = JSON.stringify(displayData, null, 2);
      elements.debugOutput.style.display = 'block';
    } else {
      elements.captureStatus.textContent = 'No signatures captured yet. Click around in Lofty tab to trigger API requests, then click Capture again.';
      elements.captureStatus.style.color = '#fbbf24';
      log('No signatures captured. Navigate around in the Lofty tab to trigger API requests.', 'info');
      log('The browser-level interceptor will capture them automatically.', 'info');
    }

  } catch (error) {
    elements.captureStatus.textContent = `Error: ${error.message}`;
    elements.captureStatus.style.color = '#ff6b6b';
    log(`Capture error: ${error.message}`, 'error');
  } finally {
    elements.captureSig.disabled = false;
  }
}

// Simple MD5 implementation for testing signatures
function md5(string) {
  function rotateLeft(val, shift) {
    return (val << shift) | (val >>> (32 - shift));
  }
  function addUnsigned(x, y) {
    const x4 = x & 0x80000000, y4 = y & 0x80000000;
    const x8 = x & 0x40000000, y8 = y & 0x40000000;
    const result = (x & 0x3FFFFFFF) + (y & 0x3FFFFFFF);
    if (x8 & y8) return result ^ 0x80000000 ^ x4 ^ y4;
    if (x8 | y8) {
      if (result & 0x40000000) return result ^ 0xC0000000 ^ x4 ^ y4;
      return result ^ 0x40000000 ^ x4 ^ y4;
    }
    return result ^ x4 ^ y4;
  }
  function F(x, y, z) { return (x & y) | (~x & z); }
  function G(x, y, z) { return (x & z) | (y & ~z); }
  function H(x, y, z) { return x ^ y ^ z; }
  function I(x, y, z) { return y ^ (x | ~z); }
  function FF(a, b, c, d, x, s, ac) { a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac)); return addUnsigned(rotateLeft(a, s), b); }
  function GG(a, b, c, d, x, s, ac) { a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac)); return addUnsigned(rotateLeft(a, s), b); }
  function HH(a, b, c, d, x, s, ac) { a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac)); return addUnsigned(rotateLeft(a, s), b); }
  function II(a, b, c, d, x, s, ac) { a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac)); return addUnsigned(rotateLeft(a, s), b); }
  function convertToWordArray(str) {
    const len = str.length, wordCount = ((len + 8) >>> 6) + 1;
    const words = new Array(wordCount * 16).fill(0);
    for (let i = 0; i < len; i++) words[i >>> 2] |= str.charCodeAt(i) << ((i % 4) * 8);
    words[len >>> 2] |= 0x80 << ((len % 4) * 8);
    words[wordCount * 16 - 2] = len * 8;
    return words;
  }
  function wordToHex(val) {
    let hex = '';
    for (let i = 0; i <= 3; i++) hex += ('0' + ((val >>> (i * 8)) & 255).toString(16)).slice(-2);
    return hex;
  }
  const x = convertToWordArray(string);
  let a = 0x67452301, b = 0xEFCDAB89, c = 0x98BADCFE, d = 0x10325476;
  for (let k = 0; k < x.length; k += 16) {
    const AA = a, BB = b, CC = c, DD = d;
    a = FF(a, b, c, d, x[k], 7, 0xD76AA478); d = FF(d, a, b, c, x[k + 1], 12, 0xE8C7B756);
    c = FF(c, d, a, b, x[k + 2], 17, 0x242070DB); b = FF(b, c, d, a, x[k + 3], 22, 0xC1BDCEEE);
    a = FF(a, b, c, d, x[k + 4], 7, 0xF57C0FAF); d = FF(d, a, b, c, x[k + 5], 12, 0x4787C62A);
    c = FF(c, d, a, b, x[k + 6], 17, 0xA8304613); b = FF(b, c, d, a, x[k + 7], 22, 0xFD469501);
    a = FF(a, b, c, d, x[k + 8], 7, 0x698098D8); d = FF(d, a, b, c, x[k + 9], 12, 0x8B44F7AF);
    c = FF(c, d, a, b, x[k + 10], 17, 0xFFFF5BB1); b = FF(b, c, d, a, x[k + 11], 22, 0x895CD7BE);
    a = FF(a, b, c, d, x[k + 12], 7, 0x6B901122); d = FF(d, a, b, c, x[k + 13], 12, 0xFD987193);
    c = FF(c, d, a, b, x[k + 14], 17, 0xA679438E); b = FF(b, c, d, a, x[k + 15], 22, 0x49B40821);
    a = GG(a, b, c, d, x[k + 1], 5, 0xF61E2562); d = GG(d, a, b, c, x[k + 6], 9, 0xC040B340);
    c = GG(c, d, a, b, x[k + 11], 14, 0x265E5A51); b = GG(b, c, d, a, x[k], 20, 0xE9B6C7AA);
    a = GG(a, b, c, d, x[k + 5], 5, 0xD62F105D); d = GG(d, a, b, c, x[k + 10], 9, 0x2441453);
    c = GG(c, d, a, b, x[k + 15], 14, 0xD8A1E681); b = GG(b, c, d, a, x[k + 4], 20, 0xE7D3FBC8);
    a = GG(a, b, c, d, x[k + 9], 5, 0x21E1CDE6); d = GG(d, a, b, c, x[k + 14], 9, 0xC33707D6);
    c = GG(c, d, a, b, x[k + 3], 14, 0xF4D50D87); b = GG(b, c, d, a, x[k + 8], 20, 0x455A14ED);
    a = GG(a, b, c, d, x[k + 13], 5, 0xA9E3E905); d = GG(d, a, b, c, x[k + 2], 9, 0xFCEFA3F8);
    c = GG(c, d, a, b, x[k + 7], 14, 0x676F02D9); b = GG(b, c, d, a, x[k + 12], 20, 0x8D2A4C8A);
    a = HH(a, b, c, d, x[k + 5], 4, 0xFFFA3942); d = HH(d, a, b, c, x[k + 8], 11, 0x8771F681);
    c = HH(c, d, a, b, x[k + 11], 16, 0x6D9D6122); b = HH(b, c, d, a, x[k + 14], 23, 0xFDE5380C);
    a = HH(a, b, c, d, x[k + 1], 4, 0xA4BEEA44); d = HH(d, a, b, c, x[k + 4], 11, 0x4BDECFA9);
    c = HH(c, d, a, b, x[k + 7], 16, 0xF6BB4B60); b = HH(b, c, d, a, x[k + 10], 23, 0xBEBFBC70);
    a = HH(a, b, c, d, x[k + 13], 4, 0x289B7EC6); d = HH(d, a, b, c, x[k], 11, 0xEAA127FA);
    c = HH(c, d, a, b, x[k + 3], 16, 0xD4EF3085); b = HH(b, c, d, a, x[k + 6], 23, 0x4881D05);
    a = HH(a, b, c, d, x[k + 9], 4, 0xD9D4D039); d = HH(d, a, b, c, x[k + 12], 11, 0xE6DB99E5);
    c = HH(c, d, a, b, x[k + 15], 16, 0x1FA27CF8); b = HH(b, c, d, a, x[k + 2], 23, 0xC4AC5665);
    a = II(a, b, c, d, x[k], 6, 0xF4292244); d = II(d, a, b, c, x[k + 7], 10, 0x432AFF97);
    c = II(c, d, a, b, x[k + 14], 15, 0xAB9423A7); b = II(b, c, d, a, x[k + 5], 21, 0xFC93A039);
    a = II(a, b, c, d, x[k + 12], 6, 0x655B59C3); d = II(d, a, b, c, x[k + 3], 10, 0x8F0CCC92);
    c = II(c, d, a, b, x[k + 10], 15, 0xFFEFF47D); b = II(b, c, d, a, x[k + 1], 21, 0x85845DD1);
    a = II(a, b, c, d, x[k + 8], 6, 0x6FA87E4F); d = II(d, a, b, c, x[k + 15], 10, 0xFE2CE6E0);
    c = II(c, d, a, b, x[k + 6], 15, 0xA3014314); b = II(b, c, d, a, x[k + 13], 21, 0x4E0811A1);
    a = II(a, b, c, d, x[k + 4], 6, 0xF7537E82); d = II(d, a, b, c, x[k + 11], 10, 0xBD3AF235);
    c = II(c, d, a, b, x[k + 2], 15, 0x2AD7D2BB); b = II(b, c, d, a, x[k + 9], 21, 0xEB86D391);
    a = addUnsigned(a, AA); b = addUnsigned(b, BB); c = addUnsigned(c, CC); d = addUnsigned(d, DD);
  }
  return wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d);
}

// Store the last captured URL for testing
let lastCapturedUrl = '';

// Test signature algorithm with captured values - runs locally
function testSignatureAlgorithm() {
  const token = elements.sigToken.value.trim();
  const timestamp = elements.sigTimestamp.value.trim();
  const expected = elements.sigExpected.value.trim();

  if (!token || !timestamp || !expected) {
    log('Please fill in all signature test fields (use "Capture from Lofty" first)', 'error');
    return;
  }

  log(`Testing algorithms with token=${token.substring(0, 10)}..., ts=${timestamp}`, 'info');
  log(`Expected signature: ${expected}`, 'info');

  // Extract URL path from last captured URL
  let urlPath = '';
  if (lastCapturedUrl) {
    try {
      const url = new URL(lastCapturedUrl);
      urlPath = url.pathname;
      log(`URL path: ${urlPath}`, 'info');
    } catch (e) {
      urlPath = lastCapturedUrl.replace('https://crm.lofty.com', '');
    }
  }

  // Test many different algorithm combinations
  const algorithms = [
    // Basic combinations
    { name: 'token + timestamp', fn: () => md5(token + timestamp) },
    { name: 'timestamp + token', fn: () => md5(timestamp + token) },
    { name: 'token + ":" + timestamp', fn: () => md5(token + ':' + timestamp) },
    { name: 'timestamp + ":" + token', fn: () => md5(timestamp + ':' + token) },

    // With URL path
    { name: 'token + timestamp + urlPath', fn: () => md5(token + timestamp + urlPath) },
    { name: 'urlPath + token + timestamp', fn: () => md5(urlPath + token + timestamp) },
    { name: 'token + urlPath + timestamp', fn: () => md5(token + urlPath + timestamp) },
    { name: 'timestamp + urlPath + token', fn: () => md5(timestamp + urlPath + token) },
    { name: 'timestamp + token + urlPath', fn: () => md5(timestamp + token + urlPath) },
    { name: 'urlPath + timestamp + token', fn: () => md5(urlPath + timestamp + token) },

    // With platform "10"
    { name: '"10" + token + timestamp', fn: () => md5('10' + token + timestamp) },
    { name: 'token + "10" + timestamp', fn: () => md5(token + '10' + timestamp) },
    { name: 'token + timestamp + "10"', fn: () => md5(token + timestamp + '10') },
    { name: 'timestamp + token + "10"', fn: () => md5(timestamp + token + '10') },
    { name: '"10" + timestamp + token', fn: () => md5('10' + timestamp + token) },

    // With common salts
    { name: 'token + timestamp + "lofty"', fn: () => md5(token + timestamp + 'lofty') },
    { name: '"lofty" + token + timestamp', fn: () => md5('lofty' + token + timestamp) },
    { name: 'token + timestamp + "chime"', fn: () => md5(token + timestamp + 'chime') },
    { name: '"chime" + token + timestamp', fn: () => md5('chime' + token + timestamp) },

    // Different separators
    { name: 'token + "|" + timestamp', fn: () => md5(token + '|' + timestamp) },
    { name: 'token + "&" + timestamp', fn: () => md5(token + '&' + timestamp) },
    { name: 'token + "," + timestamp', fn: () => md5(token + ',' + timestamp) },

    // Nested hashing
    { name: 'md5(token) + timestamp', fn: () => md5(md5(token) + timestamp) },
    { name: 'token + md5(timestamp)', fn: () => md5(token + md5(timestamp)) },
    { name: 'md5(token + timestamp) again', fn: () => md5(md5(token + timestamp)) },
    { name: 'md5(md5(token) + timestamp)', fn: () => md5(md5(token) + timestamp) },

    // Substring variations
    { name: 'token.slice(0,16) + timestamp', fn: () => md5(token.slice(0, 16) + timestamp) },
    { name: 'token.slice(-16) + timestamp', fn: () => md5(token.slice(-16) + timestamp) },
    { name: 'timestamp + token.slice(0,16)', fn: () => md5(timestamp + token.slice(0, 16)) },

    // Reversed
    { name: 'reverse(token) + timestamp', fn: () => md5(token.split('').reverse().join('') + timestamp) },
    { name: 'token + reverse(timestamp)', fn: () => md5(token + timestamp.split('').reverse().join('')) },

    // Uppercase token
    { name: 'TOKEN.upper + timestamp', fn: () => md5(token.toUpperCase() + timestamp) },
    { name: 'timestamp + TOKEN.upper', fn: () => md5(timestamp + token.toUpperCase()) },

    // With method
    { name: '"GET" + token + timestamp', fn: () => md5('GET' + token + timestamp) },
    { name: '"POST" + token + timestamp', fn: () => md5('POST' + token + timestamp) },
    { name: 'token + timestamp + "GET"', fn: () => md5(token + timestamp + 'GET') },

    // Timestamp variations (seconds vs ms)
    { name: 'token + ts/1000', fn: () => md5(token + Math.floor(parseInt(timestamp)/1000).toString()) },
    { name: 'ts/1000 + token', fn: () => md5(Math.floor(parseInt(timestamp)/1000).toString() + token) },
  ];

  // Add _MT cookie tests if available
  const mtCookie = window._mtCookie;
  if (mtCookie) {
    algorithms.push(
      { name: '_MT + timestamp', fn: () => md5(mtCookie + timestamp) },
      { name: 'timestamp + _MT', fn: () => md5(timestamp + mtCookie) },
      { name: '_MT + ":" + timestamp', fn: () => md5(mtCookie + ':' + timestamp) },
      { name: '_MT + token + timestamp', fn: () => md5(mtCookie + token + timestamp) },
      { name: 'token + _MT + timestamp', fn: () => md5(token + mtCookie + timestamp) },
      { name: '_MT + timestamp + token', fn: () => md5(mtCookie + timestamp + token) },
      { name: 'timestamp + _MT + token', fn: () => md5(timestamp + mtCookie + token) },
      { name: 'md5(_MT) + timestamp', fn: () => md5(md5(mtCookie) + timestamp) },
      { name: '_MT.slice(0,32) + timestamp', fn: () => md5(mtCookie.slice(0, 32) + timestamp) },
    );
    log(`Also testing with _MT cookie (${mtCookie.length} chars)`, 'info');
  }

  // Additional algorithm variations - common patterns in API signing
  const platform = '10';
  const apiPath = urlPath || '/api/smart-plan-server/settings/save';

  // Known salts that might be used (Lofty was formerly Chime)
  const possibleSalts = ['chime', 'lofty', 'crm', 'api', 'secret', 'key', 'sign', 'ChimeSign', 'LoftySign', 'Chime', 'Lofty'];

  for (const salt of possibleSalts) {
    algorithms.push(
      { name: `"${salt}" + token + timestamp`, fn: () => md5(salt + token + timestamp) },
      { name: `token + "${salt}" + timestamp`, fn: () => md5(token + salt + timestamp) },
      { name: `token + timestamp + "${salt}"`, fn: () => md5(token + timestamp + salt) },
      { name: `md5("${salt}" + token) + timestamp`, fn: () => md5(md5(salt + token) + timestamp) },
    );
  }

  // URL-based patterns (common in API signing)
  algorithms.push(
    { name: 'apiPath + token + timestamp', fn: () => md5(apiPath + token + timestamp) },
    { name: 'token + apiPath + timestamp', fn: () => md5(token + apiPath + timestamp) },
    { name: 'md5(token + apiPath) + timestamp', fn: () => md5(md5(token + apiPath) + timestamp) },
    { name: 'platform + apiPath + token + timestamp', fn: () => md5(platform + apiPath + token + timestamp) },
    { name: 'token + platform + apiPath + timestamp', fn: () => md5(token + platform + apiPath + timestamp) },
  );

  // HMAC-like patterns (key prefixed/suffixed)
  algorithms.push(
    { name: 'token + ":" + timestamp + ":" + platform', fn: () => md5(token + ':' + timestamp + ':' + platform) },
    { name: 'platform + ":" + token + ":" + timestamp', fn: () => md5(platform + ':' + token + ':' + timestamp) },
    { name: 'timestamp + ":" + platform + ":" + token', fn: () => md5(timestamp + ':' + platform + ':' + token) },
  );

  // Double hashing patterns
  algorithms.push(
    { name: 'md5(md5(token) + md5(timestamp))', fn: () => md5(md5(token) + md5(timestamp)) },
    { name: 'md5(timestamp + md5(token))', fn: () => md5(timestamp + md5(token)) },
    { name: 'md5(md5(token + timestamp) + platform)', fn: () => md5(md5(token + timestamp) + platform) },
  );

  // Lowercase/uppercase variations
  algorithms.push(
    { name: 'token.lower + timestamp', fn: () => md5(token.toLowerCase() + timestamp) },
    { name: 'md5(token).upper + timestamp', fn: () => md5(md5(token).toUpperCase() + timestamp) },
  );

  // Including method
  algorithms.push(
    { name: '"POST" + apiPath + token + timestamp', fn: () => md5('POST' + apiPath + token + timestamp) },
    { name: 'token + timestamp + "POST" + apiPath', fn: () => md5(token + timestamp + 'POST' + apiPath) },
  );

  let output = 'ALGORITHM TEST RESULTS:\n\n';
  let foundMatch = null;

  for (const algo of algorithms) {
    try {
      const hash = algo.fn();
      const isMatch = hash === expected;
      const status = isMatch ? '✓ MATCH!' : '✗';

      if (isMatch) {
        foundMatch = algo.name;
        output = `✓✓✓ MATCH FOUND: ${algo.name} ✓✓✓\n\nHash: ${hash}\n\n` + output;
      }

      output += `${status} ${algo.name}\n   Hash: ${hash}\n\n`;
    } catch (e) {
      output += `✗ ${algo.name}\n   Error: ${e.message}\n\n`;
    }
  }

  elements.sigTestResult.textContent = output;
  elements.sigTestResult.style.display = 'block';

  if (foundMatch) {
    log(`*** ALGORITHM FOUND: ${foundMatch} ***`, 'success');
    setStatus(elements.loftyStatus, `Algorithm found: ${foundMatch}`, 'success');
  } else {
    log('No matching algorithm found. The algorithm may include URL path or other data.', 'error');
    setStatus(elements.loftyStatus, 'No match found - see results below', 'error');
  }
}

// Helper to send message to Lofty tab via background script
async function sendToLoftyTab(type, extraData = {}) {
  return new Promise((resolve, reject) => {
    // First find the Lofty tab
    chrome.runtime.sendMessage({ type: 'CHECK_LOFTY_TAB' }, (checkResult) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!checkResult?.success) {
        reject(new Error(checkResult?.error || 'No Lofty tab found'));
        return;
      }

      // Send to content script in that tab
      chrome.tabs.sendMessage(checkResult.tabId, {
        type: 'RELAY_TO_INJECTED',
        relayType: type,
        ...extraData
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  });
}

// Fetch Plans
async function fetchPlans() {
  if (!fubClient) {
    setStatus(elements.fubStatus, 'Please save FUB API key first', 'error');
    return;
  }

  elements.fetchPlans.disabled = true;
  elements.fetchPlans.textContent = 'Fetching...';
  log('Fetching action plans from FUB...', 'info');

  try {
    actionPlans = await fubClient.getActionPlans();
    log(`Found ${actionPlans.length} action plans`, 'success');

    renderPlansList();
    elements.plansContainer.style.display = 'block';
  } catch (error) {
    log(`Error fetching plans: ${error.message}`, 'error');
  } finally {
    elements.fetchPlans.disabled = false;
    elements.fetchPlans.textContent = 'Fetch FUB Plans';
  }
}

function renderPlansList() {
  elements.plansList.innerHTML = '';
  selectedPlanIds.clear();

  actionPlans.forEach(plan => {
    const div = document.createElement('div');
    div.className = 'plan-item';
    div.innerHTML = `
      <input type="checkbox" id="plan-${plan.id}" data-plan-id="${plan.id}">
      <label for="plan-${plan.id}">${plan.name}</label>
      <span class="step-count">${plan.stepCount} steps</span>
    `;

    const checkbox = div.querySelector('input');
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedPlanIds.add(plan.id);
      } else {
        selectedPlanIds.delete(plan.id);
      }
      updateMigrationButton();
    });

    elements.plansList.appendChild(div);
  });

  updateMigrationButton();
}

function selectPlans(selectAll) {
  const checkboxes = elements.plansList.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.checked = selectAll;
    const planId = parseInt(cb.dataset.planId);
    if (selectAll) {
      selectedPlanIds.add(planId);
    } else {
      selectedPlanIds.delete(planId);
    }
  });
  updateMigrationButton();
}

function updateMigrationButton() {
  elements.startMigration.disabled = selectedPlanIds.size === 0;
  elements.startMigration.textContent = selectedPlanIds.size > 0
    ? `Upload ${selectedPlanIds.size} drip${selectedPlanIds.size > 1 ? 's' : ''} to Lofty`
    : 'Upload to Lofty';
}

/**
 * Each plan carries its own trigger (plan.trigger), written by the kit's data builder from the
 * source account's automations. Names are looked up in the signed-in Lofty account, so nothing
 * here is tied to one account.
 */
// FUB stage name -> other names the same stage may have in Lofty
const STAGE_ALIASES = {
  'a - hot 1-3 months': ['hot 1-3 months', 'hot'],
  'b - warm 3-6 months': ['warm 3-6 months', 'warm'],
  'c - cold 6+ months': ['cold 6+ months', 'cold'],
  'active client': ['active clients', 'active'],
  'pending': ['under contract'],
  'renter - future buyer': ['renter to buyer', 'renter'],
  'past client': ['past clients', 'closed'],
  'sphere': ['sphere of influence', 'soi']
};

// The signed-in account's tags and pipeline stages, by lowercase name
let account = { loaded: false, tags: {}, pipelines: {}, pipelinesError: null };

async function loadLoftyAccount() {
  const tagRes = await chrome.runtime.sendMessage({ type: 'GET_LOFTY_TAGS' });
  if (!tagRes?.success) throw new Error(tagRes?.error || 'Could not read Lofty tags');
  account.tags = {};
  for (const t of tagRes.data || []) account.tags[t.tagName.toLowerCase()] = { id: t.id, name: t.tagName };
  Converter.setTagMapping((tagRes.data || []).map(t => ({ id: t.id, name: t.tagName })));

  account.pipelines = {}; account.pipelinesError = null;
  try {
    const pRes = await chrome.runtime.sendMessage({ type: 'GET_LOFTY_PIPELINES' });
    if (!pRes?.success) throw new Error(pRes?.error || 'no answer');
    for (const p of pRes.data || []) account.pipelines[p.name.toLowerCase()] = p;
  } catch (e) {
    account.pipelinesError = e.message;
  }
  account.loaded = true;
  log(`Lofty account: ${Object.keys(account.tags).length} tags, ${Object.keys(account.pipelines).length} pipeline stages` +
      (account.pipelinesError ? ` (pipeline lookup failed: ${account.pipelinesError})` : ''), 'info');
}

/**
 * Trigger for a plan, resolved against the signed-in account. Returns:
 *   null                                  skip (calendar plans: set up in Lofty)
 *   { type: 'missing', what }             a trigger tag doesn't exist yet: refuse, create it first
 *   { type: 'manual', setByHand? }        upload with no trigger (setByHand says what to set)
 *   { type: 'tag', tagIds, note? } / { type: 'pipeline', pipelineIds, note? }
 */
function getTriggerConfig(plan) {
  const t = plan.trigger || { kind: 'manual' };
  if (t.kind === 'calendar') return null;
  if (t.kind === 'byHand') return { type: 'manual', setByHand: t.note };
  if (t.kind === 'tag') {
    const missing = t.tags.filter(n => !account.tags[n.toLowerCase()]);
    if (missing.length) return { type: 'missing', what: `tag(s) ${missing.join(', ')}` };
    return { type: 'tag', tagIds: t.tags.map(n => account.tags[n.toLowerCase()].id), check: `Tag added, any of: ${t.tags.join(', ')}`, note: t.note };
  }
  if (t.kind === 'stage' || t.kind === 'stageTag') {
    const want = `Pipeline has changed to: ${t.stages.join(' or ')}` + (t.tag ? `, and the lead has the tag ${t.tag}` : '');
    const extra = t.note ? ` ${t.note}` : '';
    if (account.pipelinesError) return { type: 'manual', setByHand: `${want} (could not read your pipeline stages).${extra}` };
    const ids = [];
    for (const name of t.stages) {
      const names = [name.toLowerCase(), ...(STAGE_ALIASES[name.toLowerCase()] || [])];
      const hit = names.map(n => account.pipelines[n]).find(Boolean);
      if (!hit) return { type: 'manual', setByHand: `${want} (your Lofty has no stage named "${name}": pick your matching stage).${extra}` };
      ids.push(hit.id);
    }
    if (t.kind === 'stage') return { type: 'pipeline', pipelineIds: ids, check: want, note: t.note };
    const tag = account.tags[t.tag.toLowerCase()];
    if (!tag) return { type: 'missing', what: `tag(s) ${t.tag}` };
    return { type: 'compound', pipelineIds: ids, tagIds: [tag.id], check: want, note: t.note, experimental: true, keepOnStageChange: !!t.keepOnStageChange };
  }
  if (t.kind === 'activity') {
    // The new format's lead-activity trigger has not been captured yet: upload without one.
    return { type: 'manual', setByHand: `Lead Engagement trigger: the lead views or saves a listing. ${t.note || ''}` };
  }
  return { type: 'manual', manualNote: t.note };
}

/** Tags a plan's steps add or remove that the account doesn't have yet. */
function missingStepTags(plan) {
  const out = new Set();
  for (const st of plan.steps || []) for (const t of st.tags || []) if (!account.tags[t.toLowerCase()]) out.add(t);
  return [...out];
}

// Migration
async function startMigration() {
  if (selectedPlanIds.size === 0) return;
  if (needsDetails() && !agentDetails) {
    log('Fill in "Your details" at the top and press Save first.', 'error');
    return;
  }

  // Check Lofty connection first
  if (!loftyClient.teamId) {
    const result = await loftyClient.testConnection();
    if (!result.success) {
      log('Please check Lofty connection first', 'error');
      return;
    }
  }

  try {
    await loadLoftyAccount();
  } catch (e) {
    log(`Could not read your Lofty tags: ${e.message}`, 'error');
    return;
  }

  const planIds = Array.from(selectedPlanIds);

  // Get destination setting (company=1, personal=0)
  const destination = document.getElementById('destination-select').value;
  const accessFlag = destination === 'personal' ? 0 : 1;

  log(`Starting migration of ${planIds.length} plans to ${destination === 'personal' ? 'Personal' : 'Company'} Smart Plans...`, 'info');

  elements.startMigration.disabled = true;
  elements.progressContainer.style.display = 'block';

  let successCount = 0;
  let failCount = 0;
  const failedPlans = [];  // Track failed plans for summary

  // Get selected plans from local data (no FUB API needed!)
  const uploaded = (await chrome.storage.local.get(['uploadedPlans'])).uploadedPlans || {};
  const handNotes = [];
  const selectedPlans = actionPlans.filter(plan => planIds.includes(plan.id));
  log(`Found ${selectedPlans.length} plans in local data`, 'info');

  // Convert and upload each plan
  for (let i = 0; i < selectedPlans.length; i++) {
    const fubPlan = selectedPlans[i];
    let triggerConfig = null;
    let loftyPayload = null;

    try {
      // Determine trigger config based on plan name
      triggerConfig = getTriggerConfig(fubPlan);

      // Skip calendar-based plans (null config means skip)
      if (triggerConfig === null) {
        log(`Skipping calendar plan: ${fubPlan.name}`, 'info');
        continue;
      }

      if (triggerConfig.type === 'missing') {
        throw new Error(`Your Lofty account has no ${triggerConfig.what}. Create it (Tags: Analyze, then Create missing tags; pipeline stages in Lofty settings), then migrate this plan again.`);
      }
      const missingTags = missingStepTags(fubPlan);
      if (missingTags.length) {
        throw new Error(`Steps use tag(s) your Lofty account doesn't have: ${missingTags.join(', ')}. Use Tags: Analyze, then Create missing tags, and migrate again.`);
      }
      if (uploaded[fubPlan.name]) {
        log(`Skipping "${fubPlan.name}": already uploaded from this browser on ${uploaded[fubPlan.name]}. Delete it in Lofty and click "Forget upload history" to upload it again.`, 'info');
        continue;
      }

      // Log trigger config for debugging
      log(`[DEBUG] Trigger config for "${fubPlan.name}": ${JSON.stringify(triggerConfig)}`, 'info');

      // Convert to Lofty format with proper trigger
      const includeTexts = !!document.getElementById('include-first-texts')?.checked;
      const convOpts = { accessFlag, pauseOnReply: !!fubPlan.pauseOnReply, firstText: includeTexts, keepOnStageChange: !!fubPlan.trigger?.keepOnStageChange };
      const loftyAccount = await loftyClient.getAccount();
      let built = ConverterV2.build(fubPlan, triggerConfig, convOpts, loftyAccount);
      loftyPayload = built.payload;
      const summary = { planName: fubPlan.name, totalSteps: fubPlan.steps?.length || 0 };

      const triggerDesc = triggerConfig.type === 'manual' ? 'manual' :
                          triggerConfig.type === 'tag' ? `tag trigger` :
                          triggerConfig.type === 'pipeline' ? `pipeline trigger` : triggerConfig.type === 'compound' ? 'stage + tag trigger' : triggerConfig.type === 'activity' ? 'activity trigger' : 'unknown';
      log(`Converting: ${summary.planName} (${summary.totalSteps} steps, ${triggerDesc})`, 'info');

      // Log payload size and key fields for debugging
      const payloadStr = JSON.stringify(loftyPayload);
      log(`[DEBUG] Payload size: ${payloadStr.length} bytes, nodes: ${loftyPayload.planStepPackListV2?.length || 0}`, 'info');
      log(`[DEBUG] triggerConditions: ${JSON.stringify(loftyPayload.triggerConditions)}`, 'info');

      // Upload to Lofty. Triggers Lofty has not been seen to accept from this tool (stage + tag,
      // lead activity) get one retry with no trigger, so the plan still arrives.
      let triggerDropped = false;
      const progress = (done, total) => { elements.progressText.textContent = `${fubPlan.name}: email ${done} of ${total}...`; };
      try {
        await loftyClient.createSmartPlanV2(built, progress);
      } catch (firstError) {
        if (!triggerConfig.experimental) throw firstError;
        log(`Lofty refused "${fubPlan.name}" with its trigger (${firstError.message}). Uploading it with no trigger instead.`, 'info');
        built = ConverterV2.build(fubPlan, { type: 'manual' }, convOpts, loftyAccount);
        loftyPayload = built.payload;
        await loftyClient.createSmartPlanV2(built, progress);
        triggerDropped = true;
      }

      // What to check or finish in Lofty for this plan
      const fin = [];
      if (triggerConfig.setByHand) fin.push(`NO TRIGGER SET. ${triggerConfig.setByHand}`);
      else if (triggerDropped) fin.push(`NO TRIGGER SET (Lofty refused it). Set: ${triggerConfig.check}. ${triggerConfig.note || ''}`);
      else if (triggerConfig.check) fin.push(`Trigger set${triggerConfig.experimental ? ' (new kind for this tool: open the plan and CHECK it)' : ''}. It should read: ${triggerConfig.check}. ${triggerConfig.note || ''}`);
      else if (triggerConfig.manualNote) fin.push(`No trigger. ${triggerConfig.manualNote}`);
      if (fubPlan.firstText) fin.push(`First text NOT added (this tool doesn't create text steps). FUB sent, ${fubPlan.firstText.delayMinutes} min after the lead arrived: "${fubPlan.firstText.body}"`);
      for (const n of fubPlan.finishNotes || []) fin.push(n);
      const taskAt = (fubPlan.steps || []).findIndex(st => st.action === 'createTask' || st.action === 'addNote');
      if (taskAt !== -1) fin.push(`Has a task step (step ${taskAt + 1}). In Lofty a task holds the plan until it is marked complete.`);
      if (fin.length) handNotes.push(`${fubPlan.name}\n   - ${fin.join('\n   - ')}`);

      log(`Migrated: ${fubPlan.name}`, 'success');
      successCount++;
      uploaded[fubPlan.name] = new Date().toLocaleDateString();
      await chrome.storage.local.set({ uploadedPlans: uploaded });
    } catch (error) {
      // Comprehensive error logging
      const errorDetails = {
        planName: fubPlan.name,
        planId: fubPlan.id,
        stepCount: fubPlan.stepCount,
        errorMessage: error.message,
        errorCode: error.errorCode,
        errorStack: error.stack,
        triggerError: error.triggerError,
        signatureError: error.signatureError,
        fullResponse: error.fullResponse,
        triggerConfig: triggerConfig,
        payloadSize: loftyPayload ? JSON.stringify(loftyPayload).length : 0,
        triggerConditions: loftyPayload?.triggerConditions,
        planStepCount: loftyPayload?.planStepPackList?.length
      };

      log(`❌ FAILED: ${fubPlan.name}`, 'error');
      log(`[ERROR] Message: ${error.message}`, 'error');

      // Show error code if available
      if (error.errorCode) {
        log(`[ERROR] Error Code: ${error.errorCode}`, 'error');
      }

      // Flag specific error types
      if (error.signatureError) {
        log(`[ERROR] ⚠️ SIGNATURE ERROR - API authentication issue`, 'error');
      }
      if (error.triggerError) {
        log(`[ERROR] ⚠️ TRIGGER ERROR - Issue with trigger configuration`, 'error');
      }

      log(`[ERROR] Plan ID: ${fubPlan.id}, Steps: ${fubPlan.stepCount}`, 'error');
      log(`[ERROR] Trigger: ${JSON.stringify(triggerConfig)}`, 'error');

      if (loftyPayload) {
        log(`[ERROR] Payload size: ${JSON.stringify(loftyPayload).length} bytes`, 'error');
        log(`[ERROR] Trigger conditions: ${JSON.stringify(loftyPayload.triggerConditions)}`, 'error');

        // Log first action for debugging
        if (loftyPayload.planStepPackList?.length > 0) {
          const firstStep = loftyPayload.planStepPackList[0];
          log(`[ERROR] First step type: ${firstStep.leftAction?.type}, name: ${firstStep.leftAction?.name}`, 'error');
        }
      }

      // Show full API response if available
      if (error.fullResponse) {
        log(`[ERROR] Full API Response: ${JSON.stringify(error.fullResponse)}`, 'error');
      }

      // Also log to console with full details
      console.error('[FUB-Lofty] Migration failed:', errorDetails);
      console.error('[FUB-Lofty] Full payload:', loftyPayload);

      failedPlans.push(errorDetails);
      failCount++;
    }

    // Update progress
    const pct = Math.round(((i + 1) / selectedPlans.length) * 100);
    elements.progressFill.style.width = `${pct}%`;
    elements.progressText.textContent = `Migrating ${i + 1} of ${selectedPlans.length}...`;

    // Small delay between uploads
    await new Promise(r => setTimeout(r, 500));
  }

  // Done - show summary
  elements.progressFill.style.width = '100%';
  elements.progressText.textContent = `Done! ${successCount} succeeded, ${failCount} failed`;
  log(`Migration complete: ${successCount} succeeded, ${failCount} failed`, successCount > 0 ? 'success' : 'error');

  // What still has to be set by hand in Lofty
  if (handNotes.length > 0) {
    log(`=== TO FINISH IN LOFTY (${handNotes.length}) ===`, 'info');
    handNotes.forEach(n => log(n, 'info'));
    const prev = (await chrome.storage.local.get(['finishList'])).finishList;
    const all = (prev ? prev + '\n\n' : 'TO FINISH IN LOFTY\n\n') + handNotes.join('\n\n');
    await chrome.storage.local.set({ finishList: all });
    elements.debugOutput.textContent = all;
    elements.debugOutput.style.display = 'block';
    document.getElementById('copy-finish').style.display = 'inline-block';
  }

  // If there were failures, show summary
  if (failedPlans.length > 0) {
    log(`\n=== FAILED PLANS SUMMARY ===`, 'error');
    failedPlans.forEach((fp, idx) => {
      log(`${idx + 1}. ${fp.planName}: ${fp.errorMessage}`, 'error');
    });
    log(`===========================\n`, 'error');

    // Also show in debug output for easy copying
    elements.debugOutput.textContent = (handNotes.length ? elements.debugOutput.textContent + '\n\n' : '') + '=== DID NOT UPLOAD ===\n' + failedPlans.map(f => `${f.name || f.planName || ''}: ${f.error || JSON.stringify(f)}`).join('\n');
    elements.debugOutput.style.display = 'block';
  }

  elements.startMigration.disabled = false;
}

// ============================================
// TAG SYNC FUNCTIONS
// ============================================

// Tags the selected plan data needs: every tag its steps add/remove, plus trigger tags
function fubTagsNeeded() {
  const set = new Set();
  const pool = selectedPlanIds.size ? actionPlans.filter(p => selectedPlanIds.has(p.id)) : actionPlans;
  for (const p of pool) for (const st of p.steps || []) for (const t of st.tags || []) set.add(t);
  for (const p of pool) if (p.trigger?.kind === 'tag') p.trigger.tags.forEach(n => set.add(n));
  for (const p of pool) if (p.trigger?.kind === 'stageTag') set.add(p.trigger.tag);
  return [...set];
}

let loftyTags = [];  // Tags from Lofty
let missingTags = [];  // Tags in FUB but not in Lofty

/**
 * Analyze tags - compare FUB tags with Lofty tags
 */
async function analyzeTags() {
  setStatus(elements.tagSyncStatus, 'Analyzing tags...', 'info');
  log('Analyzing FUB tags vs Lofty tags...', 'info');
  elements.analyzeTags.disabled = true;

  try {
    // Check Lofty connection first
    const connResult = await loftyClient.testConnection();
    if (!connResult.success) {
      throw new Error('Please check Lofty connection first');
    }

    // Get Lofty tags
    log('Fetching Lofty tags...', 'info');
    const response = await chrome.runtime.sendMessage({ type: 'GET_LOFTY_TAGS' });

    if (!response.success) {
      throw new Error(response.error || 'Failed to fetch Lofty tags');
    }

    loftyTags = response.data || [];
    log(`Found ${loftyTags.length} tags in Lofty`, 'info');

    // Set tag mapping on Converter for trigger lookups
    // Convert from {id, tagName} to {id, name} format expected by Converter
    const converterTags = loftyTags.map(t => ({ id: t.id, name: t.tagName }));
    Converter.setTagMapping(converterTags);

    // Build mapping of Lofty tag names (lowercase) to tag objects
    const loftyTagsLower = {};
    loftyTags.forEach(tag => {
      loftyTagsLower[tag.tagName.toLowerCase()] = tag;
    });

    // Compare with FUB tags
    const existingTags = [];
    missingTags = [];

    fubTagsNeeded().forEach(tagName => {
      const loftyTag = loftyTagsLower[tagName.toLowerCase()];
      if (loftyTag) {
        existingTags.push({ name: tagName, loftyId: loftyTag.id });
        tagMapping[tagName] = loftyTag.id;
      } else {
        missingTags.push(tagName);
      }
    });

    // Show results
    elements.tagResults.style.display = 'block';
    elements.tagSummary.innerHTML = `
      <div style="margin-bottom:4px;">
        <span class="tag-existing">✓ ${existingTags.length} tags already exist</span>
      </div>
      <div>
        <span class="tag-missing">⚠ ${missingTags.length} tags need to be created</span>
      </div>
    `;

    // Build tag list
    let tagListHtml = '<div style="margin-top:8px;">';
    existingTags.forEach(t => {
      tagListHtml += `<div class="tag-existing">✓ ${t.name} (ID: ${t.loftyId})</div>`;
    });
    missingTags.forEach(t => {
      tagListHtml += `<div class="tag-missing">⚠ ${t}</div>`;
    });
    tagListHtml += '</div>';
    elements.tagList.innerHTML = tagListHtml;

    // Enable sync button if there are missing tags
    if (missingTags.length > 0) {
      elements.syncTags.disabled = false;
      setStatus(elements.tagSyncStatus, `${missingTags.length} tags need to be created`, 'info');
    } else {
      setStatus(elements.tagSyncStatus, 'All tags already exist in Lofty!', 'success');
    }

    log(`Analysis complete: ${existingTags.length} exist, ${missingTags.length} missing`, 'success');

  } catch (error) {
    setStatus(elements.tagSyncStatus, `Error: ${error.message}`, 'error');
    log(`Tag analysis failed: ${error.message}`, 'error');
  }

  elements.analyzeTags.disabled = false;
}

/**
 * Sync missing tags - create them in Lofty
 */
async function syncMissingTags() {
  if (missingTags.length === 0) {
    setStatus(elements.tagSyncStatus, 'No tags to sync', 'info');
    return;
  }

  setStatus(elements.tagSyncStatus, 'Creating tags in Lofty...', 'info');
  log(`Creating ${missingTags.length} tags in Lofty...`, 'info');

  elements.syncTags.disabled = true;
  elements.analyzeTags.disabled = true;
  elements.tagSyncProgress.style.display = 'block';

  let created = 0;
  let failed = 0;
  const failedTags = [];

  for (let i = 0; i < missingTags.length; i++) {
    const tagName = missingTags[i];

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CREATE_LOFTY_TAG',
        tagName: tagName
      });

      if (response.success && response.data) {
        tagMapping[tagName] = response.data.id;
        created++;
        log(`Created tag: ${tagName} (ID: ${response.data.id})`, 'success');
      } else {
        throw new Error(response.error || 'Unknown error');
      }
    } catch (error) {
      failed++;
      failedTags.push(tagName);
      log(`Failed to create tag: ${tagName} - ${error.message}`, 'error');
    }

    // Update progress
    const pct = Math.round(((i + 1) / missingTags.length) * 100);
    elements.tagProgressFill.style.width = `${pct}%`;
    elements.tagProgressText.textContent = `Creating ${i + 1} of ${missingTags.length}...`;

    // Rate limit protection
    await new Promise(r => setTimeout(r, 500));
  }

  // Update results
  elements.tagProgressText.textContent = `Done! ${created} created, ${failed} failed`;

  // Update the missing tags list
  missingTags = failedTags;

  // Update tag list display
  if (created > 0) {
    await analyzeTags();  // Re-analyze to update the display
  }

  if (failed === 0) {
    setStatus(elements.tagSyncStatus, `All ${created} tags created successfully!`, 'success');
    elements.syncTags.disabled = true;
  } else {
    setStatus(elements.tagSyncStatus, `${created} created, ${failed} failed`, failed === missingTags.length ? 'error' : 'info');
    elements.syncTags.disabled = false;
  }

  elements.analyzeTags.disabled = false;
  log(`Tag sync complete: ${created} created, ${failed} failed`, created > 0 ? 'success' : 'error');
}

/**
 * Background Service Worker
 * Handles communication between popup and content script
 */

// Store captured signatures from browser-level interception
const capturedSignatures = [];

/**
 * Browser-level network interception using webRequest API
 * This captures ALL requests to Lofty's API, guaranteed to work
 */
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    // Only capture API requests
    if (!details.url.includes('/api/')) return;

    const headers = {};
    for (const header of details.requestHeaders || []) {
      headers[header.name.toLowerCase()] = header.value;
    }

    const signature = headers['signature'];
    const timestamp = headers['timestamp'];

    if (signature && timestamp) {
      const capture = {
        url: details.url,
        method: details.method,
        signature: signature,
        timestamp: timestamp,
        time: Date.now(),
        platform: headers['platform'],
        clientinfo: headers['clientinfo']
      };

      capturedSignatures.push(capture);

      // Keep only last 50 captures
      if (capturedSignatures.length > 50) {
        capturedSignatures.shift();
      }

      console.log('[FUB-Lofty] CAPTURED from browser:', {
        url: details.url.substring(0, 80),
        sig: signature,
        ts: timestamp
      });
    }
  },
  { urls: ['https://crm.lofty.com/*', 'https://*.lofty.com/*'] },
  ['requestHeaders']
);

console.log('[FUB-Lofty] Background worker started, webRequest listener active');

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CREATE_SMART_PLAN') {
    handleCreateSmartPlan(message.payload)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  if (message.type === 'CHECK_LOFTY_TAB') {
    checkLoftyTab()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'GET_LOFTY_USER_INFO') {
    getLoftyUserInfo()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'GET_DEBUG_INFO') {
    getDebugInfo()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'GET_AUTH_COOKIES' || message.type === 'GET_FULL_COOKIES') {
    getAuthCookies()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Return captured signatures from browser-level interception
  if (message.type === 'GET_CAPTURED_SIGNATURES') {
    sendResponse({
      success: true,
      signatures: capturedSignatures,
      count: capturedSignatures.length
    });
    return false;
  }

  // Clear captured signatures
  if (message.type === 'CLEAR_CAPTURED_SIGNATURES') {
    capturedSignatures.length = 0;
    sendResponse({ success: true });
    return false;
  }

  // Handle GET_LOFTY_TAGS request
  if (message.type === 'GET_LOFTY_TAGS') {
    handleGetLoftyTags()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Handle GET_LOFTY_ACCOUNT request
  if (message.type === 'GET_LOFTY_ACCOUNT') {
    handleRelayToLoftyTab({ type: 'GET_LOFTY_ACCOUNT' })
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Generic signed request to Lofty: { endpoint, method, payload }
  if (message.type === 'LOFTY_REQUEST') {
    handleRelayToLoftyTab({ type: 'MAKE_LOFTY_REQUEST', endpoint: message.endpoint, method: message.method || 'POST', payload: message.payload, authCookies: {} })
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Handle GET_LOFTY_PIPELINES request
  if (message.type === 'GET_LOFTY_PIPELINES') {
    handleRelayToLoftyTab({ type: 'GET_LOFTY_PIPELINES' })
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Handle CREATE_LOFTY_TAG request
  if (message.type === 'CREATE_LOFTY_TAG') {
    handleCreateLoftyTag(message.tagName)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

/**
 * Get comprehensive debug info
 */
async function getDebugInfo() {
  const info = {
    timestamp: new Date().toISOString(),
    loftyTab: null,
    cookies: {},
    cookiesByDomain: {}
  };

  // Find Lofty tab
  const tabs = await chrome.tabs.query({ url: 'https://crm.lofty.com/*' });
  info.loftyTab = tabs.length > 0 ? { id: tabs[0].id, url: tabs[0].url } : null;

  // Get ALL cookies for various domains
  const domains = ['.lofty.com', 'lofty.com', 'crm.lofty.com', '.crm.lofty.com'];

  for (const domain of domains) {
    try {
      const cookies = await chrome.cookies.getAll({ domain });
      if (cookies.length > 0) {
        info.cookiesByDomain[domain] = cookies.map(c => ({
          name: c.name,
          domain: c.domain,
          httpOnly: c.httpOnly,
          secure: c.secure,
          valuePreview: c.value.substring(0, 20) + (c.value.length > 20 ? '...' : '')
        }));
      }
    } catch (e) {
      info.cookiesByDomain[domain] = `Error: ${e.message}`;
    }
  }

  // Also try by URL
  try {
    const urlCookies = await chrome.cookies.getAll({ url: 'https://crm.lofty.com/' });
    info.cookiesByUrl = urlCookies.map(c => ({
      name: c.name,
      domain: c.domain,
      httpOnly: c.httpOnly,
      valuePreview: c.value.substring(0, 20) + (c.value.length > 20 ? '...' : '')
    }));
  } catch (e) {
    info.cookiesByUrl = `Error: ${e.message}`;
  }

  // Get key auth cookies
  const authCookies = await getAuthCookies();
  info.authCookies = {
    _T: authCookies._T ? `Found (${authCookies._T.length} chars)` : 'MISSING',
    _AT: authCookies._AT ? `Found (${authCookies._AT.length} chars)` : 'MISSING',
    _UI: authCookies._UI || 'MISSING',
    _BI: authCookies._BI || 'MISSING'
  };

  return info;
}

/**
 * Find a tab with crm.lofty.com open
 */
async function findLoftyTab() {
  const tabs = await chrome.tabs.query({ url: 'https://crm.lofty.com/*' });
  return tabs.length > 0 ? tabs[0] : null;
}

/**
 * Check if Lofty tab exists and user is logged in
 */
async function checkLoftyTab() {
  const tab = await findLoftyTab();
  if (!tab) {
    return { success: false, error: 'Please open crm.lofty.com in a tab' };
  }

  // Get cookies - try multiple domains since Lofty sets cookies on different domains
  const cookieDomains = ['.lofty.com', 'lofty.com', 'crm.lofty.com', '.crm.lofty.com'];
  let allCookies = [];

  for (const domain of cookieDomains) {
    try {
      const cookies = await chrome.cookies.getAll({ domain });
      allCookies = allCookies.concat(cookies);
    } catch (e) {
      // Ignore errors for domains that don't exist
    }
  }

  // Also try getting cookies by URL
  try {
    const urlCookies = await chrome.cookies.getAll({ url: 'https://crm.lofty.com/' });
    allCookies = allCookies.concat(urlCookies);
  } catch (e) {}

  // Dedupe by name (keep first occurrence)
  const cookieMap = {};
  allCookies.forEach(c => {
    if (!cookieMap[c.name]) {
      cookieMap[c.name] = c.value;
    }
  });

  console.log('[FUB-Lofty] Found cookies:', Object.keys(cookieMap));

  const authToken = cookieMap['_AT'];
  const userId = cookieMap['_UI'];
  const token = cookieMap['_T'];

  // We need at least _T (used for signature) and _UI (user id)
  if (!token) {
    return {
      success: false,
      error: `Missing auth cookies. Found: ${Object.keys(cookieMap).join(', ') || 'none'}`
    };
  }

  return {
    success: true,
    tabId: tab.id,
    userId: userId || null,  // Return null instead of 'unknown' to prevent string injection
    hasAuthToken: !!authToken,
    hasToken: !!token
  };
}

/**
 * Get user info from Lofty page
 */
async function getLoftyUserInfo() {
  const tab = await findLoftyTab();
  if (!tab) {
    throw new Error('No Lofty tab found');
  }

  // Get relevant cookies
  const cookies = await chrome.cookies.getAll({ domain: 'crm.lofty.com' });
  const cookieMap = {};
  cookies.forEach(c => cookieMap[c.name] = c.value);

  return {
    success: true,
    userId: cookieMap['_UI'],
    teamId: cookieMap['_BI'] ? null : null, // teamId isn't in cookies, need to get from page
    cookies: cookieMap
  };
}

/**
 * Ensure content script is loaded in tab
 */
async function ensureContentScript(tabId) {
  try {
    // Try to ping the content script
    const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    if (response?.success) {
      console.log('[FUB-Lofty] Content script already loaded');
      return true;
    }
  } catch (e) {
    console.log('[FUB-Lofty] Content script not responding, injecting...');
  }

  // Inject the content script manually
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    console.log('[FUB-Lofty] Content script injected');

    // Wait a moment for it to initialize
    await new Promise(r => setTimeout(r, 500));
    return true;
  } catch (e) {
    console.error('[FUB-Lofty] Failed to inject content script:', e);
    throw new Error('Failed to inject content script: ' + e.message);
  }
}

/**
 * Get auth cookies that might be HttpOnly
 */
async function getAuthCookies() {
  const cookieDomains = ['.lofty.com', 'lofty.com', 'crm.lofty.com'];
  let allCookies = [];

  for (const domain of cookieDomains) {
    try {
      const cookies = await chrome.cookies.getAll({ domain });
      allCookies = allCookies.concat(cookies);
    } catch (e) {}
  }

  try {
    const urlCookies = await chrome.cookies.getAll({ url: 'https://crm.lofty.com/' });
    allCookies = allCookies.concat(urlCookies);
  } catch (e) {}

  const cookieMap = {};
  allCookies.forEach(c => {
    if (!cookieMap[c.name]) {
      cookieMap[c.name] = c.value;
    }
  });

  return {
    _T: cookieMap['_T'] || '',
    _MT: cookieMap['_MT'] || '',
    _AT: cookieMap['_AT'] || '',
    _UI: cookieMap['_UI'] || '',
    _BI: cookieMap['_BI'] || '',
    _ULT: cookieMap['_ULT'] || ''
  };
}

/**
 * Create Smart Plan by sending message to content script
 */
async function handleCreateSmartPlan(payload) {
  const tab = await findLoftyTab();
  if (!tab) {
    throw new Error('Please open crm.lofty.com in a browser tab');
  }

  // Get auth cookies (including HttpOnly ones)
  const authCookies = await getAuthCookies();
  console.log('[FUB-Lofty] Auth cookies found:', JSON.stringify(authCookies));
  console.log('[FUB-Lofty] _T value:', authCookies._T ? `${authCookies._T.substring(0, 10)}... (${authCookies._T.length} chars)` : 'MISSING');

  if (!authCookies._T) {
    throw new Error('Not logged into Lofty - please log in and try again');
  }

  // Ensure content script is loaded
  await ensureContentScript(tab.id);

  // Send message to content script with auth cookies
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, {
      type: 'MAKE_LOFTY_REQUEST',
      endpoint: '/api/smart-plan-server/settings/save',
      method: 'POST',
      payload: payload,
      authCookies: authCookies  // Pass cookies to content script
    }, response => {
      if (chrome.runtime.lastError) {
        console.error('[FUB-Lofty] Error sending message:', chrome.runtime.lastError);
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response?.success) {
        resolve(response.data);
      } else {
        reject(new Error(response?.error || 'Unknown error'));
      }
    });
  });
}

/**
 * Get all Lofty tags
 */
async function handleGetLoftyTags() {
  const tab = await findLoftyTab();
  if (!tab) {
    throw new Error('Please open crm.lofty.com in a browser tab');
  }

  // Check auth
  const authCookies = await getAuthCookies();
  if (!authCookies._T) {
    throw new Error('Not logged into Lofty - please log in and try again');
  }

  // Ensure content script is loaded
  await ensureContentScript(tab.id);

  // Send message to content script
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, {
      type: 'GET_LOFTY_TAGS'
    }, response => {
      if (chrome.runtime.lastError) {
        console.error('[FUB-Lofty] Error getting tags:', chrome.runtime.lastError);
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response?.success) {
        resolve({ success: true, data: response.data });
      } else {
        reject(new Error(response?.error || 'Failed to get tags'));
      }
    });
  });
}

/**
 * Create a Lofty tag
 */
async function handleCreateLoftyTag(tagName) {
  const tab = await findLoftyTab();
  if (!tab) {
    throw new Error('Please open crm.lofty.com in a browser tab');
  }

  // Check auth
  const authCookies = await getAuthCookies();
  if (!authCookies._T) {
    throw new Error('Not logged into Lofty - please log in and try again');
  }

  // Ensure content script is loaded
  await ensureContentScript(tab.id);

  // Send message to content script
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, {
      type: 'CREATE_LOFTY_TAG',
      tagName: tagName
    }, response => {
      if (chrome.runtime.lastError) {
        console.error('[FUB-Lofty] Error creating tag:', chrome.runtime.lastError);
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response?.success) {
        resolve({ success: true, data: response.data });
      } else {
        reject(new Error(response?.error || 'Failed to create tag'));
      }
    });
  });
}

/**
 * Send a simple request to the Lofty tab's content script and return its answer.
 */
async function handleRelayToLoftyTab(msg) {
  const tab = await findLoftyTab();
  if (!tab) throw new Error('Please open crm.lofty.com in a browser tab');
  const authCookies = await getAuthCookies();
  if (!authCookies._T) throw new Error('Not logged into Lofty - please log in and try again');
  await ensureContentScript(tab.id);
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, msg, response => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (response?.success) resolve({ success: true, data: response.data });
      else reject(new Error(response?.error || 'Request failed'));
    });
  });
}

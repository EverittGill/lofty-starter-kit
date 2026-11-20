/**
 * Content Script - runs in the context of crm.lofty.com pages
 * Bridges between extension and page context for API calls
 */

console.log('[FUB-Lofty] Content script starting...');

// Inject script into page context to access Lofty's globals
try {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function() {
    console.log('[FUB-Lofty] Injected script loaded');
    this.remove();
  };
  script.onerror = function(e) {
    console.error('[FUB-Lofty] Failed to load injected script:', e);
  };
  (document.head || document.documentElement).appendChild(script);
  console.log('[FUB-Lofty] Injected script element added to page');
} catch (e) {
  console.error('[FUB-Lofty] Error injecting script:', e);
}

// Listen for messages from the injected script (via window.postMessage)
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== 'LOFTY_INJECTED') return;

  // Handle all response types from injected script
  const responseTypes = [
    'API_RESPONSE',
    'ANALYSIS_RESULT',
    'SIGNATURE_TEST_RESULT',
    'CAPTURED_SIGNATURES',
    'SEARCH_RESULTS',
    'TAGS_RESPONSE',   // Tag list response
    'TAG_CREATED',     // Tag creation response
    'PIPELINES_RESPONSE', // Pipeline list response
    'ACCOUNT_RESPONSE'    // Account ids response
  ];

  if (responseTypes.includes(event.data.type)) {
    if (pendingRequests[event.data.requestId]) {
      console.log('[FUB-Lofty] Forwarding response:', event.data.type);
      pendingRequests[event.data.requestId](event.data);
      delete pendingRequests[event.data.requestId];
    }
  }
});

// Track pending requests
const pendingRequests = {};
let requestCounter = 0;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[FUB-Lofty] Content script received message:', message.type);

  if (message.type === 'MAKE_LOFTY_REQUEST') {
    const requestId = ++requestCounter;
    console.log('[FUB-Lofty] Processing request', requestId, 'to', message.endpoint);
    console.log('[FUB-Lofty] Auth cookies provided:', message.authCookies ? 'yes' : 'no');

    // Store callback
    pendingRequests[requestId] = (response) => {
      console.log('[FUB-Lofty] Got response for request', requestId, response.success ? 'SUCCESS' : 'FAILED');
      if (response.success) {
        sendResponse({ success: true, data: response.data });
      } else {
        // Pass all error details through for debugging
        console.error('[FUB-Lofty] Request failed:', response);
        sendResponse({
          success: false,
          error: response.error,
          errorCode: response.errorCode,
          triggerError: response.triggerError,
          signatureError: response.signatureError,
          fullResponse: response.fullResponse,
          errorStack: response.errorStack
        });
      }
    };

    // Send to injected script via postMessage, including auth cookies
    window.postMessage({
      source: 'LOFTY_EXTENSION',
      type: 'MAKE_REQUEST',
      requestId: requestId,
      endpoint: message.endpoint,
      method: message.method,
      payload: message.payload,
      authCookies: message.authCookies  // Pass cookies from background script
    }, '*');

    console.log('[FUB-Lofty] Posted message to injected script');
    return true; // Keep channel open
  }

  if (message.type === 'GET_PAGE_INFO') {
    // Try to extract user info from page
    const info = extractPageInfo();
    sendResponse(info);
    return false;
  }

  if (message.type === 'PING') {
    console.log('[FUB-Lofty] Received ping');
    sendResponse({ success: true, message: 'Content script is alive' });
    return false;
  }

  // Handle relay to injected script (for analysis commands)
  if (message.type === 'RELAY_TO_INJECTED') {
    const requestId = ++requestCounter;
    console.log('[FUB-Lofty] Relaying to injected:', message.relayType, requestId);

    // Store callback
    pendingRequests[requestId] = (response) => {
      console.log('[FUB-Lofty] Got relay response', requestId, response.success ? 'SUCCESS' : 'FAILED');
      sendResponse(response);
    };

    // Send to injected script
    window.postMessage({
      source: 'LOFTY_EXTENSION',
      type: message.relayType,
      requestId: requestId,
      token: message.token,
      timestamp: message.timestamp,
      expectedSig: message.expectedSig
    }, '*');

    return true; // Keep channel open
  }

  // Handle GET_LOFTY_TAGS request
  if (message.type === 'GET_LOFTY_TAGS') {
    const requestId = ++requestCounter;
    console.log('[FUB-Lofty] Processing GET_LOFTY_TAGS request', requestId);

    // Store callback
    pendingRequests[requestId] = (response) => {
      console.log('[FUB-Lofty] Got tags response', requestId, response.success ? 'SUCCESS' : 'FAILED');
      if (response.success) {
        sendResponse({ success: true, data: response.data });
      } else {
        sendResponse({ success: false, error: response.error });
      }
    };

    // Send to injected script
    window.postMessage({
      source: 'LOFTY_EXTENSION',
      type: 'GET_TAGS',
      requestId: requestId
    }, '*');

    return true; // Keep channel open
  }

  // Handle GET_LOFTY_ACCOUNT request
  if (message.type === 'GET_LOFTY_ACCOUNT') {
    const requestId = ++requestCounter;
    pendingRequests[requestId] = (response) => {
      sendResponse(response.success ? { success: true, data: response.data } : { success: false, error: response.error });
    };
    window.postMessage({ source: 'LOFTY_EXTENSION', type: 'GET_ACCOUNT', requestId: requestId }, '*');
    return true;
  }

  // Handle GET_LOFTY_PIPELINES request
  if (message.type === 'GET_LOFTY_PIPELINES') {
    const requestId = ++requestCounter;
    pendingRequests[requestId] = (response) => {
      sendResponse(response.success ? { success: true, data: response.data } : { success: false, error: response.error });
    };
    window.postMessage({ source: 'LOFTY_EXTENSION', type: 'GET_PIPELINES', requestId: requestId }, '*');
    return true;
  }

  // Handle CREATE_LOFTY_TAG request
  if (message.type === 'CREATE_LOFTY_TAG') {
    const requestId = ++requestCounter;
    console.log('[FUB-Lofty] Processing CREATE_LOFTY_TAG request', requestId, 'for:', message.tagName);

    // Store callback
    pendingRequests[requestId] = (response) => {
      console.log('[FUB-Lofty] Got tag creation response', requestId, response.success ? 'SUCCESS' : 'FAILED');
      if (response.success) {
        sendResponse({ success: true, data: response.data });
      } else {
        sendResponse({ success: false, error: response.error });
      }
    };

    // Send to injected script
    window.postMessage({
      source: 'LOFTY_EXTENSION',
      type: 'CREATE_TAG',
      requestId: requestId,
      tagName: message.tagName
    }, '*');

    return true; // Keep channel open
  }
});

console.log('[FUB-Lofty] Content script message listener registered');

/**
 * Try to extract user/team info from the page
 */
function extractPageInfo() {
  try {
    // Look for common patterns in Lofty's page
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const text = script.textContent || '';
      const teamMatch = text.match(/"teamId"\s*:\s*(\d+)/);
      const userMatch = text.match(/"userId"\s*:\s*(\d+)|"creatorId"\s*:\s*(\d+)/);
      if (teamMatch) {
        return {
          success: true,
          teamId: teamMatch[1],
          userId: userMatch ? (userMatch[1] || userMatch[2]) : null
        };
      }
    }
  } catch (e) {
    console.error('Error extracting page info:', e);
  }
  return { success: false, error: 'Could not find user info' };
}

console.log('[FUB-Lofty] Content script loaded');

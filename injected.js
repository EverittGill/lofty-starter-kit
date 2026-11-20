/**
 * Injected Script - runs in Lofty's page context
 * Has access to window globals and can use Lofty's own auth mechanisms
 */

(function() {
  'use strict';

  // PREVENT DOUBLE LOADING - check if already initialized
  if (window.__FUB_LOFTY_INJECTED_LOADED) {
    console.log('[FUB-Lofty] Injected script already loaded, skipping duplicate initialization');
    return;
  }
  window.__FUB_LOFTY_INJECTED_LOADED = true;
  console.log('[FUB-Lofty] Injected script initializing (first load)...');

  // Store captured signatures for analysis
  let capturedSignatures = [];
  let loftySignFunction = null;

  /**
   * Hook into jQuery ajaxPrefilter to capture how Lofty signs requests
   * This runs BEFORE requests are sent and lets us see the signing process
   */
  function hookJQuerySigning() {
    if (!window.$ || !window.$.ajaxPrefilter) {
      console.log('[FUB-Lofty] jQuery not available yet, will retry...');
      return false;
    }

    // Check if Lofty has already set up an ajaxPrefilter
    // We can inspect it by looking at jQuery's internal state
    console.log('[FUB-Lofty] jQuery found, setting up signature capture...');

    // Hook into ajaxSend to capture headers after all prefilters run
    window.$(document).ajaxSend(function(event, jqXHR, settings) {
      // Capture the signature being set
      const origBeforeSend = settings.beforeSend;

      // Log all headers being set
      console.log('[FUB-Lofty] === AJAX REQUEST INTERCEPTED ===');
      console.log('[FUB-Lofty] URL:', settings.url);

      // Try to get headers from jqXHR
      setTimeout(() => {
        // Check if Lofty added signature headers
        const sig = jqXHR.getResponseHeader ? null : 'N/A';
        console.log('[FUB-Lofty] Request headers inspection complete');
      }, 0);
    });

    // More aggressive: wrap $.ajax itself
    const originalAjax = window.$.ajax;
    window.$.ajax = function(url, options) {
      // Normalize arguments
      if (typeof url === 'object') {
        options = url;
        url = undefined;
      }
      options = options || {};

      const originalBeforeSend = options.beforeSend;
      options.beforeSend = function(jqXHR, settings) {
        console.log('[FUB-Lofty] === $.ajax beforeSend ===');

        // Capture headers being set by wrapping setRequestHeader
        const origSetHeader = jqXHR.setRequestHeader.bind(jqXHR);
        jqXHR.setRequestHeader = function(name, value) {
          if (name.toLowerCase() === 'signature' || name.toLowerCase() === 'timestamp') {
            console.log('[FUB-Lofty] Header being set:', name, '=', value);
            capturedSignatures.push({
              url: settings.url,
              name: name,
              value: value,
              timestamp: Date.now()
            });
          }
          return origSetHeader(name, value);
        };

        // Call original beforeSend if exists
        if (originalBeforeSend) {
          return originalBeforeSend.call(this, jqXHR, settings);
        }
      };

      return originalAjax.call(this, url ? url : options, url ? options : undefined);
    };

    console.log('[FUB-Lofty] jQuery $.ajax hooked successfully');
    return true;
  }

  /**
   * Search for Lofty's signature function in global scope
   */
  function findLoftySignatureFunction() {
    console.log('[FUB-Lofty] Searching for signature function in window...');

    // Common patterns Lofty might use
    const searchPatterns = [
      'sign', 'signature', 'getSign', 'generateSign', 'makeSign',
      'auth', 'getAuth', 'token', 'getToken', 'hash', 'md5'
    ];

    // Search in window
    for (const key of Object.keys(window)) {
      try {
        const val = window[key];
        if (typeof val === 'function') {
          const funcStr = val.toString().toLowerCase();
          if (funcStr.includes('md5') && funcStr.includes('timestamp')) {
            console.log('[FUB-Lofty] Found potential signing function:', key);
            console.log('[FUB-Lofty] Function source:', val.toString().substring(0, 500));
          }
        }
        if (typeof val === 'object' && val !== null) {
          for (const pattern of searchPatterns) {
            if (key.toLowerCase().includes(pattern) ||
                (val[pattern] && typeof val[pattern] === 'function')) {
              console.log('[FUB-Lofty] Found potential auth object:', key, Object.keys(val).slice(0, 10));
            }
          }
        }
      } catch (e) {
        // Skip inaccessible properties
      }
    }

    // Check common utility locations
    const utilLocations = [
      'Utils', 'utils', 'API', 'api', 'Http', 'http', 'Ajax', 'ajax',
      'Service', 'service', 'Auth', 'auth', 'Request', 'request',
      '_', 'lodash', 'axios', 'Vue', 'vue', 'app', 'App'
    ];

    for (const loc of utilLocations) {
      if (window[loc]) {
        console.log('[FUB-Lofty] Found global:', loc, typeof window[loc]);
        if (typeof window[loc] === 'object') {
          const keys = Object.keys(window[loc]).filter(k =>
            k.toLowerCase().includes('sign') ||
            k.toLowerCase().includes('auth') ||
            k.toLowerCase().includes('md5')
          );
          if (keys.length > 0) {
            console.log('[FUB-Lofty]   Interesting keys in', loc + ':', keys);
          }
        }
      }
    }

    return null;
  }

  // Intercept fetch to capture Lofty's signature generation
  let capturedSignature = null;
  let capturedTimestamp = null;

  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const [url, options] = args;

    // If this is a Lofty API request, capture the headers
    if (options?.headers) {
      const headers = options.headers;
      if (headers['Signature'] || headers['signature'] || headers.get?.('Signature')) {
        const sig = headers['Signature'] || headers['signature'] || headers.get?.('Signature');
        const ts = headers['Timestamp'] || headers['timestamp'] || headers.get?.('Timestamp');
        console.log('[FUB-Lofty] Captured Lofty FETCH signature:', sig, 'timestamp:', ts);
        capturedSignature = sig;
        capturedTimestamp = ts;
        capturedSignatures.push({ type: 'fetch', url, sig, ts, time: Date.now() });
      }
    }

    return originalFetch.apply(this, args);
  };

  // Also intercept XMLHttpRequest
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  const xhrHeaders = new WeakMap();
  const xhrUrls = new WeakMap();

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    xhrHeaders.set(this, {});
    xhrUrls.set(this, url);
    return originalXHROpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    const headers = xhrHeaders.get(this) || {};
    headers[name.toLowerCase()] = value;
    xhrHeaders.set(this, headers);

    // Capture both Signature and Timestamp headers
    if (name.toLowerCase() === 'signature' || name.toLowerCase() === 'timestamp') {
      console.log('[FUB-Lofty] XHR Header:', name, '=', value);
    }

    if (name.toLowerCase() === 'signature') {
      const ts = headers['timestamp'];
      const url = xhrUrls.get(this);
      console.log('[FUB-Lofty] *** XHR SIGNATURE CAPTURED ***');
      console.log('[FUB-Lofty]   URL:', url);
      console.log('[FUB-Lofty]   Signature:', value);
      console.log('[FUB-Lofty]   Timestamp:', ts);
      capturedSignature = value;
      capturedTimestamp = ts;
      capturedSignatures.push({ type: 'xhr', url, sig: value, ts, time: Date.now() });
    }

    return originalXHRSetHeader.apply(this, arguments);
  };

  // Also hook send to capture timing
  const originalXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(body) {
    const headers = xhrHeaders.get(this) || {};
    const url = xhrUrls.get(this);

    // If this request has signature headers we haven't captured yet, do it now
    if (headers['signature'] && headers['timestamp']) {
      const existing = capturedSignatures.find(c => c.sig === headers['signature'] && c.ts === headers['timestamp']);
      if (!existing) {
        console.log('[FUB-Lofty] *** XHR SEND - Capturing signature ***');
        console.log('[FUB-Lofty]   URL:', url);
        console.log('[FUB-Lofty]   Signature:', headers['signature']);
        console.log('[FUB-Lofty]   Timestamp:', headers['timestamp']);
        capturedSignatures.push({
          type: 'xhr-send',
          url: url,
          sig: headers['signature'],
          ts: headers['timestamp'],
          time: Date.now()
        });
      }
    }

    return originalXHRSend.apply(this, arguments);
  };

  // Initialize hooks when jQuery is ready
  function initHooks() {
    if (hookJQuerySigning()) {
      console.log('[FUB-Lofty] All hooks initialized');
    } else {
      // Retry after a delay
      setTimeout(initHooks, 500);
    }
  }

  // Start initialization
  if (document.readyState === 'complete') {
    initHooks();
    findLoftySignatureFunction();
  } else {
    window.addEventListener('load', () => {
      initHooks();
      findLoftySignatureFunction();
    });
  }

  // Also try immediately in case jQuery is already loaded
  setTimeout(() => {
    initHooks();
    findLoftySignatureFunction();
  }, 100);

  /**
   * Generate MD5 hash (Lofty uses this for signature)
   * Using a minimal MD5 implementation
   */
  function md5(string) {
    function rotateLeft(val, shift) {
      return (val << shift) | (val >>> (32 - shift));
    }

    function addUnsigned(x, y) {
      const x4 = x & 0x80000000;
      const y4 = y & 0x80000000;
      const x8 = x & 0x40000000;
      const y8 = y & 0x40000000;
      const result = (x & 0x3FFFFFFF) + (y & 0x3FFFFFFF);
      if (x8 & y8) return result ^ 0x80000000 ^ x4 ^ y4;
      if (x8 | y8) {
        if (result & 0x40000000) return result ^ 0xC0000000 ^ x4 ^ y4;
        else return result ^ 0x40000000 ^ x4 ^ y4;
      } else return result ^ x4 ^ y4;
    }

    function F(x, y, z) { return (x & y) | (~x & z); }
    function G(x, y, z) { return (x & z) | (y & ~z); }
    function H(x, y, z) { return x ^ y ^ z; }
    function I(x, y, z) { return y ^ (x | ~z); }

    function FF(a, b, c, d, x, s, ac) {
      a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    }
    function GG(a, b, c, d, x, s, ac) {
      a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    }
    function HH(a, b, c, d, x, s, ac) {
      a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    }
    function II(a, b, c, d, x, s, ac) {
      a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    }

    function convertToWordArray(str) {
      const len = str.length;
      const wordCount = ((len + 8) >>> 6) + 1;
      const words = new Array(wordCount * 16);
      for (let i = 0; i < wordCount * 16; i++) words[i] = 0;
      for (let i = 0; i < len; i++) {
        words[i >>> 2] |= str.charCodeAt(i) << ((i % 4) * 8);
      }
      words[len >>> 2] |= 0x80 << ((len % 4) * 8);
      words[wordCount * 16 - 2] = len * 8;
      return words;
    }

    function wordToHex(val) {
      let hex = '';
      for (let i = 0; i <= 3; i++) {
        const byte = (val >>> (i * 8)) & 255;
        hex += ('0' + byte.toString(16)).slice(-2);
      }
      return hex;
    }

    const x = convertToWordArray(string);
    let a = 0x67452301, b = 0xEFCDAB89, c = 0x98BADCFE, d = 0x10325476;

    const S11 = 7, S12 = 12, S13 = 17, S14 = 22;
    const S21 = 5, S22 = 9, S23 = 14, S24 = 20;
    const S31 = 4, S32 = 11, S33 = 16, S34 = 23;
    const S41 = 6, S42 = 10, S43 = 15, S44 = 21;

    for (let k = 0; k < x.length; k += 16) {
      const AA = a, BB = b, CC = c, DD = d;
      a = FF(a, b, c, d, x[k], S11, 0xD76AA478);
      d = FF(d, a, b, c, x[k + 1], S12, 0xE8C7B756);
      c = FF(c, d, a, b, x[k + 2], S13, 0x242070DB);
      b = FF(b, c, d, a, x[k + 3], S14, 0xC1BDCEEE);
      a = FF(a, b, c, d, x[k + 4], S11, 0xF57C0FAF);
      d = FF(d, a, b, c, x[k + 5], S12, 0x4787C62A);
      c = FF(c, d, a, b, x[k + 6], S13, 0xA8304613);
      b = FF(b, c, d, a, x[k + 7], S14, 0xFD469501);
      a = FF(a, b, c, d, x[k + 8], S11, 0x698098D8);
      d = FF(d, a, b, c, x[k + 9], S12, 0x8B44F7AF);
      c = FF(c, d, a, b, x[k + 10], S13, 0xFFFF5BB1);
      b = FF(b, c, d, a, x[k + 11], S14, 0x895CD7BE);
      a = FF(a, b, c, d, x[k + 12], S11, 0x6B901122);
      d = FF(d, a, b, c, x[k + 13], S12, 0xFD987193);
      c = FF(c, d, a, b, x[k + 14], S13, 0xA679438E);
      b = FF(b, c, d, a, x[k + 15], S14, 0x49B40821);
      a = GG(a, b, c, d, x[k + 1], S21, 0xF61E2562);
      d = GG(d, a, b, c, x[k + 6], S22, 0xC040B340);
      c = GG(c, d, a, b, x[k + 11], S23, 0x265E5A51);
      b = GG(b, c, d, a, x[k], S24, 0xE9B6C7AA);
      a = GG(a, b, c, d, x[k + 5], S21, 0xD62F105D);
      d = GG(d, a, b, c, x[k + 10], S22, 0x2441453);
      c = GG(c, d, a, b, x[k + 15], S23, 0xD8A1E681);
      b = GG(b, c, d, a, x[k + 4], S24, 0xE7D3FBC8);
      a = GG(a, b, c, d, x[k + 9], S21, 0x21E1CDE6);
      d = GG(d, a, b, c, x[k + 14], S22, 0xC33707D6);
      c = GG(c, d, a, b, x[k + 3], S23, 0xF4D50D87);
      b = GG(b, c, d, a, x[k + 8], S24, 0x455A14ED);
      a = GG(a, b, c, d, x[k + 13], S21, 0xA9E3E905);
      d = GG(d, a, b, c, x[k + 2], S22, 0xFCEFA3F8);
      c = GG(c, d, a, b, x[k + 7], S23, 0x676F02D9);
      b = GG(b, c, d, a, x[k + 12], S24, 0x8D2A4C8A);
      a = HH(a, b, c, d, x[k + 5], S31, 0xFFFA3942);
      d = HH(d, a, b, c, x[k + 8], S32, 0x8771F681);
      c = HH(c, d, a, b, x[k + 11], S33, 0x6D9D6122);
      b = HH(b, c, d, a, x[k + 14], S34, 0xFDE5380C);
      a = HH(a, b, c, d, x[k + 1], S31, 0xA4BEEA44);
      d = HH(d, a, b, c, x[k + 4], S32, 0x4BDECFA9);
      c = HH(c, d, a, b, x[k + 7], S33, 0xF6BB4B60);
      b = HH(b, c, d, a, x[k + 10], S34, 0xBEBFBC70);
      a = HH(a, b, c, d, x[k + 13], S31, 0x289B7EC6);
      d = HH(d, a, b, c, x[k], S32, 0xEAA127FA);
      c = HH(c, d, a, b, x[k + 3], S33, 0xD4EF3085);
      b = HH(b, c, d, a, x[k + 6], S34, 0x4881D05);
      a = HH(a, b, c, d, x[k + 9], S31, 0xD9D4D039);
      d = HH(d, a, b, c, x[k + 12], S32, 0xE6DB99E5);
      c = HH(c, d, a, b, x[k + 15], S33, 0x1FA27CF8);
      b = HH(b, c, d, a, x[k + 2], S34, 0xC4AC5665);
      a = II(a, b, c, d, x[k], S41, 0xF4292244);
      d = II(d, a, b, c, x[k + 7], S42, 0x432AFF97);
      c = II(c, d, a, b, x[k + 14], S43, 0xAB9423A7);
      b = II(b, c, d, a, x[k + 5], S44, 0xFC93A039);
      a = II(a, b, c, d, x[k + 12], S41, 0x655B59C3);
      d = II(d, a, b, c, x[k + 3], S42, 0x8F0CCC92);
      c = II(c, d, a, b, x[k + 10], S43, 0xFFEFF47D);
      b = II(b, c, d, a, x[k + 1], S44, 0x85845DD1);
      a = II(a, b, c, d, x[k + 8], S41, 0x6FA87E4F);
      d = II(d, a, b, c, x[k + 15], S42, 0xFE2CE6E0);
      c = II(c, d, a, b, x[k + 6], S43, 0xA3014314);
      b = II(b, c, d, a, x[k + 13], S44, 0x4E0811A1);
      a = II(a, b, c, d, x[k + 4], S41, 0xF7537E82);
      d = II(d, a, b, c, x[k + 11], S42, 0xBD3AF235);
      c = II(c, d, a, b, x[k + 2], S43, 0x2AD7D2BB);
      b = II(b, c, d, a, x[k + 9], S44, 0xEB86D391);
      a = addUnsigned(a, AA);
      b = addUnsigned(b, BB);
      c = addUnsigned(c, CC);
      d = addUnsigned(d, DD);
    }
    return wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d);
  }

  /**
   * Get cookie value by name
   */
  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
  }

  /**
   * Get device ID from Lofty's fingerprint storage (or generate one)
   */
  function getDeviceId() {
    // Try to use Lofty's actual fingerprint first
    try {
      const fpData = JSON.parse(localStorage.getItem('fingerprint') || '{}');
      if (fpData.visitorId) {
        return fpData.visitorId;
      }
    } catch (e) {}

    // Fallback to our own
    let deviceId = localStorage.getItem('fub_lofty_device_id');
    if (!deviceId) {
      deviceId = md5(navigator.userAgent + Date.now() + Math.random());
      localStorage.setItem('fub_lofty_device_id', deviceId);
    }
    return deviceId;
  }

  /**
   * Get timezone offset in seconds (matches Lofty's format)
   */
  function getTimezoneOffset() {
    return -(new Date().getTimezoneOffset() * 60);
  }

  /**
   * Detect OS from user agent (matches Lofty's initBaseParam)
   */
  function detectOS() {
    const ua = navigator.userAgent;
    if (ua.indexOf('Win') !== -1) return 'Windows';
    if (ua.indexOf('Mac') !== -1) return 'MacOS';
    if (ua.indexOf('Linux') !== -1) return 'Linux';
    if (ua.indexOf('Android') !== -1) return 'Android';
    if (ua.indexOf('iPhone') !== -1 || ua.indexOf('iPad') !== -1) return 'iOS';
    return 'Unknown';
  }

  /**
   * Get browser model string (matches Lofty's initBaseParam)
   */
  function getBrowserModel() {
    const ua = navigator.userAgent;
    let browser = 'Unknown';
    let version = 'Unknown';
    let match;

    if (ua.indexOf('Firefox') !== -1) {
      browser = 'Firefox';
      match = ua.match(/Firefox\/([\d.]+)/);
    } else if (ua.indexOf('Chrome') !== -1) {
      browser = 'Chrome';
      match = ua.match(/Chrome\/([\d.]+)/);
    } else if (ua.indexOf('Safari') !== -1) {
      browser = 'Safari';
      match = ua.match(/Version\/([\d.]+)/);
    }

    if (match) version = match[1];
    return `${browser}/${version}`;
  }

  /**
   * Generate client info object (EXACTLY matches Lofty's format)
   */
  function getClientInfo() {
    return JSON.stringify({
      deviceId: getDeviceId(),
      os: detectOS(),
      model: getBrowserModel(),
      timezone: getTimezoneOffset(),
      version: '4.2.0'
    });
  }

  /**
   * Try multiple signature algorithms and return results for analysis
   */
  function trySignatureAlgorithms(token, timestamp, targetSig = null) {
    const results = [];
    const deviceId = getDeviceId();
    const mt = getCookie('_MT') || '';
    const at = getCookie('_AT') || '';
    const ui = getCookie('_UI') || '';

    // List of algorithms to try
    const algorithms = [
      { name: 'token+timestamp', input: token + timestamp },
      { name: 'timestamp+token', input: timestamp + token },
      { name: 'token+:+timestamp', input: token + ':' + timestamp },
      { name: 'timestamp+:+token', input: timestamp + ':' + token },
      { name: 'token+|+timestamp', input: token + '|' + timestamp },
      { name: '_MT+timestamp', input: mt + timestamp },
      { name: 'timestamp+_MT', input: timestamp + mt },
      { name: '_AT+timestamp', input: at + timestamp },
      { name: 'deviceId+timestamp', input: deviceId + timestamp },
      { name: 'timestamp+deviceId', input: timestamp + deviceId },
      { name: 'token+timestamp+10', input: token + timestamp + '10' },
      { name: '10+token+timestamp', input: '10' + token + timestamp },
      { name: 'token.slice(0,16)+timestamp', input: token.slice(0, 16) + timestamp },
      { name: 'token.slice(-16)+timestamp', input: token.slice(-16) + timestamp },
      { name: 'ui+token+timestamp', input: ui + token + timestamp },
      { name: 'token+ui+timestamp', input: token + ui + timestamp },
    ];

    for (const algo of algorithms) {
      const hash = md5(algo.input);
      const match = targetSig ? (hash === targetSig ? '✓ MATCH!' : '') : '';
      results.push({
        name: algo.name,
        input: algo.input.substring(0, 50) + (algo.input.length > 50 ? '...' : ''),
        hash: hash,
        match: match
      });
    }

    return results;
  }

  /**
   * Analyze captured signatures to find the algorithm
   */
  function analyzeSignatures() {
    console.log('[FUB-Lofty] === SIGNATURE ANALYSIS ===');
    console.log('[FUB-Lofty] Captured signatures:', capturedSignatures.length);

    const token = getCookie('_T') || '';
    console.log('[FUB-Lofty] Current _T token:', token);
    console.log('[FUB-Lofty] Current _MT:', getCookie('_MT') || 'none');
    console.log('[FUB-Lofty] Current _AT:', getCookie('_AT') || 'none');

    // If we have captured signatures, try to match them
    for (const captured of capturedSignatures.slice(-5)) {
      console.log('[FUB-Lofty] --- Analyzing captured request ---');
      console.log('[FUB-Lofty] URL:', captured.url);
      console.log('[FUB-Lofty] Timestamp:', captured.ts);
      console.log('[FUB-Lofty] Signature:', captured.sig);

      if (captured.ts && captured.sig) {
        const results = trySignatureAlgorithms(token, captured.ts, captured.sig);
        for (const r of results) {
          if (r.match) {
            console.log('[FUB-Lofty] *** FOUND MATCH ***', r.name, r.hash);
          }
        }
      }
    }

    // Also test with current timestamp
    console.log('[FUB-Lofty] --- Testing current timestamp ---');
    const currentTs = Date.now().toString();
    const results = trySignatureAlgorithms(token, currentTs);
    console.table(results);

    return {
      captured: capturedSignatures,
      token: token,
      algorithms: results
    };
  }

  /**
   * SECRET SALT discovered from Lofty's source code
   */
  const LOFTY_SECRET_SALT = "377f08ba2928ea80aee814671f0605d5";

  /**
   * Make authenticated GET request to Lofty internal API
   * Uses the same signature algorithm as POST requests (via generateSignature)
   */
  async function makeLoftyGetRequest(endpoint) {
    console.log('[FUB-Lofty] Making GET request to:', endpoint);

    const fullUrl = 'https://crm.lofty.com' + endpoint;
    const timestamp = Date.now().toString();
    const clientInfo = getClientInfo();

    // Use the working generateSignature function with GET method
    const signature = generateSignature(timestamp, {
      url: fullUrl,
      method: 'GET',
      data: {},  // GET requests have no body data
      contentType: ''
    });

    console.log('[FUB-Lofty] GET Request:');
    console.log('[FUB-Lofty]   URL:', fullUrl);
    console.log('[FUB-Lofty]   Timestamp:', timestamp);
    console.log('[FUB-Lofty]   Signature:', signature);

    // Use jQuery if available
    if (window.$ && window.$.ajax) {
      return new Promise((resolve, reject) => {
        window.$.ajax({
          url: fullUrl,
          method: 'GET',
          dataType: 'json',  // Force JSON parsing of response
          beforeSend: function(xhr) {
            xhr.setRequestHeader('Platform', '10');
            xhr.setRequestHeader('Timestamp', timestamp);
            xhr.setRequestHeader('Signature', signature);
            xhr.setRequestHeader('Clientinfo', clientInfo);
          },
          success: function(response) {
            console.log('[FUB-Lofty] GET SUCCESS:', response);
            resolve(response);
          },
          error: function(xhr, status, error) {
            console.log('[FUB-Lofty] GET Error:', xhr.status, xhr.responseText);
            reject(new Error(`API error: ${xhr.status} - ${xhr.responseText}`));
          }
        });
      });
    }

    // Fallback to fetch
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Timestamp': timestamp,
        'Signature': signature,
        'Clientinfo': clientInfo,
        'Platform': '10'
      },
      credentials: 'include'
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`API error ${response.status}: ${responseText}`);
    }

    try {
      return JSON.parse(responseText);
    } catch {
      return responseText;
    }
  }

  /**
   * Make authenticated POST request with FORM DATA (not JSON)
   * Used for tag creation which expects form-urlencoded data
   */
  async function makeLoftyFormRequest(endpoint, formData) {
    console.log('[FUB-Lofty] Making FORM POST request to:', endpoint);
    console.log('[FUB-Lofty] Form data:', formData);

    const fullUrl = 'https://crm.lofty.com' + endpoint;
    const timestamp = Date.now().toString();
    const clientInfo = getClientInfo();

    // Build form body string for the request
    const bodyString = Object.entries(formData)
      .map(([k, v]) => `${k}=${v == null ? '' : v}`)
      .join('&');

    // Use generateSignature with form-urlencoded content type
    const signature = generateSignature(timestamp, {
      url: fullUrl,
      method: 'POST',
      data: formData,  // Pass the form data object
      contentType: 'application/x-www-form-urlencoded'
    });

    console.log('[FUB-Lofty] FORM POST Request:');
    console.log('[FUB-Lofty]   URL:', fullUrl);
    console.log('[FUB-Lofty]   Body:', bodyString);
    console.log('[FUB-Lofty]   Signature:', signature);

    // Use jQuery if available
    if (window.$ && window.$.ajax) {
      return new Promise((resolve, reject) => {
        window.$.ajax({
          url: fullUrl,
          method: 'POST',
          contentType: 'application/x-www-form-urlencoded',
          dataType: 'json',  // Force JSON parsing of response
          data: bodyString,
          beforeSend: function(xhr) {
            xhr.setRequestHeader('Platform', '10');
            xhr.setRequestHeader('Timestamp', timestamp);
            xhr.setRequestHeader('Signature', signature);
            xhr.setRequestHeader('Clientinfo', clientInfo);
          },
          success: function(response) {
            console.log('[FUB-Lofty] FORM POST SUCCESS:', response);
            resolve(response);
          },
          error: function(xhr, status, error) {
            console.log('[FUB-Lofty] FORM POST Error:', xhr.status, xhr.responseText);
            reject(new Error(`API error: ${xhr.status} - ${xhr.responseText}`));
          }
        });
      });
    }

    // Fallback to fetch
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Timestamp': timestamp,
        'Signature': signature,
        'Clientinfo': clientInfo,
        'Platform': '10'
      },
      credentials: 'include',
      body: bodyString
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`API error ${response.status}: ${responseText}`);
    }

    try {
      return JSON.parse(responseText);
    } catch {
      return responseText;
    }
  }

  /**
   * Get all Lofty tags
   * Endpoint: GET /api/user/tag/settings?name=&page=0&size=50&officeIds=0&types=TEAM&isSettingPage=true
   */
  async function getLoftyTags() {
    console.log('[FUB-Lofty] Fetching all Lofty tags...');

    const allTags = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const endpoint = `/api/user/tag/settings?name=&page=${page}&size=50&officeIds=0&types=TEAM&isSettingPage=true`;
      const response = await makeLoftyGetRequest(endpoint);

      if (response.status?.code === 0 && response.data?.pageData) {
        allTags.push(...response.data.pageData);
        hasMore = response.data.hasMore;
        page++;
        console.log(`[FUB-Lofty] Fetched page ${page}, total tags: ${allTags.length}`);
      } else {
        console.error('[FUB-Lofty] Error fetching tags:', response);
        throw new Error(response.status?.msg || 'Failed to fetch tags');
      }
    }

    console.log(`[FUB-Lofty] Total tags fetched: ${allTags.length}`);
    return allTags;
  }

  /**
   * Create a new Lofty tag
   * Endpoint: POST /api/user/tag/add (form data)
   */
  async function createLoftyTag(tagName) {
    console.log('[FUB-Lofty] Creating tag:', tagName);

    const formData = {
      name: tagName,
      type: 'TEAM',
      is_locking: 'false',
      officeId: '0',
      returnExist: '',
      tagName: tagName,
      titleTag: 'Company'
    };

    let response = await makeLoftyFormRequest('/api/user/tag/add', formData);

    // Handle string response (parse if needed)
    if (typeof response === 'string') {
      try {
        response = JSON.parse(response);
      } catch (e) {
        throw new Error('Invalid response: ' + response.substring(0, 100));
      }
    }

    // Simple check: if we got back an ID, it worked
    if (response?.data?.id) {
      console.log('[FUB-Lofty] Tag created:', tagName, '(ID:', response.data.id + ')');
      return response.data;
    } else {
      console.error('[FUB-Lofty] Error creating tag:', typeof response, response);
      throw new Error('Failed to create tag');
    }
  }

  /**
   * Get the account's pipeline stages (lead pipeline), as [{id, name}].
   * Endpoint: GET /api/user/stage/list. The response shape is read loosely: this
   * walks the response and collects every object that has a numeric id and a name.
   */
  async function getLoftyPipelines() {
    // /api/user/stage/list is what Lofty's People page loads (seen November 2026);
    // /api/user/pipeline/settings is the January 2026 path and now returns 404.
    let response;
    try {
      response = await makeLoftyGetRequest('/api/user/stage/list');
    } catch (e) {
      response = await makeLoftyGetRequest('/api/user/pipeline/settings');
    }
    const data = typeof response === 'string' ? JSON.parse(response) : response;
    if (data?.status && data.status.code !== 0) throw new Error(data.status.msg || 'Failed to fetch pipelines');
    const found = new Map();
    (function walk(v) {
      if (Array.isArray(v)) return v.forEach(walk);
      if (v && typeof v === 'object') {
        const id = v.id ?? v.pipelineId;
        const name = v.name ?? v.pipelineName ?? v.stageName;
        if ((typeof id === 'number' || /^\d+$/.test(String(id ?? ''))) && typeof name === 'string') found.set(String(id), { id: Number(id), name });
        Object.values(v).forEach(walk);
      }
    })(data?.data ?? data);
    console.log('[FUB-Lofty] Pipelines found:', [...found.values()]);
    return [...found.values()];
  }

  /**
   * Truncate value to max length (Lofty truncates at 50 chars)
   */
  function getTruncatedValue(value, maxLen = 50) {
    const str = value == null ? '' : String(value);
    return str.length > maxLen ? str.substring(0, maxLen) : str;
  }

  /**
   * Filter out undefined entries from an object
   */
  function filterUndefinedEntries(obj) {
    return Object.entries(obj).filter(([k, v]) => v !== undefined);
  }

  /**
   * Get body params string for signature (matches Lofty's genSingContent)
   */
  function getBodyParams(config, asString = true) {
    const isJson = config.contentType && config.contentType.match(/application\/json/i);
    const isModifyMethod = config.type && config.type.match(/(post)|(put)|(delete)/i);

    if (!config.data) {
      return asString ? '' : [];
    }

    let result = '';
    if (isJson && isModifyMethod) {
      // For JSON POST/PUT/DELETE, stringify the data
      const dataStr = typeof config.data === 'string' ? config.data : JSON.stringify(config.data);
      console.log(`[FUB-Lofty] getBodyParams: dataStr length = ${dataStr.length}`);
      result = `body=${dataStr}`;
    } else {
      const entries = filterUndefinedEntries(
        typeof config.data === 'object' ? config.data : {}
      );

      if (isModifyMethod) {
        // For non-JSON POST/PUT/DELETE
        const paramStr = entries.map(([k, v]) => `${k}=${v == null ? '' : v}`).join('&');
        result = `body=${paramStr}`;
      } else {
        // For GET requests
        const params = entries
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([k, v]) => {
            if (Array.isArray(v)) {
              return `${k}[]=${getTruncatedValue(v)}`;
            }
            return `${k}=${getTruncatedValue(v)}`;
          });
        result = asString ? params.join('') : params;
      }
    }

    return result === 'body=' ? '' : result;
  }

  /**
   * Get URL params string for signature
   */
  function getUrlParams(config, asString = true) {
    const url = new URL(config.url, window.location.origin);
    const params = [...url.searchParams.entries()]
      .filter(([k, v]) => k !== '')
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}=${getTruncatedValue(v)}`);

    return {
      urlParams: asString ? params.join('') : params,
      url: url
    };
  }

  /**
   * Generate signature content string (matches Lofty's genSingContent)
   */
  function genSignContent(config) {
    let content = '';
    const isGet = config.type && config.type.match(/get/i);

    if (isGet) {
      // GET: combine body params and URL params, sort together
      const bodyParams = getBodyParams(config, false);
      const urlParams = getUrlParams(config, false).urlParams;
      const allParams = (Array.isArray(bodyParams) ? bodyParams : [])
        .concat(urlParams)
        .sort((a, b) => a[0] ? a[0].localeCompare(b[0]) : a.localeCompare(b));
      content = allParams.join('');
    } else {
      // POST/PUT/DELETE: URL params first, then body params
      content = getUrlParams(config).urlParams;
      content += getBodyParams(config);
    }

    return content;
  }

  /**
   * Generate signature using Lofty's ACTUAL algorithm (reverse-engineered)
   * Algorithm: md5(content + path + clientInfo + platform + timestamp + SECRET_SALT)
   */
  function generateSignature(timestamp, config = {}) {
    const clientInfo = getClientInfo();
    const url = new URL(config.url || '/api/smart-plan-server/settings/save', window.location.origin);

    // Build the signature content
    let content = genSignContent({
      url: config.url || url.href,
      data: config.data || {},
      type: config.method || 'POST',
      contentType: config.contentType || 'application/json'
    });

    // Append path, clientInfo, platform, timestamp (exactly as Lofty does)
    content += `path=${url.pathname}`;
    content += `clientInfo=${clientInfo}`;
    content += `platform=10`;
    content += `timestamp=${timestamp}`;

    // Append the secret salt
    content += LOFTY_SECRET_SALT;

    // Generate MD5 hash
    const signature = md5(content);

    console.log('[FUB-Lofty] Signature generation:');
    console.log('[FUB-Lofty]   Path:', url.pathname);
    console.log('[FUB-Lofty]   Timestamp:', timestamp);
    console.log('[FUB-Lofty]   Content preview:', content.substring(0, 200) + '...');
    console.log('[FUB-Lofty]   Signature:', signature);

    return signature;
  }

  /**
   * Make authenticated request to Lofty internal API
   * Try to use Lofty's own jQuery $.ajax which has the signature interceptor
   */
  async function makeLoftyRequest(endpoint, method, payload, authCookies) {
    console.log('[FUB-Lofty] Making request to:', endpoint);
    console.log('[FUB-Lofty] Payload type:', typeof payload);

    const fullUrl = 'https://crm.lofty.com' + endpoint;
    const timestamp = Date.now().toString();
    const clientInfo = getClientInfo();

    // Stringify once and use the SAME string for both signature and request
    const bodyString = JSON.stringify(payload);

    // DEBUG: Log signature computation details
    console.log('[FUB-Lofty] === SIGNATURE DEBUG ===');
    console.log('[FUB-Lofty] Body length:', bodyString.length);
    console.log('[FUB-Lofty] Body first 500 chars:', bodyString.substring(0, 500));
    console.log('[FUB-Lofty] Body last 200 chars:', bodyString.slice(-200));
    console.log('[FUB-Lofty] Body MD5 (just body):', md5(bodyString));

    // Generate signature - pass the STRING directly to ensure consistency
    const signature = generateSignature(timestamp, {
      url: fullUrl,
      method: method,
      data: bodyString,  // Pass STRING, not object
      contentType: 'application/json'
    });

    console.log('[FUB-Lofty] Timestamp:', timestamp);
    console.log('[FUB-Lofty] Signature:', signature);
    console.log('[FUB-Lofty] ClientInfo:', clientInfo);

    // FORCE fetch instead of jQuery to avoid Lofty's interceptors overwriting our signature
    const USE_FETCH = true;

    // Try using jQuery if available (disabled - Lofty's interceptors interfere)
    if (!USE_FETCH && window.$ && window.$.ajax) {
      console.log('[FUB-Lofty] Using jQuery $.ajax');

      return new Promise((resolve, reject) => {
        window.$.ajax({
          url: fullUrl,
          method: method,
          contentType: 'application/json',
          data: bodyString,  // Use the SAME string
          beforeSend: function(xhr) {
            xhr.setRequestHeader('Platform', '10');
            xhr.setRequestHeader('Timestamp', timestamp);
            xhr.setRequestHeader('Signature', signature);
            xhr.setRequestHeader('Clientinfo', clientInfo);
            console.log('[FUB-Lofty] Headers set with correct signature algorithm');
          },
          success: function(response) {
            console.log('[FUB-Lofty] SUCCESS:', response);
            resolve(response);
          },
          error: function(xhr, status, error) {
            console.log('[FUB-Lofty] Error:', xhr.status, xhr.responseText);
            reject(new Error(`API error: ${xhr.status} - ${xhr.responseText}`));
          }
        });
      });
    }

    // Use fetch with our own signature (bypasses any jQuery interceptors)
    // Store debug info on window so we can inspect it
    window.__FUB_DEBUG = {
      url: fullUrl,
      timestamp: timestamp,
      signature: signature,
      clientInfo: clientInfo,
      bodyLength: bodyString.length,
      bodyPreview: bodyString.substring(0, 300),
      bodyEnd: bodyString.slice(-100)
    };
    console.error('[FUB-Lofty] DEBUG INFO STORED IN window.__FUB_DEBUG - check it in console');
    console.error('[FUB-Lofty] Signature:', signature);
    console.error('[FUB-Lofty] Body length:', bodyString.length);

    const response = await fetch(fullUrl, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'Timestamp': timestamp,
        'Signature': signature,
        'Clientinfo': clientInfo,
        'Platform': '10'
      },
      credentials: 'include',
      body: bodyString  // Use the SAME string as signature
    });

    const responseText = await response.text();
    console.log('[FUB-Lofty] Response status:', response.status);
    console.log('[FUB-Lofty] ===== FULL API RESPONSE =====');
    console.log(responseText);
    console.log('[FUB-Lofty] ===== END RESPONSE =====');

    if (!response.ok) {
      // Log detailed error info
      console.error('[FUB-Lofty] ❌ HTTP Error:', response.status);
      console.error('[FUB-Lofty] Response headers:', Object.fromEntries(response.headers.entries()));
      console.error('[FUB-Lofty] Response body:', responseText);

      // Try to parse error response
      let errorDetail = responseText;
      try {
        const errorJson = JSON.parse(responseText);
        errorDetail = errorJson.status?.msg || errorJson.message || errorJson.error || responseText;
        console.error('[FUB-Lofty] Parsed error:', errorJson);
      } catch (e) {}

      throw new Error(`API error ${response.status}: ${errorDetail}`);
    }

    try {
      const data = JSON.parse(responseText);

      // Check for Lofty API-level errors (status.code !== 0)
      if (data.status && data.status.code !== 0) {
        const errorMsg = data.status.msg || 'Unknown API error';
        const errorCode = data.status.code;

        console.error('[FUB-Lofty] ❌ Lofty API Error:');
        console.error('[FUB-Lofty]   Code:', errorCode);
        console.error('[FUB-Lofty]   Message:', errorMsg);
        console.error('[FUB-Lofty]   Full response:', JSON.stringify(data, null, 2));

        // Check if it's a trigger-specific error
        const isTriggerError = errorMsg.toLowerCase().includes('criteria') ||
                               errorMsg.toLowerCase().includes('author') ||
                               errorMsg.toLowerCase().includes('trigger');

        // Check for signature errors
        const isSignatureError = errorMsg.toLowerCase().includes('signature') ||
                                  errorMsg.toLowerCase().includes('sign') ||
                                  errorCode === 401 || errorCode === 403;

        return {
          success: false,
          triggerError: isTriggerError,
          signatureError: isSignatureError,
          error: `[Code ${errorCode}] ${errorMsg}`,
          errorCode: errorCode,
          data: data
        };
      }

      // Success case
      console.log('[FUB-Lofty] ✅ API Success!');
      return {
        success: true,
        data: data
      };
    } catch (parseError) {
      console.log('[FUB-Lofty] Could not parse response as JSON:', parseError.message);
      return {
        success: true,
        data: responseText
      };
    }
  }

  // Listen for messages from content script
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== 'LOFTY_EXTENSION') return;

    const { type, requestId } = event.data;

    // Handle API request
    if (type === 'MAKE_REQUEST') {
      const { endpoint, method, payload, authCookies } = event.data;

      console.log('[FUB-Lofty] Received request');
      console.log('[FUB-Lofty] authCookies object:', authCookies);
      console.log('[FUB-Lofty] authCookies._T:', authCookies?._T);
      console.log('[FUB-Lofty] Full event.data keys:', Object.keys(event.data));
      console.log('[FUB-Lofty] Payload plan name:', payload?.name);
      console.log('[FUB-Lofty] Payload step count:', payload?.planStepPackList?.length);

      try {
        const result = await makeLoftyRequest(endpoint, method, payload, authCookies);

        // Check if makeLoftyRequest returned an error object
        if (result && result.success === false) {
          console.error('[FUB-Lofty] API returned error result:', result);
          window.postMessage({
            source: 'LOFTY_INJECTED',
            type: 'API_RESPONSE',
            requestId: requestId,
            success: false,
            error: result.error,
            errorCode: result.errorCode,
            triggerError: result.triggerError,
            signatureError: result.signatureError,
            fullResponse: result.data
          }, '*');
        } else {
          window.postMessage({
            source: 'LOFTY_INJECTED',
            type: 'API_RESPONSE',
            requestId: requestId,
            success: true,
            data: result
          }, '*');
        }
      } catch (error) {
        console.error('[FUB-Lofty] Request threw exception:', error);
        console.error('[FUB-Lofty] Error stack:', error.stack);
        window.postMessage({
          source: 'LOFTY_INJECTED',
          type: 'API_RESPONSE',
          requestId: requestId,
          success: false,
          error: error.message,
          errorStack: error.stack
        }, '*');
      }
    }

    // Handle signature analysis request
    if (type === 'ANALYZE_SIGNATURES') {
      console.log('[FUB-Lofty] Running signature analysis...');
      const analysis = analyzeSignatures();
      window.postMessage({
        source: 'LOFTY_INJECTED',
        type: 'ANALYSIS_RESULT',
        requestId: requestId,
        success: true,
        data: analysis
      }, '*');
    }

    // Handle manual signature test with known values
    if (type === 'TEST_SIGNATURE') {
      const { token, timestamp, expectedSig } = event.data;
      console.log('[FUB-Lofty] Testing signature algorithms...');
      console.log('[FUB-Lofty] Token:', token);
      console.log('[FUB-Lofty] Timestamp:', timestamp);
      console.log('[FUB-Lofty] Expected:', expectedSig);

      const results = trySignatureAlgorithms(token, timestamp, expectedSig);
      const match = results.find(r => r.match);

      if (match) {
        console.log('[FUB-Lofty] *** ALGORITHM FOUND ***:', match.name);
      } else {
        console.log('[FUB-Lofty] No matching algorithm found');
      }

      window.postMessage({
        source: 'LOFTY_INJECTED',
        type: 'SIGNATURE_TEST_RESULT',
        requestId: requestId,
        success: true,
        data: { results, match }
      }, '*');
    }

    // Handle request to get captured signatures
    if (type === 'GET_CAPTURED_SIGNATURES') {
      window.postMessage({
        source: 'LOFTY_INJECTED',
        type: 'CAPTURED_SIGNATURES',
        requestId: requestId,
        success: true,
        data: {
          signatures: capturedSignatures,
          count: capturedSignatures.length
        }
      }, '*');
    }

    // Handle request to trigger Lofty navigation (to capture signatures)
    if (type === 'TRIGGER_LOFTY_REQUEST') {
      console.log('[FUB-Lofty] Triggering Lofty API request to capture signature...');
      // Try to trigger a benign API call that Lofty makes
      if (window.$ && window.$.get) {
        try {
          // Try fetching something simple that will trigger Lofty's signing
          window.$.get('/api/user/info', function(data) {
            console.log('[FUB-Lofty] Triggered request completed');
          }).fail(function() {
            console.log('[FUB-Lofty] Triggered request failed (but signature may be captured)');
          });
        } catch (e) {
          console.log('[FUB-Lofty] Could not trigger request:', e);
        }
      }
    }

    // Handle GET_TAGS request
    if (type === 'GET_TAGS') {
      console.log('[FUB-Lofty] Received GET_TAGS request');
      try {
        const tags = await getLoftyTags();
        window.postMessage({
          source: 'LOFTY_INJECTED',
          type: 'TAGS_RESPONSE',
          requestId: requestId,
          success: true,
          data: tags
        }, '*');
      } catch (error) {
        window.postMessage({
          source: 'LOFTY_INJECTED',
          type: 'TAGS_RESPONSE',
          requestId: requestId,
          success: false,
          error: error.message
        }, '*');
      }
    }

    // Handle GET_ACCOUNT request: ids the new editor puts on a plan (teamId, creatorId = team owner)
    if (type === 'GET_ACCOUNT') {
      try {
        const key = Object.keys(localStorage).find(k => /^infoData/.test(k));
        const info = key ? JSON.parse(localStorage.getItem(key)) : null;
        if (!info || !info.teamId) throw new Error('Could not read the Lofty account info (infoData) from this tab');
        window.postMessage({ source: 'LOFTY_INJECTED', type: 'ACCOUNT_RESPONSE', requestId, success: true,
          data: { teamId: info.teamId, userId: info.userId, creatorId: info.teamOwnerId || info.userId,
            onTeam: !!(info.teamOwnerId && info.teamOwnerId !== info.userId),
            siteUrl: (info.myOwnSite && info.myOwnSite.siteUrl) || '', companyName: (info.myOwnSite && info.myOwnSite.companyName) || '' } }, '*');
      } catch (error) {
        window.postMessage({ source: 'LOFTY_INJECTED', type: 'ACCOUNT_RESPONSE', requestId, success: false, error: error.message }, '*');
      }
    }

    // Handle GET_PIPELINES request
    if (type === 'GET_PIPELINES') {
      try {
        const pipelines = await getLoftyPipelines();
        window.postMessage({ source: 'LOFTY_INJECTED', type: 'PIPELINES_RESPONSE', requestId, success: true, data: pipelines }, '*');
      } catch (error) {
        window.postMessage({ source: 'LOFTY_INJECTED', type: 'PIPELINES_RESPONSE', requestId, success: false, error: error.message }, '*');
      }
    }

    // Handle CREATE_TAG request
    if (type === 'CREATE_TAG') {
      const { tagName } = event.data;
      console.log('[FUB-Lofty] Received CREATE_TAG request for:', tagName);
      try {
        const result = await createLoftyTag(tagName);
        window.postMessage({
          source: 'LOFTY_INJECTED',
          type: 'TAG_CREATED',
          requestId: requestId,
          success: true,
          data: result
        }, '*');
      } catch (error) {
        window.postMessage({
          source: 'LOFTY_INJECTED',
          type: 'TAG_CREATED',
          requestId: requestId,
          success: false,
          error: error.message
        }, '*');
      }
    }
  });

  /**
   * Search for Lofty's signature generation in their JavaScript
   */
  function findSignatureInLoftyCode() {
    console.log('[FUB-Lofty] === SEARCHING FOR SIGNATURE FUNCTION ===');

    // Search in jQuery's ajax settings
    if (window.$ && window.$.ajaxSettings) {
      console.log('[FUB-Lofty] jQuery ajaxSettings:', window.$.ajaxSettings);
      if (window.$.ajaxSettings.beforeSend) {
        console.log('[FUB-Lofty] Found beforeSend:', window.$.ajaxSettings.beforeSend.toString().substring(0, 500));
      }
    }

    // Look for axios interceptors
    if (window.axios) {
      console.log('[FUB-Lofty] Found axios');
      if (window.axios.interceptors?.request?.handlers) {
        window.axios.interceptors.request.handlers.forEach((h, i) => {
          if (h.fulfilled) {
            console.log(`[FUB-Lofty] Axios interceptor ${i}:`, h.fulfilled.toString().substring(0, 500));
          }
        });
      }
    }

    // Search window for objects containing 'sign' methods
    const found = [];
    for (const key of Object.getOwnPropertyNames(window)) {
      try {
        const obj = window[key];
        if (obj && typeof obj === 'object') {
          for (const prop of Object.keys(obj)) {
            if (prop.toLowerCase().includes('sign') && typeof obj[prop] === 'function') {
              found.push({ key, prop, fn: obj[prop].toString().substring(0, 300) });
            }
          }
        }
      } catch (e) {}
    }
    if (found.length > 0) {
      console.log('[FUB-Lofty] Found sign-related functions:', found);
    }

    // Look for signature in Vue instance
    if (window.__VUE_DEVTOOLS_GLOBAL_HOOK__) {
      console.log('[FUB-Lofty] Vue detected');
    }

    // Search for md5 function
    if (window.md5) {
      console.log('[FUB-Lofty] Found window.md5');
    }
    if (window.CryptoJS) {
      console.log('[FUB-Lofty] Found CryptoJS');
    }
    if (window.SparkMD5) {
      console.log('[FUB-Lofty] Found SparkMD5');
    }

    // Try to find in global require/modules
    if (window.require) {
      console.log('[FUB-Lofty] Found require');
    }
    if (window.webpackJsonp) {
      console.log('[FUB-Lofty] Found webpack');
    }

    return found;
  }

  /**
   * Try to intercept the next request and log what's happening
   */
  function setupDetailedLogging() {
    // Override XMLHttpRequest to log everything
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;

    XMLHttpRequest.prototype.open = function(method, url) {
      this._url = url;
      this._method = method;
      this._headers = {};
      return origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
      this._headers[name] = value;
      return origSetHeader.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
      if (this._url && this._url.includes('/api/')) {
        console.log('[FUB-Lofty] === XHR REQUEST ===');
        console.log('[FUB-Lofty] URL:', this._url);
        console.log('[FUB-Lofty] Method:', this._method);
        console.log('[FUB-Lofty] Headers:', JSON.stringify(this._headers, null, 2));
        if (this._headers.Signature && this._headers.Timestamp) {
          console.log('[FUB-Lofty] *** SIGNATURE DATA ***');
          console.log('[FUB-Lofty] Signature:', this._headers.Signature);
          console.log('[FUB-Lofty] Timestamp:', this._headers.Timestamp);
          console.log('[FUB-Lofty] _T cookie:', getCookie('_T'));
        }
      }
      return origSend.apply(this, arguments);
    };

    console.log('[FUB-Lofty] Detailed XHR logging enabled');
  }

  // Run the search
  setTimeout(() => {
    findSignatureInLoftyCode();
    setupDetailedLogging();
  }, 2000);

  /**
   * AUTOMATED SCRIPT SEARCHER
   * Fetches ALL JavaScript files from the page and searches for signature code
   * This runs automatically and extracts the exact signing algorithm
   */
  async function searchAllScripts() {
    console.log('[FUB-Lofty] === AUTOMATED SCRIPT SEARCH STARTING ===');
    const results = {
      signaturePatterns: [],
      md5Patterns: [],
      timestampPatterns: [],
      ajaxPatterns: [],
      headerPatterns: []
    };

    // Get ALL script URLs from the page (including CDN-hosted ones)
    const scriptUrls = [];
    document.querySelectorAll('script[src]').forEach(script => {
      if (script.src && script.src.includes('.js')) {
        scriptUrls.push(script.src);
      }
    });

    console.log(`[FUB-Lofty] Found ${scriptUrls.length} external scripts to search`);

    // Also check for dynamically loaded scripts from performance API
    if (window.performance && window.performance.getEntriesByType) {
      const resources = window.performance.getEntriesByType('resource');
      resources.forEach(r => {
        if (r.initiatorType === 'script' && r.name.includes('.js')) {
          if (!scriptUrls.includes(r.name)) {
            scriptUrls.push(r.name);
          }
        }
      });
    }

    console.log(`[FUB-Lofty] Script URLs found:`, scriptUrls);

    console.log(`[FUB-Lofty] Total scripts to analyze: ${scriptUrls.length}`);

    // Search patterns
    const patterns = [
      // Signature generation patterns
      { name: 'signature_assign', regex: /['"](S|s)ignature['"]:\s*([^,\n]+)/g, category: 'signaturePatterns' },
      { name: 'setSignature', regex: /setRequestHeader\s*\(\s*['"]Signature['"]\s*,\s*([^)]+)\)/gi, category: 'signaturePatterns' },
      { name: 'signature_var', regex: /(signature|Signature)\s*[=:]\s*[^,;\n]{5,80}/g, category: 'signaturePatterns' },

      // MD5 patterns
      { name: 'md5_call', regex: /\.?md5\s*\([^)]{5,100}\)/gi, category: 'md5Patterns' },
      { name: 'MD5_call', regex: /MD5\s*\([^)]{5,100}\)/gi, category: 'md5Patterns' },
      { name: 'crypto_md5', regex: /CryptoJS\.MD5\s*\([^)]+\)/gi, category: 'md5Patterns' },

      // Timestamp patterns
      { name: 'timestamp_header', regex: /['"](T|t)imestamp['"]:\s*([^,\n]+)/g, category: 'timestampPatterns' },
      { name: 'timestamp_assign', regex: /(timestamp|Timestamp)\s*[=:]\s*[^,;\n]{5,50}/g, category: 'timestampPatterns' },

      // AJAX/Request setup patterns
      { name: 'beforeSend', regex: /beforeSend\s*:\s*function[^}]{100,500}\}/gi, category: 'ajaxPatterns' },
      { name: 'ajaxPrefilter', regex: /ajaxPrefilter\s*\([^)]*function[^}]{100,800}\}/gi, category: 'ajaxPatterns' },
      { name: 'interceptor', regex: /interceptor[^}]{100,500}\}/gi, category: 'ajaxPatterns' },

      // Header setting patterns
      { name: 'headers_obj', regex: /headers\s*[:=]\s*\{[^}]*[Ss]ignature[^}]*\}/gi, category: 'headerPatterns' },
    ];

    // Fetch and search each script
    for (let i = 0; i < scriptUrls.length; i++) {
      const url = scriptUrls[i];
      console.log(`[FUB-Lofty] Searching ${i+1}/${scriptUrls.length}: ${url.split('/').pop()}`);

      try {
        const response = await fetch(url);
        const code = await response.text();

        // Search for each pattern
        for (const pattern of patterns) {
          const matches = code.match(pattern.regex);
          if (matches) {
            for (const match of matches) {
              // Get context around the match
              const matchIndex = code.indexOf(match);
              const lineStart = code.lastIndexOf('\n', matchIndex) + 1;
              const lineEnd = code.indexOf('\n', matchIndex + match.length);
              const context = code.substring(
                Math.max(0, matchIndex - 200),
                Math.min(code.length, matchIndex + match.length + 200)
              );

              results[pattern.category].push({
                script: url.split('/').pop(),
                pattern: pattern.name,
                match: match.substring(0, 200),
                context: context.replace(/\n/g, ' ').substring(0, 500),
                fullUrl: url
              });
            }
          }
        }

        // Special search: look for the signature algorithm itself
        // Common pattern: md5(something + timestamp) or md5(token + timestamp)
        const sigAlgoRegex = /md5\s*\(\s*([^)]{10,100}(?:timestamp|Timestamp|ts)[^)]{0,50})\)/gi;
        const algoMatches = code.match(sigAlgoRegex);
        if (algoMatches) {
          console.log('[FUB-Lofty] *** POTENTIAL ALGORITHM FOUND ***');
          algoMatches.forEach(m => {
            console.log('[FUB-Lofty] Match:', m);
            results.signaturePatterns.unshift({
              script: url.split('/').pop(),
              pattern: 'LIKELY_ALGORITHM',
              match: m,
              priority: 'HIGH',
              fullUrl: url
            });
          });
        }

      } catch (e) {
        console.log(`[FUB-Lofty] Could not fetch ${url}: ${e.message}`);
      }
    }

    // FALLBACK: Search through all functions in memory
    console.log('[FUB-Lofty] Searching in-memory functions...');
    const searchInMemory = () => {
      const foundFunctions = [];

      // Search through all window properties recursively (limited depth)
      const searched = new Set();
      const searchObj = (obj, path, depth = 0) => {
        if (depth > 3 || searched.has(obj)) return;
        searched.add(obj);

        try {
          for (const key of Object.keys(obj)) {
            try {
              const val = obj[key];
              const fullPath = path ? `${path}.${key}` : key;

              if (typeof val === 'function') {
                const fnStr = val.toString();
                if (fnStr.includes('Signature') || fnStr.includes('signature') ||
                    fnStr.includes('md5') || fnStr.includes('MD5')) {
                  console.log(`[FUB-Lofty] Found relevant function at: ${fullPath}`);
                  foundFunctions.push({
                    path: fullPath,
                    preview: fnStr.substring(0, 500),
                    hasSignature: fnStr.includes('ignature'),
                    hasMd5: fnStr.toLowerCase().includes('md5')
                  });
                }
              } else if (typeof val === 'object' && val !== null && depth < 2) {
                searchObj(val, fullPath, depth + 1);
              }
            } catch (e) {}
          }
        } catch (e) {}
      };

      searchObj(window, 'window', 0);
      return foundFunctions;
    };

    const inMemoryResults = searchInMemory();
    if (inMemoryResults.length > 0) {
      console.log(`[FUB-Lofty] Found ${inMemoryResults.length} relevant functions in memory!`);
      inMemoryResults.forEach(fn => {
        results.signaturePatterns.push({
          script: 'IN_MEMORY',
          pattern: fn.hasSignature ? 'SIGNATURE_FUNCTION' : 'MD5_FUNCTION',
          match: fn.path,
          context: fn.preview,
          priority: fn.hasSignature ? 'HIGH' : 'MEDIUM'
        });
      });
    }

    // Also search inline scripts
    console.log('[FUB-Lofty] Searching inline scripts...');
    document.querySelectorAll('script:not([src])').forEach((script, idx) => {
      const code = script.textContent || '';
      for (const pattern of patterns) {
        const matches = code.match(pattern.regex);
        if (matches) {
          matches.forEach(match => {
            results[pattern.category].push({
              script: `inline_${idx}`,
              pattern: pattern.name,
              match: match.substring(0, 200)
            });
          });
        }
      }
    });

    // Summary
    console.log('[FUB-Lofty] === SEARCH COMPLETE ===');
    console.log(`[FUB-Lofty] Signature patterns found: ${results.signaturePatterns.length}`);
    console.log(`[FUB-Lofty] MD5 patterns found: ${results.md5Patterns.length}`);
    console.log(`[FUB-Lofty] Timestamp patterns found: ${results.timestampPatterns.length}`);
    console.log(`[FUB-Lofty] AJAX patterns found: ${results.ajaxPatterns.length}`);
    console.log(`[FUB-Lofty] Header patterns found: ${results.headerPatterns.length}`);

    // Log most promising results
    if (results.signaturePatterns.length > 0) {
      console.log('[FUB-Lofty] === MOST PROMISING SIGNATURE CODE ===');
      results.signaturePatterns.slice(0, 10).forEach((r, i) => {
        console.log(`[FUB-Lofty] ${i+1}. [${r.script}] ${r.pattern}:`);
        console.log(`[FUB-Lofty]    ${r.match}`);
        if (r.context) {
          console.log(`[FUB-Lofty]    Context: ${r.context.substring(0, 300)}...`);
        }
      });
    }

    if (results.md5Patterns.length > 0) {
      console.log('[FUB-Lofty] === MD5 USAGES FOUND ===');
      results.md5Patterns.slice(0, 10).forEach((r, i) => {
        console.log(`[FUB-Lofty] ${i+1}. [${r.script}]: ${r.match}`);
      });
    }

    return results;
  }

  /**
   * Deep search for the signing function in webpack modules
   * This is the most thorough search method
   */
  function deepSearchForSignature() {
    console.log('[FUB-Lofty] === DEEP SEARCH FOR SIGNATURE FUNCTION ===');
    const results = [];

    // 1. Search in webpackJsonp modules
    if (window.webpackJsonp) {
      console.log('[FUB-Lofty] Searching webpackJsonp...');
      try {
        for (const chunk of window.webpackJsonp) {
          if (Array.isArray(chunk) && chunk[1]) {
            const modules = chunk[1];
            for (const moduleId in modules) {
              try {
                const moduleStr = modules[moduleId].toString();
                if (moduleStr.includes('Signature') || moduleStr.includes('signature')) {
                  console.log(`[FUB-Lofty] Found "Signature" in module ${moduleId}`);
                  // Extract relevant context
                  const sigIndex = moduleStr.toLowerCase().indexOf('signature');
                  const context = moduleStr.substring(Math.max(0, sigIndex - 100), sigIndex + 200);
                  results.push({ type: 'webpack', moduleId, context });
                }
                if (moduleStr.includes('.md5(') || moduleStr.includes('md5(')) {
                  console.log(`[FUB-Lofty] Found "md5" in module ${moduleId}`);
                  const md5Index = moduleStr.indexOf('md5(');
                  const context = moduleStr.substring(Math.max(0, md5Index - 50), md5Index + 150);
                  results.push({ type: 'webpack-md5', moduleId, context });
                }
              } catch (e) {}
            }
          }
        }
      } catch (e) {
        console.log('[FUB-Lofty] Error searching webpackJsonp:', e);
      }
    }

    // 2. Search in window.__NEXT_DATA__ (if Next.js)
    if (window.__NEXT_DATA__) {
      console.log('[FUB-Lofty] Found Next.js app');
    }

    // 3. Search in Vue devtools
    if (window.__VUE__) {
      console.log('[FUB-Lofty] Found Vue instance');
    }

    // 4. Search all script sources in the document
    console.log('[FUB-Lofty] Searching inline scripts...');
    const scripts = document.querySelectorAll('script:not([src])');
    scripts.forEach((script, i) => {
      const text = script.textContent || '';
      if (text.includes('Signature') || text.includes('md5')) {
        console.log(`[FUB-Lofty] Found in inline script ${i}`);
        results.push({ type: 'inline', scriptIndex: i, preview: text.substring(0, 500) });
      }
    });

    // 5. Try to find the actual signing location by hooking deeper
    console.log('[FUB-Lofty] Setting up deep hooks...');

    // Hook into Object.defineProperty to catch dynamic property definitions
    const origDefineProperty = Object.defineProperty;
    Object.defineProperty = function(obj, prop, descriptor) {
      if (prop === 'Signature' || prop === 'signature') {
        console.log('[FUB-Lofty] defineProperty called for Signature!', new Error().stack);
      }
      return origDefineProperty.apply(this, arguments);
    };

    console.log('[FUB-Lofty] Deep search complete. Results:', results);
    return results;
  }

  /**
   * Monitor and log all header operations to find the signing pattern
   */
  function startHeaderMonitor(useDebugger = false) {
    console.log('[FUB-Lofty] Starting header monitor...');

    // Store original
    const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;

    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
      if (name.toLowerCase() === 'signature') {
        console.log('%c[FUB-Lofty] ========== SIGNATURE BEING SET ==========', 'background: #ff0; color: #000; font-size: 14px; padding: 4px;');
        console.log('%cSignature: ' + value, 'color: #0f0; font-size: 12px;');
        console.log('%cStack trace (click to see source):', 'color: #ff0;');
        console.trace();
        console.log('%c===========================================', 'background: #ff0; color: #000;');

        if (useDebugger) {
          console.log('[FUB-Lofty] Pausing for inspection. Check the Call Stack in DevTools!');
          debugger; // This will pause execution so you can inspect the call stack
        }
      }

      return origSetHeader.apply(this, arguments);
    };

    // Also try to hook into jQuery's ajaxPrefilter if available
    if (window.$ && window.$.ajaxPrefilter) {
      console.log('[FUB-Lofty] Hooking into jQuery ajaxPrefilter...');

      // Try to inspect existing prefilters
      if (window.$.ajaxSettings && window.$.ajaxSettings.beforeSend) {
        console.log('[FUB-Lofty] Found existing beforeSend:', window.$.ajaxSettings.beforeSend.toString().substring(0, 500));
      }
    }

    // Also hook fetch
    const origFetch = window.fetch;
    window.fetch = function(url, options) {
      if (options?.headers) {
        const sig = options.headers['Signature'] || options.headers['signature'];
        if (sig) {
          console.log('%c[FUB-Lofty] FETCH with Signature: ' + sig, 'background: #f0f; color: #fff;');
          console.trace();
        }
      }
      return origFetch.apply(this, arguments);
    };

    console.log('[FUB-Lofty] Header monitor active. Navigate in Lofty to trigger requests.');
    console.log('[FUB-Lofty] TIP: Run startMonitor(true) to pause with debugger when signature is set');
    return 'Monitor active - check console when you navigate';
  }

  /**
   * MOST RELIABLE METHOD: Pause execution when signature is set
   * This lets you inspect the call stack in DevTools
   */
  function pauseOnSignature() {
    console.log('[FUB-Lofty] Will pause execution when Signature header is set.');
    console.log('[FUB-Lofty] Navigate somewhere in Lofty, then inspect the Call Stack in DevTools.');
    return startHeaderMonitor(true);
  }

  /**
   * Try to find signing function by intercepting function calls
   */
  function findSigningByProxy() {
    console.log('[FUB-Lofty] Setting up Proxy traps...');

    // Wrap common crypto/hash functions
    if (window.CryptoJS) {
      const origMD5 = window.CryptoJS.MD5;
      window.CryptoJS.MD5 = function(...args) {
        console.log('[FUB-Lofty] CryptoJS.MD5 called with:', args);
        console.trace();
        return origMD5.apply(this, args);
      };
      console.log('[FUB-Lofty] Wrapped CryptoJS.MD5');
    }

    if (window.md5) {
      const origMd5 = window.md5;
      window.md5 = function(...args) {
        console.log('[FUB-Lofty] window.md5 called with:', args);
        console.trace();
        return origMd5.apply(this, args);
      };
      console.log('[FUB-Lofty] Wrapped window.md5');
    }

    return 'Proxy traps set. Navigate to trigger signing.';
  }

  // All 44 FUB tags to create
  const FUB_TAGS = [
    "Buyer", "CM-Start", "CONTACT DASHBOARD VIEW", "HANDRAISER", "HOMEBOT_ENGAGED",
    "LCADrip", "Lead-Day1-15-Audit", "NEW_NUMBER", "NOTEXT", "NURTURE",
    "PriorityPondCheck", "RENTER", "REQUESTED_RATE", "Raiya Ylopo Call Center Calls Completed",
    "RealScout HVA Viewed", "Seller", "StoragePondCheck", "YPRIORITY", "Y_AI_PRIORITY",
    "Y_FAVORITED_LISTING", "Y_HOME_3_VIEW", "Y_REQUESTED_TOUR", "Y_SELLER_3_VIEW",
    "Y_SELLER_CALL_AGENT", "Y_SELLER_EMAIL_AGENT", "Y_SELLER_HEATMAP_INQUIRY",
    "Y_SELLER_LEARN_MORE_EQUITY", "Y_SELLER_NEW_HOME_UPGRADES", "Y_SELLER_PRIVATE_SHOWING",
    "Y_SELLER_REPORT_ENGAGED", "Y_SELLER_REPORT_VIEWED", "Y_SELLER_SEARCH_MORE_PROPERTIES",
    "Y_SELLER_SEE_MORE_LISTINGS", "Y_SELLER_SELF_GENERATED", "Y_SELLER_TUNE_HOME_VALUE",
    "Y_SELLER_UNDERSTAND_TREND", "Y_SELLER_VIEWED_SIMILAR_LISTINGS", "Ylopo_Rev_Test",
    "appinvite", "handraiser", "homeownersurface", "past client", "sphere", "unresponsive"
  ];

  /**
   * Simple function to create all 44 FUB tags in Lofty
   * Run from console: window.__FUB_LOFTY_DEBUG.createAllFubTags()
   */
  async function createAllFubTags() {
    console.log(`Creating ${FUB_TAGS.length} FUB tags in Lofty...`);

    let created = 0;
    let failed = 0;
    const results = [];

    for (let i = 0; i < FUB_TAGS.length; i++) {
      const tagName = FUB_TAGS[i];
      console.log(`[${i + 1}/${FUB_TAGS.length}] Creating: ${tagName}`);

      try {
        const result = await createLoftyTag(tagName);
        created++;
        results.push({ tag: tagName, status: 'created', id: result.id });
        console.log(`  ✓ Created (ID: ${result.id})`);
      } catch (error) {
        failed++;
        results.push({ tag: tagName, status: 'failed', error: error.message });
        console.log(`  ✗ Failed: ${error.message}`);
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`\n=== DONE ===`);
    console.log(`Created: ${created}`);
    console.log(`Failed: ${failed}`);
    console.table(results);

    return { created, failed, results };
  }

  // Expose analysis function globally for debugging in console
  window.__FUB_LOFTY_DEBUG = {
    // SIMPLE TAG CREATION - run this!
    createAllFubTags,
    createTag: createLoftyTag,

    // Legacy debug stuff
    analyzeSignatures,
    trySignatureAlgorithms,
    getCaptured: () => capturedSignatures,
    getCookies: () => ({
      _T: getCookie('_T'),
      _MT: getCookie('_MT'),
      _AT: getCookie('_AT'),
      _UI: getCookie('_UI')
    }),
    testSig: (token, timestamp, expected) => trySignatureAlgorithms(token, timestamp, expected),
    md5: md5,
    findSign: findSignatureInLoftyCode,
    deepSearch: deepSearchForSignature,
    startMonitor: startHeaderMonitor,
    pauseOnSig: pauseOnSignature,
    findByProxy: findSigningByProxy,
    searchAllScripts: searchAllScripts,

    // Quick help
    help: () => {
      console.log(`
=== FUB-Lofty Tools ===

*** CREATE ALL FUB TAGS - RUN THIS ***
createAllFubTags()  - Creates all 44 FUB tags in Lofty (one-time)
createTag("name")   - Create a single tag

That's it! Just run createAllFubTags() and wait.
      `);
    }
  };

  // Handle search request from popup
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== 'LOFTY_EXTENSION') return;

    if (event.data.type === 'SEARCH_ALL_SCRIPTS') {
      console.log('[FUB-Lofty] Received search request from popup');
      const results = await searchAllScripts();
      window.postMessage({
        source: 'LOFTY_INJECTED',
        type: 'SEARCH_RESULTS',
        requestId: event.data.requestId,
        success: true,
        data: results
      }, '*');
    }
  });

  console.log('[FUB-Lofty] Injected script loaded');
  console.log('[FUB-Lofty] Debug tools: window.__FUB_LOFTY_DEBUG');
  console.log('[FUB-Lofty] Run window.__FUB_LOFTY_DEBUG.help() for commands');
  console.log('[FUB-Lofty] Run window.__FUB_LOFTY_DEBUG.startMonitor() to find the signing function');
})();

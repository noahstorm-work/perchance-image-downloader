(function() {
  'use strict';

  var api = typeof browser !== 'undefined' ? browser : chrome;

  var SCHEMA_VERSION = 2;
  var MAX_QUEUE_SIZE = 500;
  var MAX_RETRIES = 3;
  var RETRY_DELAY = 1000;
  var CONTEXT_MENU_DEBOUNCE = 1000;
  var MIME_EXTENSIONS = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/bmp': '.bmp' };

  var DETECTION_CONFIG = {
    allowedDomains: ['perchance.org', 'image-generation.perchance.org'],
    minImageSize: 50,
    promptSelectors: 'textarea, input[type="text"]',
    promptMinLength: 3,
    promptMaxLength: 500,
    imageIdBaseUrl: 'https://image-generation.perchance.org/image/',
    imageIdSuffix: '.jpeg',
    postMessagePatterns: [
      { type: 'finished', srcKey: 'dataUrl', idPrefix: '_' },
      { type: 'success', srcTemplate: 'https://image-generation.perchance.org/image/{imageId}.jpeg', idKey: 'imageId' }
    ],
    consoleLogPatterns: [
      { statusMatch: 'success', srcTemplate: 'https://image-generation.perchance.org/image/{imageId}.jpeg', idKey: 'imageId' }
    ],
    promptKeys: ['prompt']
  };

  function isAllowedUrl(src) {
    if (src.indexOf('data:image') === 0) return true;
    try {
      var hostname = new URL(src).hostname;
      var domains = DETECTION_CONFIG.allowedDomains;
      for (var i = 0; i < domains.length; i++) {
        if (hostname === domains[i] || hostname.endsWith('.' + domains[i])) return true;
      }
    } catch(e) {}
    return false;
  }

  function detectExtension(src) {
    if (src.indexOf('data:image') === 0) {
      var match = src.match(/data:(image\/[a-z]+);/);
      if (match && MIME_EXTENSIONS[match[1]]) return MIME_EXTENSIONS[match[1]];
      return '.jpg';
    }
    try {
      var pathname = new URL(src).pathname;
      var ext = pathname.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i);
      if (ext) return '.' + ext[1].toLowerCase();
    } catch(e) {}
    return '.jpg';
  }

  function sanitizeFilename(prompt) {
    return (prompt || 'image').replace(/[^a-z0-9]/gi, '-').substring(0, 50);
  }

  function extractPrompt(data) {
    var keys = DETECTION_CONFIG.promptKeys;
    for (var i = 0; i < keys.length; i++) {
      if (data && data[keys[i]]) return data[keys[i]];
    }
    return null;
  }

  function generateId(prefix) {
    return prefix + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  }

  self.__pdl = {
    api: api,
    SCHEMA_VERSION: SCHEMA_VERSION,
    MAX_QUEUE_SIZE: MAX_QUEUE_SIZE,
    MAX_RETRIES: MAX_RETRIES,
    RETRY_DELAY: RETRY_DELAY,
    CONTEXT_MENU_DEBOUNCE: CONTEXT_MENU_DEBOUNCE,
    DETECTION_CONFIG: DETECTION_CONFIG,
    isAllowedUrl: isAllowedUrl,
    detectExtension: detectExtension,
    sanitizeFilename: sanitizeFilename,
    extractPrompt: extractPrompt,
    generateId: generateId
  };
})();

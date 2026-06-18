(function() {
  'use strict';

  var api = typeof browser !== 'undefined' ? browser : chrome;

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

  var imgs = {};
  var lastPrompt = 'unknown';
  var origConsoleLog = console.log;

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

  function getPrompt() {
    var els = document.querySelectorAll(DETECTION_CONFIG.promptSelectors);
    for (var i = 0; i < els.length; i++) {
      var v = els[i].value;
      if (v && v.length >= DETECTION_CONFIG.promptMinLength && v.length < DETECTION_CONFIG.promptMaxLength) return v.trim();
    }
    return lastPrompt;
  }

  // NOTE: Prompt text originates from Perchance page DOM (textarea/input values)
  // and from postMessage/console.log events from the Perchance origin.
  // It is stored as-is and rendered via textContent (not innerHTML) in the overlay,
  // so it is safe against XSS. If prompt rendering ever changes to use innerHTML,
  // this trust boundary must be re-evaluated.
  function add(id, src, prompt) {
    if (!id || !src || imgs[id]) return;
    imgs[id] = { id: id, src: src, prompt: prompt || getPrompt() || 'image', timestamp: new Date().toISOString() };
  }

  function generateId(prefix) {
    return prefix + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  }

  function notifyBadge() {
    var count = Object.keys(imgs).length;
    try { api.runtime.sendMessage({type:'imageCount', count:count}); } catch(e) {}
  }

  function scan() {
    document.querySelectorAll('img').forEach(function(img) {
      var src = img.src || '';
      if (!src) return;
      if (!isAllowedUrl(src)) return;
      if (img.naturalWidth < DETECTION_CONFIG.minImageSize || img.naturalHeight < DETECTION_CONFIG.minImageSize) return;
      var id = src.indexOf('data:image') === 0 ? generateId('d') : src.split('/').pop().split('?')[0];
      if (!id) id = generateId('img');
      add(id, src);
    });
    notifyBadge();
  }

  api.runtime.onMessage.addListener(function(msg, s, send) {
    if (msg.type === 'refreshImages') {
      imgs = {};
      scan();
      send({images: Object.values(imgs)});
    }
    return true;
  });

  window.addEventListener('message', function(e) {
    try {
      if (!e.data || typeof e.data !== 'object') return;
      var patterns = DETECTION_CONFIG.postMessagePatterns;
      for (var i = 0; i < patterns.length; i++) {
        var p = patterns[i];
        if (p.type && e.data.type === p.type && e.data[p.srcKey || 'dataUrl']) {
          add(generateId(p.idPrefix || '_'), e.data[p.srcKey || 'dataUrl']);
          notifyBadge();
        }
        if (p.statusMatch && e.data.status === p.statusMatch && e.data[p.idKey]) {
          var imgId = e.data[p.idKey];
          var imgUrl = p.srcTemplate.replace('{imageId}', imgId);
          add(imgId, imgUrl);
          notifyBadge();
        }
      }
      var promptKeys = DETECTION_CONFIG.promptKeys;
      for (var j = 0; j < promptKeys.length; j++) {
        if (e.data[promptKeys[j]]) lastPrompt = e.data[promptKeys[j]];
      }
    } catch(ex) {}
  });

  var patchedLog = function() {
    origConsoleLog.apply(console, arguments);
    for (var i = 0; i < arguments.length; i++) {
      var a = arguments[i];
      var patterns = DETECTION_CONFIG.consoleLogPatterns;
      for (var j = 0; j < patterns.length; j++) {
        var p = patterns[j];
        if (a && typeof a === 'object' && a.status === p.statusMatch && a[p.idKey]) {
          var imgId = a[p.idKey];
          var imgUrl = p.srcTemplate.replace('{imageId}', imgId);
          add(imgId, imgUrl, a.prompt);
          notifyBadge();
        }
      }
      var promptKeys = DETECTION_CONFIG.promptKeys;
      for (var k = 0; k < promptKeys.length; k++) {
        if (a && a[promptKeys[k]]) lastPrompt = a[promptKeys[k]];
      }
    }
  };
  console.log = patchedLog;

  window.addEventListener('beforeunload', function() {
    console.log = origConsoleLog;
  });

  scan();
})();

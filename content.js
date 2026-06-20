(function() {
  'use strict';

  var s = self.__pdl;
  var api = s.api;
  var DETECTION_CONFIG = s.DETECTION_CONFIG;
  var isAllowedUrl = s.isAllowedUrl;
  var extractPrompt = s.extractPrompt;
  var generateId = s.generateId;

  var imgs = {};
  var lastPrompt = 'unknown';
  var origConsoleLog = console.log;

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
    if (!id || !src) return;
    if (imgs[id]) return;
    var keys = Object.keys(imgs);
    for (var i = 0; i < keys.length; i++) {
      if (imgs[keys[i]].src === src) return;
    }
    imgs[id] = { id: id, src: src, prompt: prompt || getPrompt() || 'image', timestamp: new Date().toISOString() };
  }

  function processImageMessage(pattern, data) {
    if (pattern.type && data.type === pattern.type && data[pattern.srcKey || 'dataUrl']) {
      var id = generateId(pattern.idPrefix || '_');
      add(id, data[pattern.srcKey || 'dataUrl']);
      notifyBadge();
    }
    if (pattern.statusMatch && data.status === pattern.statusMatch && data[pattern.idKey]) {
      var imgId = data[pattern.idKey];
      var imgUrl = pattern.srcTemplate.replace('{imageId}', imgId);
      add(imgId, imgUrl);
      notifyBadge();
    }
  }

  function processLogMessage(pattern, arg) {
    if (arg && typeof arg === 'object' && arg.status === pattern.statusMatch && arg[pattern.idKey]) {
      var imgId = arg[pattern.idKey];
      var imgUrl = pattern.srcTemplate.replace('{imageId}', imgId);
      add(imgId, imgUrl, arg.prompt);
      notifyBadge();
    }
  }

  function notifyBadge() {
    var count = Object.keys(imgs).length;
    try { api.runtime.sendMessage({type:'imageCount', count:count}); } catch(e) {}
  }

  function isElementVisible(el) {
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    var style = window.getComputedStyle(el);
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity) === 0) return false;
    if (style.position === 'absolute' || style.position === 'fixed') {
      if (rect.bottom < 0 || rect.right < 0) return false;
    }
    var parent = el.parentElement;
    while (parent && parent !== document.documentElement) {
      var ps = window.getComputedStyle(parent);
      if (ps.display === 'none') return false;
      parent = parent.parentElement;
    }
    return true;
  }

  function scan() {
    var found = {};
    document.querySelectorAll('img').forEach(function(img) {
      var src = img.src || '';
      if (!src) return;
      if (img.closest('#pdl')) return;
      if (!isAllowedUrl(src)) return;
      if (!isElementVisible(img)) return;
      if (img.naturalWidth < DETECTION_CONFIG.minImageSize || img.naturalHeight < DETECTION_CONFIG.minImageSize) return;
      var id = src.indexOf('data:image') === 0 ? generateId('d') : src.split('/').pop().split('?')[0];
      if (!id) id = generateId('img');
      if (!found[id]) {
        found[id] = { id: id, src: src, prompt: getPrompt() || 'image', timestamp: new Date().toISOString() };
      }
    });
    imgs = found;
    notifyBadge();
  }

  api.runtime.onMessage.addListener(function(msg, sender, send) {
    if (msg.type === 'refreshImages') {
      imgs = {};
      scan();
      send({images: Object.values(imgs)});
    }
    if (msg.type === 'downloadAll') {
      var allImages = [];
      Object.keys(imgs).forEach(function(id) { allImages.push(imgs[id]); });
      if (allImages.length > 0) {
        api.runtime.sendMessage({type: 'downloadImages', images: allImages});
      }
    }
    return true;
  });

  window.addEventListener('message', function(e) {
    try {
      if (!e.data || typeof e.data !== 'object') return;
      var patterns = DETECTION_CONFIG.postMessagePatterns;
      for (var i = 0; i < patterns.length; i++) {
        processImageMessage(patterns[i], e.data);
      }
      var prompt = extractPrompt(e.data);
      if (prompt) lastPrompt = prompt;
    } catch(ex) {}
  });

  var patchedLog = function() {
    origConsoleLog.apply(console, arguments);
    for (var i = 0; i < arguments.length; i++) {
      var a = arguments[i];
      var patterns = DETECTION_CONFIG.consoleLogPatterns;
      for (var j = 0; j < patterns.length; j++) {
        processLogMessage(patterns[j], a);
      }
      var prompt = extractPrompt(a);
      if (prompt) lastPrompt = prompt;
    }
  };

  if (console.log !== patchedLog) {
    try {
      console.log = patchedLog;
    } catch(e) {
      try { Object.defineProperty(console, 'log', {value: patchedLog, writable: true, configurable: true}); } catch(e2) {}
    }
  }

  function restoreConsoleLog() {
    console.log = origConsoleLog;
  }

  window.addEventListener('beforeunload', restoreConsoleLog);
  window.addEventListener('pagehide', restoreConsoleLog);

  scan();
})();

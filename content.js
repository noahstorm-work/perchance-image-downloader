(function() {
  'use strict';

  var imgs = {};
  var lastPrompt = 'unknown';
  var origConsoleLog = console.log;

  function getPrompt() {
    var els = document.querySelectorAll('textarea, input[type="text"]');
    for (var i = 0; i < els.length; i++) {
      var v = els[i].value;
      if (v && v.length > 2 && v.length < 500) return v.trim();
    }
    return lastPrompt;
  }

  function add(id, src, prompt) {
    if (!id || !src || imgs[id]) return;
    imgs[id] = { id: id, src: src, prompt: prompt || getPrompt() || 'image', timestamp: new Date().toISOString() };
  }

  function notifyBadge() {
    var count = Object.keys(imgs).length;
    try { chrome.runtime.sendMessage({type:'imageCount', count:count}); } catch(e) {}
  }

  function scan() {
    document.querySelectorAll('img').forEach(function(img) {
      var src = img.src || '';
      if (!src) return;
      if (src.indexOf('perchance.org') === -1 && src.indexOf('data:image') !== 0) return;
      if (img.naturalWidth < 50 || img.naturalHeight < 50) return;
      var id = src.indexOf('data:image') === 0 ? 'd' + Date.now() + '_' + Math.random().toString(36).substr(2,5) : src.split('/').pop().split('?')[0];
      if (!id) id = 'img' + Date.now() + '_' + Math.random().toString(36).substr(2,5);
      add(id, src);
    });
    notifyBadge();
  }

  chrome.runtime.onMessage.addListener(function(msg, s, send) {
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
      if (e.data.type === 'finished' && e.data.dataUrl) { add('_' + Date.now() + '_' + Math.random().toString(36).substr(2,5), e.data.dataUrl); notifyBadge(); }
      if (e.data.status === 'success' && e.data.imageId) { add(e.data.imageId, 'https://image-generation.perchance.org/image/' + e.data.imageId + '.jpeg'); notifyBadge(); }
      if (e.data.prompt) lastPrompt = e.data.prompt;
    } catch(ex) {}
  });

  console.log = function() {
    origConsoleLog.apply(console, arguments);
    for (var i = 0; i < arguments.length; i++) {
      var a = arguments[i];
      if (a && typeof a === 'object' && a.status === 'success' && a.imageId) { add(a.imageId, 'https://image-generation.perchance.org/image/' + a.imageId + '.jpeg', a.prompt); notifyBadge(); }
      if (a && a.prompt) lastPrompt = a.prompt;
    }
  };

  scan();
})();

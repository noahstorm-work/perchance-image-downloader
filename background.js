(function() {
  var api = typeof browser !== 'undefined' ? browser : chrome;

  var SCHEMA_VERSION = 2;
  var MAX_QUEUE_SIZE = 500;
  var MAX_RETRIES = 3;
  var RETRY_DELAY = 1000;
  var CONTEXT_MENU_DEBOUNCE = 1000;
  var MIME_EXTENSIONS = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/bmp': '.bmp' };

  var queue = [];
  var busy = false;
  var total = 0;
  var done = 0;
  var failedCount = 0;
  var folderName = 'Perchance Downloads';
  var queuedUrls = {};
  var downloadHistory = {};
  var lastContextClick = 0;
  var activeTabId = null;

  function apiAvailable(name) {
    return typeof api !== 'undefined' && api[name];
  }

  function logMemory(context) {
    if (typeof performance !== 'undefined' && performance.memory) {
      var mem = performance.memory;
      var used = Math.round(mem.usedJSHeapSize / 1048576);
      var limit = Math.round(mem.jsHeapSizeLimit / 1048576);
      if (used > limit * 0.8) {
        console.warn('[PDL] High memory in ' + context + ': ' + used + 'MB / ' + limit + 'MB');
      }
    }
  }

  function ensureDownloadsPermission(callback) {
    if (!apiAvailable('permissions')) { callback(true); return; }
    api.permissions.contains({permissions: ['downloads']}, function(hasPerm) {
      if (hasPerm) { callback(true); return; }
      api.permissions.request({permissions: ['downloads']}, function(granted) {
        callback(!!granted);
      });
    });
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

  function migrateStorage(callback) {
    if (!apiAvailable('storage')) { callback(); return; }
    api.storage.local.get(['pdlSchemaVersion', 'settings', 'pdlDownloadHistory'], function(r) {
      if (api.runtime.lastError) { callback(); return; }
      var currentVersion = r.pdlSchemaVersion || 0;
      var settings = r.settings || {};
      downloadHistory = r.pdlDownloadHistory || {};
      if (currentVersion < SCHEMA_VERSION) {
        api.storage.local.set({pdlSchemaVersion: SCHEMA_VERSION, settings: settings, pdlDownloadHistory: downloadHistory}, function() {
          callback();
        });
      } else {
        callback();
      }
    });
  }

  function persistQueue() {
    if (!apiAvailable('storage') || !api.storage.session) return;
    try {
      api.storage.session.set({pdlQueue: queue, pdlQueuedUrls: queuedUrls, pdlTotal: total, pdlDone: done, pdlFailed: failedCount});
    } catch(e) {}
  }

  function persistHistory() {
    if (!apiAvailable('storage')) return;
    try { api.storage.local.set({pdlDownloadHistory: downloadHistory}); } catch(e) {}
  }

  function restoreQueue(callback) {
    if (!apiAvailable('storage') || !api.storage.session) { callback(); return; }
    try {
      api.storage.session.get(['pdlQueue', 'pdlQueuedUrls', 'pdlTotal', 'pdlDone', 'pdlFailed'], function(r) {
        if (api.runtime.lastError) { callback(); return; }
        if (r.pdlQueue && r.pdlQueue.length) {
          queue = r.pdlQueue;
          queuedUrls = r.pdlQueuedUrls || {};
          total = r.pdlTotal || 0;
          done = r.pdlDone || 0;
          failedCount = r.pdlFailed || 0;
        }
        callback();
      });
    } catch(e) { callback(); }
  }

  migrateStorage(function() {
    if (apiAvailable('storage')) {
      api.storage.local.get('settings', function(r) {
        if (api.runtime.lastError) return;
        if (r.settings && r.settings.folder) folderName = r.settings.folder;
      });
      api.storage.onChanged.addListener(function(c) {
        if (c.settings && c.settings.newValue && c.settings.newValue.folder) folderName = c.settings.newValue.folder;
      });
    }
    restoreQueue(function() {
      if (queue.length && !busy) runQueue();
      init();
    });
  });

  function init() {
    if (apiAvailable('tabs')) {
      api.tabs.onUpdated.addListener(function(tabId, changeInfo) {
        if (changeInfo.status === 'loading') updateBadge(tabId, '');
      });
      api.tabs.onRemoved.addListener(function(tabId) {
        updateBadge(tabId, '');
      });
    }

    if (apiAvailable('action')) {
      api.action.onClicked.addListener(function(tab) {
        activeTabId = tab.id;
        api.tabs.sendMessage(tab.id, {type:'toggleOverlay'}, function(r) {
          if (api.runtime.lastError) console.log('[PDL] no content script');
        });
      });
    }

    if (apiAvailable('downloads')) {
      api.downloads.onChanged.addListener(function(delta) {
        if (!delta.state) return;
        if (delta.state.current === 'complete') {
          done++;
          busy = false;
          persistQueue();
          notifyOverlay('downloadProgress', {done: done, total: total, failed: failedCount});
          runQueue();
        } else if (delta.state.current === 'interrupted') {
          handleDownloadFailure(delta.id);
        }
      });
    }

    api.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
      handleMessage(msg, sender, sendResponse);
    });

    if (apiAvailable('contextMenus')) {
      api.contextMenus.create({
        id: 'pdl-ctx',
        title: 'Download with Perchance Downloader',
        contexts: ['image'],
        documentUrlPatterns: ['https://*.perchance.org/*'],
        icons: { '48': 'icons/icon-48.png' }
      });

      api.contextMenus.onClicked.addListener(function(info) {
        if (info.menuItemId !== 'pdl-ctx' || !info.srcUrl) return;
        var now = Date.now();
        if (now - lastContextClick < CONTEXT_MENU_DEBOUNCE) return;
        lastContextClick = now;
        ensureDownloadsPermission(function(granted) {
          if (!granted) { notifyOverlay('toast', {message: 'Download permission denied', type: 'error'}); return; }
          var ctxImg = {
            id: 'ctx' + Date.now(),
            src: info.srcUrl,
            prompt: 'context-download',
            timestamp: new Date().toISOString()
          };
          if (!queuedUrls[ctxImg.src] && queue.length < MAX_QUEUE_SIZE) {
            queue.push(ctxImg);
            queuedUrls[ctxImg.src] = true;
            total++;
            persistQueue();
            if (!busy) runQueue();
          }
        });
      });
    }
  }

  function updateBadge(tabId, count) {
    if (!apiAvailable('action')) return;
    var text = count > 0 ? String(count) : '';
    api.action.setBadgeText({text: text, tabId: tabId});
    api.action.setBadgeBackgroundColor({color: '#e94560', tabId: tabId});
  }

  function notifyOverlay(type, data) {
    if (!apiAvailable('tabs') || !activeTabId) return;
    try {
      api.tabs.sendMessage(activeTabId, {type: type, data: data});
    } catch(e) {}
  }

  function handleMessage(msg, sender, sendResponse) {
    if (msg.type === 'imageCount') {
      var countTabId = sender.tab ? sender.tab.id : null;
      if (!countTabId) {
        if (apiAvailable('tabs')) {
          api.tabs.query({active:true,currentWindow:true}, function(tabs) {
            if (tabs && tabs[0]) updateBadge(tabs[0].id, msg.count);
          });
        }
      } else {
        updateBadge(countTabId, msg.count);
      }
      return;
    }
    if (msg.type === 'refreshImages') {
      var refreshTabId = sender.tab ? sender.tab.id : null;
      if (sender.tab) activeTabId = sender.tab.id;
      if (!refreshTabId) {
        if (apiAvailable('tabs')) {
          api.tabs.query({active:true,currentWindow:true}, function(tabs) {
            if (tabs && tabs[0]) refreshTabId = tabs[0].id;
            doRefresh(refreshTabId, sendResponse);
          });
        } else {
          sendResponse({images:[]});
        }
        return true;
      }
      doRefresh(refreshTabId, sendResponse);
      return true;
    }
    if (msg.type === 'downloadImages') {
      ensureDownloadsPermission(function(granted) {
        if (!granted) { sendResponse({ok:0, error:'permission denied'}); return; }
        var added = 0;
        var skipped = 0;
        msg.images.forEach(function(img) {
          if (queuedUrls[img.src]) { skipped++; return; }
          if (downloadHistory[img.src]) { skipped++; return; }
          if (queue.length >= MAX_QUEUE_SIZE) return;
          queue.push(img);
          queuedUrls[img.src] = true;
          added++;
        });
        total += added;
        if (skipped > 0) {
          notifyOverlay('toast', {message: skipped + ' already downloaded or queued', type: 'info'});
        }
        persistQueue();
        if (!busy) runQueue();
        sendResponse({ok:1, added:added, queueSize:queue.length, limit:MAX_QUEUE_SIZE});
      });
      return true;
    }
    if (msg.type === 'getProgress') {
      sendResponse({done:done, total:total, busy:busy, failed:failedCount});
    }
    if (msg.type === 'getHistory') {
      sendResponse({history: downloadHistory});
    }
    return true;
  }

  function doRefresh(tabId, sendResponse) {
    if (!tabId) { sendResponse({images:[]}); return; }
    if (!apiAvailable('webNavigation') || !apiAvailable('tabs')) { sendResponse({images:[]}); return; }
    api.webNavigation.getAllFrames({tabId:tabId}, function(frames) {
      if (api.runtime.lastError || !frames || !frames.length) { sendResponse({images:[]}); return; }
      var all = [];
      var left = frames.length;
      frames.forEach(function(f) {
        api.tabs.sendMessage(tabId, {type:'refreshImages'}, {frameId:f.frameId}, function(r) {
          if (!api.runtime.lastError && r && r.images) all = all.concat(r.images);
          left--;
          if (left===0) {
            var seen={};
            var uniq=[];
            all.forEach(function(i){if(!seen[i.src]){seen[i.src]=1;uniq.push(i)}});
            updateBadge(tabId, uniq.length);
            sendResponse({images:uniq});
          }
        });
      });
    });
  }

  function handleDownloadFailure(downloadId) {
    var img = null;
    for (var i = 0; i < queue.length; i++) {
      if (queue[i]._downloadId === downloadId) { img = queue[i]; break; }
    }
    if (!img) {
      done++;
      busy = false;
      persistQueue();
      notifyOverlay('downloadProgress', {done: done, total: total, failed: failedCount});
      runQueue();
      return;
    }
    var retryCount = img._retries || 0;
    if (retryCount < MAX_RETRIES) {
      img._retries = retryCount + 1;
      delete img._downloadId;
      setTimeout(function() {
        queue.unshift(img);
        queuedUrls[img.src] = true;
        busy = false;
        persistQueue();
        runQueue();
      }, RETRY_DELAY * (retryCount + 1));
    } else {
      failedCount++;
      done++;
      console.warn('[PDL] Download failed after ' + MAX_RETRIES + ' retries:', img.src);
      notifyOverlay('toast', {message: 'Download failed: ' + (img.prompt || 'image'), type: 'error'});
      busy = false;
      persistQueue();
      notifyOverlay('downloadProgress', {done: done, total: total, failed: failedCount});
      runQueue();
    }
  }

  function runQueue() {
    if (busy||!queue.length) return;
    if (!apiAvailable('downloads')) { busy = false; return; }
    busy = true;
    logMemory('runQueue');
    var img = queue.shift();
    delete queuedUrls[img.src];
    var ext = detectExtension(img.src);
    var name = (img.prompt||'image').replace(/[^a-z0-9]/gi,'-').substring(0,50) + '_' + Date.now() + ext;

    function markDownloaded() {
      downloadHistory[img.src] = {timestamp: new Date().toISOString(), prompt: img.prompt || 'image'};
      persistHistory();
    }

    if (img.src.indexOf('data:image') === 0) {
      try {
        var parts = img.src.split(',');
        var mime = parts[0].match(/:(.*?);/)[1];
        var b64 = parts[1];
        var raw = atob(b64);
        var arr = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
        var blob = new Blob([arr], {type: mime});
        var url = URL.createObjectURL(blob);
        api.downloads.download({url:url,filename:folderName+'/'+name,saveAs:false}, function(id) {
          setTimeout(function(){URL.revokeObjectURL(url)},10000);
          if (api.runtime.lastError) {
            busy = false;
            failedCount++;
            done++;
            persistQueue();
            notifyOverlay('toast', {message: 'Download failed: ' + (img.prompt || 'image'), type: 'error'});
            notifyOverlay('downloadProgress', {done: done, total: total, failed: failedCount});
            runQueue();
            return;
          }
          img._downloadId = id;
          markDownloaded();
          persistQueue();
        });
      } catch(e) {
        console.warn('[PDL] Blob conversion failed:', e);
        busy = false;
        failedCount++;
        done++;
        persistQueue();
        notifyOverlay('toast', {message: 'Blob conversion failed', type: 'error'});
        notifyOverlay('downloadProgress', {done: done, total: total, failed: failedCount});
        runQueue();
      }
    } else {
      api.downloads.download({url:img.src,filename:folderName+'/'+name,saveAs:false}, function(id) {
        if (api.runtime.lastError) {
          busy = false;
          failedCount++;
          done++;
          persistQueue();
          notifyOverlay('toast', {message: 'Download failed: ' + (img.prompt || 'image'), type: 'error'});
          notifyOverlay('downloadProgress', {done: done, total: total, failed: failedCount});
          runQueue();
          return;
        }
        img._downloadId = id;
        markDownloaded();
        persistQueue();
      });
    }
  }
})();

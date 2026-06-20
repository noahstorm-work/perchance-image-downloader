(function() {
  'use strict';

  var s = self.__pdl;
  var api = s.api;
  var SCHEMA_VERSION = s.SCHEMA_VERSION;
  var MAX_QUEUE_SIZE = s.MAX_QUEUE_SIZE;
  var MAX_RETRIES = s.MAX_RETRIES;
  var RETRY_DELAY = s.RETRY_DELAY;
  var CONTEXT_MENU_DEBOUNCE = s.CONTEXT_MENU_DEBOUNCE;
  var detectExtension = s.detectExtension;
  var sanitizeFilename = s.sanitizeFilename;

  var folderName = 'Perchance Downloads';
  var downloadHistory = {};
  var lastContextClick = 0;
  var activeTabId = null;
  var downloadListenerRegistered = false;
  var currentDownloading = null;

  var queueState = {
    queue: [],
    busy: false,
    total: 0,
    done: 0,
    failed: 0,
    queuedUrls: {},
    enqueue: function(img) {
      if (this.queuedUrls[img.src]) return false;
      if (this.queue.length >= MAX_QUEUE_SIZE) return false;
      this.queue.push(img);
      this.queuedUrls[img.src] = true;
      this.total++;
      return true;
    },
    dequeue: function() {
      if (!this.queue.length) return null;
      var img = this.queue.shift();
      delete this.queuedUrls[img.src];
      return img;
    },
    clear: function() {
      this.queue = [];
      this.queuedUrls = {};
      this.total = 0;
      this.done = 0;
      this.failed = 0;
      this.busy = false;
    },
    isDuplicate: function(src) {
      return this.queuedUrls[src] || false;
    },
    unshift: function(img) {
      if (this.queue.length >= MAX_QUEUE_SIZE) return;
      this.queue.unshift(img);
      this.queuedUrls[img.src] = true;
    }
  };

  function registerDownloadListener() {
    if (downloadListenerRegistered) return;
    downloadListenerRegistered = true;
    api.downloads.onChanged.addListener(function(delta) {
      if (!delta.state) return;
      if (delta.state.current === 'complete') {
        advanceQueue();
      } else if (delta.state.current === 'interrupted') {
        handleDownloadFailure(delta.id);
      }
    });
    if (queueState.busy && queueState.queue.length) {
      queueState.busy = false;
      runQueue();
    }
  }

  function handleDownloadError(img, errorMsg) {
    currentDownloading = null;
    queueState.busy = false;
    queueState.failed++;
    queueState.done++;
    notifyOverlay('toast', {message: (errorMsg || 'Download failed') + ': ' + (img.prompt || 'image'), type: 'error'});
    persistQueue();
    notifyOverlay('downloadProgress', {done: queueState.done, total: queueState.total, failed: queueState.failed});
    runQueue();
  }

  function createContextMenu() {
    try {
      api.contextMenus.create({
        id: 'pdl-ctx',
        title: 'Download with Perchance Downloader',
        contexts: ['image'],
        documentUrlPatterns: ['https://*.perchance.org/*'],
        icons: { '48': 'icons/icon-48.png' }
      });
    } catch(e) { /* expected: menu may already exist */ }
  }

  function advanceQueue() {
    currentDownloading = null;
    queueState.done++;
    queueState.busy = false;
    persistQueue();
    notifyOverlay('downloadProgress', {done: queueState.done, total: queueState.total, failed: queueState.failed});
    notifyOverlay('toast', {message: 'Downloaded ' + queueState.done + '/' + queueState.total + (queueState.failed ? ' (' + queueState.failed + ' failed)' : ''), type: 'success'});
    runQueue();
  }

  function afterDownload(id, img) {
    markDownloaded(img);
    persistQueue();
  }

  function migrateStorage(callback) {
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
    if (!api.storage.session) return;
    try {
      api.storage.session.set({
        pdlQueue: queueState.queue,
        pdlQueuedUrls: queueState.queuedUrls,
        pdlTotal: queueState.total,
        pdlDone: queueState.done,
        pdlFailed: queueState.failed
      });
    } catch(e) { /* expected: storage may be unavailable */ }
  }

  function persistHistory() {
    try { api.storage.local.set({pdlDownloadHistory: downloadHistory}); } catch(e) { /* expected: storage may be unavailable */ }
  }

  function markDownloaded(img) {
    downloadHistory[img.src] = {timestamp: new Date().toISOString(), prompt: img.prompt || 'image'};
    persistHistory();
  }

  function restoreQueue(callback) {
    if (!api.storage.session) { callback(); return; }
    try {
      api.storage.session.get(['pdlQueue', 'pdlQueuedUrls', 'pdlTotal', 'pdlDone', 'pdlFailed'], function(r) {
        if (api.runtime.lastError) { callback(); return; }
        if (r.pdlQueue && r.pdlQueue.length) {
          queueState.queue = r.pdlQueue;
          queueState.queuedUrls = r.pdlQueuedUrls || {};
          queueState.total = r.pdlTotal || 0;
          queueState.done = r.pdlDone || 0;
          queueState.failed = r.pdlFailed || 0;
        }
        callback();
      });
    } catch(e) { callback(); }
  }

  function buildFilename(img) {
    return sanitizeFilename(img.prompt) + '_' + Date.now() + detectExtension(img.src);
  }

  function downloadDataUri(img, name) {
    var parts = img.src.split(',');
    var mime = parts[0].match(/:(.*?);/)[1];
    var b64 = parts[1];
    var raw = atob(b64);
    var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    var blob = new Blob([arr], {type: mime});
    var url = URL.createObjectURL(blob);
    api.downloads.download({url: url, filename: folderName + '/' + name, saveAs: false}, function(id) {
      setTimeout(function() { URL.revokeObjectURL(url); }, 10000);
      if (api.runtime.lastError) {
        handleDownloadError(img, 'Download failed');
        return;
      }
      img._downloadId = id;
      afterDownload(id, img);
    });
  }

  function downloadUrl(img, name) {
    api.downloads.download({url: img.src, filename: folderName + '/' + name, saveAs: false}, function(id) {
      if (api.runtime.lastError) {
        handleDownloadError(img, 'Download failed');
        return;
      }
      img._downloadId = id;
      afterDownload(id, img);
    });
  }

  function runQueue() {
    if (queueState.busy || !queueState.queue.length) return;
    queueState.busy = true;
    var img = queueState.dequeue();
    var name = buildFilename(img);
    notifyOverlay('toast', {message: 'Downloading (' + (queueState.done + 1) + '/' + queueState.total + ')...', type: 'info'});

    try {
      currentDownloading = img;
      if (img.src.indexOf('data:image') === 0) {
        downloadDataUri(img, name);
      } else {
        downloadUrl(img, name);
      }
    } catch(e) {
      currentDownloading = null;
      handleDownloadError(img, e.message);
    }
  }

  function handleDownloadFailure(downloadId) {
    var img = null;
    if (currentDownloading && currentDownloading._downloadId === downloadId) {
      img = currentDownloading;
      currentDownloading = null;
    }
    if (!img) {
      for (var i = 0; i < queueState.queue.length; i++) {
        if (queueState.queue[i]._downloadId === downloadId) { img = queueState.queue[i]; break; }
      }
    }
    if (!img) {
      advanceQueue();
      return;
    }
    var retryCount = img._retries || 0;
    if (retryCount < MAX_RETRIES) {
      img._retries = retryCount + 1;
      delete img._downloadId;
      setTimeout(function() {
        queueState.unshift(img);
        queueState.busy = false;
        persistQueue();
        runQueue();
      }, RETRY_DELAY * (retryCount + 1));
    } else {
      handleDownloadError(img, 'Download failed after ' + MAX_RETRIES + ' retries');
    }
  }

  function updateBadge(tabId, count) {
    var text = count > 0 ? String(count) : '';
    api.action.setBadgeText({text: text, tabId: tabId});
    api.action.setBadgeBackgroundColor({color: '#e94560', tabId: tabId});
  }

  function notifyOverlay(type, data) {
    if (!activeTabId) return;
    try {
      api.tabs.sendMessage(activeTabId, {type: type, data: data});
    } catch(e) { /* expected: tab may have navigated */ }
  }

  function handleImageCount(msg, sender) {
    var countTabId = sender.tab ? sender.tab.id : null;
    if (!countTabId) {
      api.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs && tabs[0]) updateBadge(tabs[0].id, msg.count);
      });
    } else {
      updateBadge(countTabId, msg.count);
    }
    return undefined;
  }

  function handleRefreshImages(msg, sender, sendResponse) {
    var refreshTabId = sender.tab ? sender.tab.id : null;
    if (sender.tab) activeTabId = sender.tab.id;
    if (!refreshTabId) {
      api.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs && tabs[0]) refreshTabId = tabs[0].id;
        doRefresh(refreshTabId, sendResponse);
      });
      return true;
    }
    doRefresh(refreshTabId, sendResponse);
    return true;
  }

  function handleDownloadImages(msg, sender, sendResponse) {
    if (sender.tab) activeTabId = sender.tab.id;
    registerDownloadListener();
    createContextMenu();
    var added = 0;
    var skipped = 0;
    msg.images.forEach(function(img) {
      if (queueState.isDuplicate(img.src)) { skipped++; return; }
      if (downloadHistory[img.src]) { skipped++; return; }
      if (queueState.enqueue(img)) {
        added++;
      }
    });
    if (added > 0) {
      notifyOverlay('toast', {message: 'Added ' + added + ' to download queue', type: 'success'});
    } else if (skipped > 0) {
      notifyOverlay('toast', {message: skipped + ' already downloaded or queued', type: 'info'});
    }
    persistQueue();
    if (!queueState.busy) runQueue();
    sendResponse({ok: 1, added: added, queueSize: queueState.queue.length, limit: MAX_QUEUE_SIZE});
    return true;
  }

  function handleGetProgress(msg, sender, sendResponse) {
    sendResponse({done: queueState.done, total: queueState.total, busy: queueState.busy, failed: queueState.failed, queueLen: queueState.queue.length});
    return undefined;
  }

  function handleGetHistory(msg, sender, sendResponse) {
    sendResponse({history: downloadHistory});
    return undefined;
  }

  function handleClearQueue(msg, sender, sendResponse) {
    queueState.clear();
    persistQueue();
    sendResponse({ok: 1});
    return undefined;
  }

  var handlers = {
    imageCount: handleImageCount,
    refreshImages: handleRefreshImages,
    downloadImages: handleDownloadImages,
    getProgress: handleGetProgress,
    getHistory: handleGetHistory,
    clearQueue: handleClearQueue
  };

  function handleMessage(msg, sender, sendResponse) {
    var handler = handlers[msg.type];
    if (handler) return handler(msg, sender, sendResponse);
    return undefined;
  }

  function doRefresh(tabId, sendResponse) {
    if (!tabId) { sendResponse({images: []}); return; }
    api.webNavigation.getAllFrames({tabId: tabId}, function(frames) {
      if (api.runtime.lastError || !frames || !frames.length) { sendResponse({images: []}); return; }
      var all = [];
      var left = frames.length;
      frames.forEach(function(f) {
        api.tabs.sendMessage(tabId, {type: 'refreshImages'}, {frameId: f.frameId}, function(r) {
          if (!api.runtime.lastError && r && r.images) all = all.concat(r.images);
          left--;
          if (left === 0) {
            var seen = {};
            var uniq = [];
            all.forEach(function(i) { if (!seen[i.src]) { seen[i.src] = 1; uniq.push(i); } });
            updateBadge(tabId, uniq.length);
            sendResponse({images: uniq});
          }
        });
      });
    });
  }

  function init() {
    api.tabs.onUpdated.addListener(function(tabId, changeInfo) {
      if (changeInfo.status === 'loading') updateBadge(tabId, '');
    });
    api.tabs.onRemoved.addListener(function(tabId) {
      updateBadge(tabId, '');
    });

    api.action.onClicked.addListener(function(tab) {
      activeTabId = tab.id;
      api.tabs.sendMessage(tab.id, {type: 'toggleOverlay'}, function(r) {
        if (api.runtime.lastError) { /* expected: content script not loaded */ }
      });
    });

    registerDownloadListener();

    createContextMenu();
    api.contextMenus.onClicked.addListener(function(info) {
      if (info.menuItemId !== 'pdl-ctx' || !info.srcUrl) return;
      var now = Date.now();
      if (now - lastContextClick < CONTEXT_MENU_DEBOUNCE) return;
      lastContextClick = now;
      registerDownloadListener();
      var ctxImg = {
        id: 'ctx' + Date.now(),
        src: info.srcUrl,
        prompt: 'context-download',
        timestamp: new Date().toISOString()
      };
      if (queueState.enqueue(ctxImg)) {
        persistQueue();
        if (!queueState.busy) runQueue();
      }
    });

    if (api.commands && api.commands.onCommand) {
      api.commands.onCommand.addListener(function(command) {
        if (command === 'download-all') {
          if (activeTabId) {
            api.tabs.sendMessage(activeTabId, {type: 'downloadAll'});
          }
        }
      });
    }
  }

  api.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    return handleMessage(msg, sender, sendResponse);
  });

  migrateStorage(function() {
    api.storage.local.get('settings', function(r) {
      if (api.runtime.lastError) return;
      if (r.settings && r.settings.folder) folderName = r.settings.folder;
    });
    api.storage.onChanged.addListener(function(c) {
      if (c.settings && c.settings.newValue && c.settings.newValue.folder) folderName = c.settings.newValue.folder;
    });
    restoreQueue(function() {
      if (queueState.queue.length && !queueState.busy) {
        runQueue();
      }
      init();
    });
  });
})();

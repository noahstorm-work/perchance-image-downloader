(function() {
  var queue = [];
  var busy = false;
  var total = 0;
  var done = 0;
  var folderName = 'Perchance Downloads';

  chrome.storage.local.get('settings', function(r) { if (r.settings && r.settings.folder) folderName = r.settings.folder; });
  chrome.storage.onChanged.addListener(function(c) { if (c.settings && c.settings.newValue && c.settings.newValue.folder) folderName = c.settings.newValue.folder; });

  function updateBadge(tabId, count) {
    var text = count > 0 ? String(count) : '';
    chrome.browserAction.setBadgeText({text: text, tabId: tabId});
    chrome.browserAction.setBadgeBackgroundColor({color: '#e94560', tabId: tabId});
  }

  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo) {
    if (changeInfo.status === 'loading') updateBadge(tabId, '');
  });

  chrome.tabs.onRemoved.addListener(function(tabId) {
    updateBadge(tabId, '');
  });

  chrome.browserAction.onClicked.addListener(function(tab) {
    chrome.tabs.sendMessage(tab.id, {type:'toggleOverlay'}, function(r) {
      if (chrome.runtime.lastError) console.log('[PDL] no content script');
    });
  });

  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (msg.type === 'imageCount') {
      var tabId = sender.tab ? sender.tab.id : null;
      if (!tabId) {
        chrome.tabs.query({active:true,currentWindow:true}, function(tabs) {
          if (tabs && tabs[0]) updateBadge(tabs[0].id, msg.count);
        });
      } else {
        updateBadge(tabId, msg.count);
      }
      return;
    }
    if (msg.type === 'refreshImages') {
      var tabId = sender.tab ? sender.tab.id : null;
      if (!tabId) {
        chrome.tabs.query({active:true,currentWindow:true}, function(tabs) {
          if (tabs && tabs[0]) tabId = tabs[0].id;
          doRefresh(tabId, sendResponse);
        });
        return true;
      }
      doRefresh(tabId, sendResponse);
      return true;
    }
    if (msg.type === 'downloadImages') {
      msg.images.forEach(function(i){queue.push(i)});
      total += msg.images.length;
      if (!busy) runQueue();
      sendResponse({ok:1});
    }
    if (msg.type === 'getProgress') {
      sendResponse({done:done, total:total, busy:busy});
    }
    return true;
  });

  function doRefresh(tabId, sendResponse) {
    if (!tabId) { sendResponse({images:[]}); return; }
    chrome.webNavigation.getAllFrames({tabId:tabId}, function(frames) {
      if (chrome.runtime.lastError || !frames || !frames.length) { sendResponse({images:[]}); return; }
      var all = [];
      var left = frames.length;
      frames.forEach(function(f) {
        chrome.tabs.sendMessage(tabId, {type:'refreshImages'}, {frameId:f.frameId}, function(r) {
          if (!chrome.runtime.lastError && r && r.images) all = all.concat(r.images);
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

  function runQueue() {
    if (busy||!queue.length) return;
    busy = true;
    var img = queue.shift();
    var name = (img.prompt||'image').replace(/[^a-z0-9]/gi,'-').substring(0,50) + '_' + Date.now() + '.jpg';

    function finish(success) {
      done++;
      if (!success) console.warn('[PDL] Download failed:', img.src);
      busy = false;
      runQueue();
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
        chrome.downloads.download({url:url,filename:folderName+'/'+name,saveAs:false}, function(id) {
          setTimeout(function(){URL.revokeObjectURL(url)},10000);
          if (chrome.runtime.lastError) { finish(false); return; }
          finish(true);
        });
      } catch(e) {
        console.warn('[PDL] Blob conversion failed:', e);
        finish(false);
      }
    } else {
      chrome.downloads.download({url:img.src,filename:folderName+'/'+name,saveAs:false}, function(id) {
        if (chrome.runtime.lastError) { finish(false); return; }
        finish(true);
      });
    }
  }

  chrome.contextMenus.create({
    id: 'pdl-ctx',
    title: 'Download with Perchance Downloader',
    contexts: ['image'],
    documentUrlPatterns: ['https://*.perchance.org/*'],
    icons: { '48': 'icons/icon-48.png' }
  });

  chrome.contextMenus.onClicked.addListener(function(info) {
    if (info.menuItemId === 'pdl-ctx' && info.srcUrl) {
      queue.push({
        id: 'ctx' + Date.now(),
        src: info.srcUrl,
        prompt: 'context-download',
        timestamp: new Date().toISOString()
      });
      if (!busy) runQueue();
    }
  });
})();

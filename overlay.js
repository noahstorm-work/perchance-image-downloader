(function() {
  if (window !== window.top) return;
  if (window.__pdlLoaded) return;
  window.__pdlLoaded = true;

  var api = typeof browser !== 'undefined' ? browser : chrome;

  var VISIBLE_BUFFER = 3;
  var CARD_SIZE_MIN = 80;
  var CARD_SIZE_MAX = 400;

  var MSG = {
    selectAll: 'Select All',
    deselectAll: 'Deselect All',
    refresh: 'Refresh',
    scanning: ' Scanning...',
    downloadSelected: ' Download Selected (',
    noImages: 'Click Refresh to scan for images.',
    noImagesFound: 'No images found. Generate then Refresh.',
    preview: 'Preview',
    close: 'Close',
    closePreview: 'Close preview',
    prevImage: 'Previous image',
    nextImage: 'Next image',
    select: 'Select',
    deselect: 'Deselect',
    download: 'Download',
    starting: ' starting...',
    downloading: ' downloading...',
    done: ' done!',
    failed: ' failed)',
    imagesFound: ' image(s) found',
    allComplete: 'All downloads complete',
    downloadsFailed: ' download(s) failed',
    alreadyDownloaded: ' already downloaded or queued',
    exportJson: 'Export JSON',
    exportCsv: 'Export CSV',
    searchPlaceholder: 'Filter by prompt...',
    previewLabel: 'Preview:',
    folderLabel: 'Folder:',
    selected: ' selected',
    imageLabel: 'Image: '
  };

  var visible = false;
  var el = null;
  var imgs = [];
  var filteredImgs = [];
  var sel = {};
  var progressInterval = null;
  var folderName = 'Perchance Downloads';
  var theme = 'dark';
  var previewSize = 180;
  var lightboxImg = null;
  var prevFocus = null;
  var keydownHandler = null;
  var galleryKeyHandler = null;
  var iconCache = {};
  var observer = null;
  var renderedCards = {};
  var searchQuery = '';

  function loadIcon(name) {
    if (iconCache[name]) return iconCache[name];
    try {
      var url = api.runtime.getURL('icons/svg/' + name + '.svg');
      iconCache[name] = '<img src="' + url + '" alt="" style="pointer-events:none">';
      return iconCache[name];
    } catch(e) { return ''; }
  }

  function esc(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function injectStyles() {
    if (document.getElementById('pdl-css')) return;
    var link = document.createElement('link');
    link.id = 'pdl-css';
    link.rel = 'stylesheet';
    link.href = api.runtime.getURL('overlay.css');
    document.head.appendChild(link);
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

  function showToast(message, type) {
    if (!el) return;
    var existing = el.querySelector('.pdl-toast');
    if (existing) existing.remove();
    var t = document.createElement('div');
    t.className = 'pdl-toast pdl-toast-' + (type || 'info');
    t.textContent = message;
    el.appendChild(t);
    setTimeout(function() { t.classList.add('pdl-toast-hide'); }, 2500);
    setTimeout(function() { if (t.parentNode) t.remove(); }, 3000);
  }

  function open() {
    if (!el) create();
    prevFocus = document.activeElement;
    visible = true;
    el.classList.remove('pdl-closing');
    el.classList.add('pdl-open', 'pdl-opening');
    applyTheme();
    loadFolder();
    load();
    setTimeout(function() { var b = el.querySelector('#pdl-x'); if (b) b.focus(); }, 100);
  }

  function close() {
    if (!el) return;
    visible = false;
    el.classList.remove('pdl-opening');
    el.classList.add('pdl-closing');
    closeLightbox();
    setTimeout(function() {
      el.classList.remove('pdl-open', 'pdl-closing');
      try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch(e) {}
    }, 150);
    if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
    removeKeydownHandler();
    removeGalleryKeyHandler();
    disconnectObserver();
  }

  function applyTheme() {
    if (!el) return;
    if (theme === 'light') {
      el.classList.add('pdl-light');
      el.querySelector('#pdl-theme-btn').innerHTML = loadIcon('sun');
    } else {
      el.classList.remove('pdl-light');
      el.querySelector('#pdl-theme-btn').innerHTML = loadIcon('moon');
    }
  }

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    try { api.storage.local.set({pdlTheme: theme}); } catch(e) {}
    applyTheme();
  }

  function loadFolder() {
    try {
      api.storage.local.get('settings', function(r) {
        if (api.runtime.lastError) return;
        if (r.settings && r.settings.folder) {
          folderName = r.settings.folder;
          if (el) {
            var inp = el.querySelector('#pdl-folder');
            if (inp) inp.value = folderName;
          }
        }
      });
    } catch(e) {}
  }

  function loadSettings(callback) {
    try {
      api.storage.local.get(['pdlTheme', 'pdlPreviewSize', 'settings', 'pdlSchemaVersion'], function(r) {
        if (api.runtime.lastError) { callback(); return; }
        if (r.pdlTheme) theme = r.pdlTheme;
        if (r.pdlPreviewSize) previewSize = parseInt(r.pdlPreviewSize, 10) || 180;
        if (r.settings && r.settings.folder) folderName = r.settings.folder;
        callback();
      });
    } catch(e) { callback(); }
  }

  function create() {
    injectStyles();
    el = document.createElement('div');
    el.id = 'pdl';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Perchance Image Downloader');

    var html = '';
    html += '<div class="pdl-backdrop" tabindex="-1"></div>';
    html += '<div class="pdl-panel">';
    html += '<div class="pdl-header">';
    html += '<span class="pdl-title">Perchance Image Downloader</span>';
    html += '<div class="pdl-header-actions">';
    html += '<button id="pdl-theme-btn" class="pdl-icon-btn" aria-label="Toggle theme" title="Toggle theme"></button>';
    html += '<button id="pdl-x" class="pdl-icon-btn" aria-label="' + MSG.close + '" title="' + MSG.close + ' (Escape)" aria-keyshortcuts="Escape">' + loadIcon('close') + '</button>';
    html += '</div></div>';
    html += '<div class="pdl-toolbar">';
    html += '<button id="pdl-sa" class="pdl-btn">' + MSG.selectAll + '</button>';
    html += '<button id="pdl-da" class="pdl-btn">' + MSG.deselectAll + '</button>';
    html += '<button id="pdl-rf" class="pdl-btn pdl-btn-accent">' + loadIcon('refresh') + ' ' + MSG.refresh + '</button>';
    html += '<div class="pdl-spacer"></div>';
    html += '<input type="text" id="pdl-search" class="pdl-search" placeholder="' + MSG.searchPlaceholder + '" aria-label="Filter images by prompt">';
    html += '<button id="pdl-export" class="pdl-btn" title="Export selected">' + loadIcon('download') + ' Export</button>';
    html += '<button id="pdl-dl" class="pdl-btn pdl-btn-green" disabled>' + loadIcon('download') + MSG.downloadSelected + '0)</button>';
    html += '</div>';
    html += '<div class="pdl-filters">';
    html += '<div class="pdl-filter-group">';
    html += '<label>' + MSG.previewLabel + '</label>';
    html += '<input type="range" id="pdl-sl" min="' + CARD_SIZE_MIN + '" max="' + CARD_SIZE_MAX + '" value="' + previewSize + '">';
    html += '<span id="pdl-sl-lb" class="pdl-filter-val">' + previewSize + 'px</span>';
    html += '</div>';
    html += '<div class="pdl-filter-group">';
    html += '<label>' + MSG.folderLabel + '</label>';
    html += '<input type="text" id="pdl-folder" value="' + esc(folderName) + '" style="width:160px" aria-label="Download folder name">';
    html += '</div>';
    html += '</div>';
    html += '<div id="pdl-gal" class="pdl-gallery" role="grid" aria-label="Image gallery"><div class="pdl-empty">' + MSG.noImages + '</div></div>';
    html += '<div id="pdl-prog" class="pdl-progress">';
    html += '<div class="pdl-pbar"><div id="pdl-pf" class="pdl-pfill"></div></div>';
    html += '<div id="pdl-pt" class="pdl-ptext"></div>';
    html += '</div>';
    html += '<div class="pdl-footer"><span id="pdl-st">0/0' + MSG.selected + '</span></div>';
    html += '</div>';

    html += '<div id="pdl-lb" class="pdl-lightbox" role="dialog" aria-label="Image preview">';
    html += '<button id="pdl-lb-x" class="pdl-icon-btn pdl-lightbox-close" aria-label="' + MSG.closePreview + '" aria-keyshortcuts="Escape">' + loadIcon('close') + '</button>';
    html += '<button id="pdl-lb-prev" class="pdl-lightbox-nav pdl-lightbox-prev" aria-label="' + MSG.prevImage + '" aria-keyshortcuts="ArrowLeft">' + loadIcon('chevron-left') + '</button>';
    html += '<button id="pdl-lb-next" class="pdl-lightbox-nav pdl-lightbox-next" aria-label="' + MSG.nextImage + '" aria-keyshortcuts="ArrowRight">' + loadIcon('chevron-right') + '</button>';
    html += '<img id="pdl-lb-img" class="pdl-lightbox-img" src="" alt="Preview">';
    html += '<div id="pdl-lb-info" class="pdl-lightbox-info"></div>';
    html += '<div class="pdl-lightbox-actions">';
    html += '<button id="pdl-lb-sel" class="pdl-btn">' + loadIcon('check') + ' <span id="pdl-lb-sel-text">' + MSG.select + '</span></button>';
    html += '<button id="pdl-lb-dl" class="pdl-btn pdl-btn-green">' + loadIcon('download') + ' ' + MSG.download + '</button>';
    html += '</div></div>';

    el.innerHTML = html;
    document.documentElement.appendChild(el);
    bindEvents();
  }

  function bindEvents() {
    el.querySelector('#pdl-x').onclick = close;
    el.querySelector('.pdl-backdrop').onclick = close;
    el.querySelector('#pdl-theme-btn').onclick = toggleTheme;
    el.querySelector('#pdl-sa').onclick = function() { filteredImgs.forEach(function(i){sel[i.id]=1}); render(); };
    el.querySelector('#pdl-da').onclick = function() { sel = {}; render(); };
    el.querySelector('#pdl-rf').onclick = load;
    el.querySelector('#pdl-dl').onclick = download;
    el.querySelector('#pdl-export').onclick = exportSelected;

    el.querySelector('#pdl-search').oninput = function() {
      searchQuery = this.value.trim().toLowerCase();
      applyFilter();
      render();
    };

    el.querySelector('#pdl-sl').oninput = function() {
      previewSize = parseInt(this.value, 10);
      el.querySelector('#pdl-sl-lb').textContent = previewSize + 'px';
      try { api.storage.local.set({pdlPreviewSize: previewSize}); } catch(e) {}
      render();
    };

    el.querySelector('#pdl-folder').onchange = function() {
      folderName = this.value.trim() || 'Perchance Downloads';
      try {
        api.storage.local.get('settings', function(r) {
          if (api.runtime.lastError) return;
          var s = r.settings || {};
          s.folder = folderName;
          api.storage.local.set({settings: s});
        });
      } catch(e) {}
    };

    keydownHandler = function(e) {
      if (!visible) return;
      if (e.key === 'Escape') {
        if (el.querySelector('#pdl-lb').classList.contains('pdl-open')) closeLightbox();
        else close();
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', keydownHandler);

    galleryKeyHandler = function(e) {
      if (!visible) return;
      var gallery = el.querySelector('#pdl-gal');
      if (!gallery || !gallery.contains(document.activeElement)) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        navigateCard(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        navigateCard(-1);
      } else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        var card = document.activeElement;
        var id = card.getAttribute('data-id');
        if (id) {
          var img = filteredImgs.find(function(i){return i.id===id});
          if (img) openLightbox(img);
        }
      }
    };
    document.addEventListener('keydown', galleryKeyHandler);

    el.querySelector('#pdl-lb-x').onclick = closeLightbox;
    el.querySelector('#pdl-lb').onclick = function(e) {
      if (e.target === el.querySelector('#pdl-lb')) closeLightbox();
    };
    el.querySelector('#pdl-lb-prev').onclick = function() { navigateLightbox(-1); };
    el.querySelector('#pdl-lb-next').onclick = function() { navigateLightbox(1); };
    el.querySelector('#pdl-lb-sel').onclick = function() {
      if (!lightboxImg) return;
      toggleSelect(lightboxImg.id);
      var selBtn = el.querySelector('#pdl-lb-sel');
      var selText = el.querySelector('#pdl-lb-sel-text');
      if (sel[lightboxImg.id]) { selBtn.classList.add('pdl-btn-accent'); selText.textContent = MSG.deselect; }
      else { selBtn.classList.remove('pdl-btn-accent'); selText.textContent = MSG.select; }
    };
    el.querySelector('#pdl-lb-dl').onclick = function() {
      if (lightboxImg) {
        try { api.runtime.sendMessage({type:'downloadImages', images:[lightboxImg]}); } catch(e) {}
      }
    };
  }

  function removeKeydownHandler() {
    if (keydownHandler) {
      document.removeEventListener('keydown', keydownHandler);
      keydownHandler = null;
    }
  }

  function removeGalleryKeyHandler() {
    if (galleryKeyHandler) {
      document.removeEventListener('keydown', galleryKeyHandler);
      galleryKeyHandler = null;
    }
  }

  function navigateCard(dir) {
    var cards = el.querySelectorAll('#pdl-gal .pdl-card:not(.pdl-placeholder)');
    if (!cards.length) return;
    var current = -1;
    for (var i = 0; i < cards.length; i++) {
      if (cards[i] === document.activeElement) { current = i; break; }
    }
    var next = current + dir;
    if (next < 0) next = cards.length - 1;
    if (next >= cards.length) next = 0;
    cards[next].focus();
  }

  function openLightbox(img) {
    lightboxImg = img;
    el.querySelector('#pdl-lb-img').src = img.src;
    el.querySelector('#pdl-lb-info').textContent = img.prompt || '';
    var selBtn = el.querySelector('#pdl-lb-sel');
    var selText = el.querySelector('#pdl-lb-sel-text');
    if (sel[img.id]) { selBtn.classList.add('pdl-btn-accent'); selText.textContent = MSG.deselect; }
    else { selBtn.classList.remove('pdl-btn-accent'); selText.textContent = MSG.select; }
    el.querySelector('#pdl-lb').classList.add('pdl-open');
  }

  function closeLightbox() {
    lightboxImg = null;
    el.querySelector('#pdl-lb').classList.remove('pdl-open');
  }

  function navigateLightbox(dir) {
    if (!lightboxImg) return;
    var idx = -1;
    for (var i = 0; i < filteredImgs.length; i++) {
      if (filteredImgs[i].id === lightboxImg.id) { idx = i; break; }
    }
    if (idx === -1) return;
    var next = idx + dir;
    if (next < 0) next = filteredImgs.length - 1;
    if (next >= filteredImgs.length) next = 0;
    openLightbox(filteredImgs[next]);
  }

  function applyFilter() {
    if (!searchQuery) { filteredImgs = imgs.slice(); return; }
    filteredImgs = imgs.filter(function(img) {
      return (img.prompt || '').toLowerCase().indexOf(searchQuery) !== -1;
    });
  }

  function load() {
    try {
      var btn = el.querySelector('#pdl-rf');
      btn.innerHTML = loadIcon('refresh') + MSG.scanning;
      btn.disabled = true;
      api.runtime.sendMessage({type:'refreshImages'}, function(r) {
        btn.innerHTML = loadIcon('refresh') + ' ' + MSG.refresh;
        btn.disabled = false;
        if (api.runtime.lastError) return;
        if (r && r.images) {
          imgs = r.images;
          sel = {};
          imgs.forEach(function(i) { sel[i.id] = 1; });
          applyFilter();
          render();
          showToast(imgs.length + MSG.imagesFound, 'success');
          logMemory('load');
        }
      });
    } catch(e) {
      if (el) {
        var errBtn = el.querySelector('#pdl-rf');
        if (errBtn) { errBtn.innerHTML = loadIcon('refresh') + ' ' + MSG.refresh; errBtn.disabled = false; }
      }
      showToast('Scan failed', 'error');
    }
  }

  function disconnectObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    renderedCards = {};
  }

  function renderCard(img) {
    if (renderedCards[img.id]) return renderedCards[img.id];
    var c = document.createElement('div');
    c.className = 'pdl-card' + (sel[img.id] ? ' pdl-selected' : '');
    c.style.width = previewSize + 'px';
    c.style.height = previewSize + 'px';
    c.setAttribute('data-id', img.id);
    c.setAttribute('role', 'gridcell');
    c.setAttribute('tabindex', '0');
    c.setAttribute('aria-label', MSG.imageLabel + (img.prompt || 'unknown'));

    var checkDiv = document.createElement('div');
    checkDiv.className = 'pdl-check';
    checkDiv.textContent = sel[img.id] ? '\u2713' : '';

    var imgEl = document.createElement('img');
    imgEl.setAttribute('loading', 'lazy');
    imgEl.src = img.src;

    var expandDiv = document.createElement('div');
    expandDiv.className = 'pdl-expand';
    expandDiv.setAttribute('title', MSG.preview);
    expandDiv.innerHTML = loadIcon('expand');

    c.appendChild(checkDiv);
    c.appendChild(imgEl);
    c.appendChild(expandDiv);

    c.onclick = function(e) {
      if (e.target.closest('.pdl-expand')) { openLightbox(img); return; }
      toggleSelect(img.id);
    };
    c.onkeydown = function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSelect(img.id); }
      if (e.key === 'Enter' && e.shiftKey) { openLightbox(img); }
    };
    renderedCards[img.id] = c;
    return c;
  }

  function render() {
    try {
      var g = el.querySelector('#pdl-gal');
      disconnectObserver();
      if (!filteredImgs.length) {
        g.innerHTML = '<div class="pdl-empty">' + (imgs.length ? MSG.noImagesFound : MSG.noImages) + '</div>';
        upd();
        return;
      }
      g.innerHTML = '';

      if (filteredImgs.length <= 50) {
        filteredImgs.forEach(function(img) {
          g.appendChild(renderCard(img));
        });
        upd();
        logMemory('render');
        return;
      }

      observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          var idx = parseInt(entry.target.getAttribute('data-idx'), 10);
          if (isNaN(idx)) return;
          if (entry.isIntersecting) {
            var start = Math.max(0, idx - VISIBLE_BUFFER);
            var end = Math.min(filteredImgs.length, idx + VISIBLE_BUFFER + 1);
            for (var i = start; i < end; i++) {
              var card = renderCard(filteredImgs[i]);
              if (!card.parentNode) {
                var placeholder = g.querySelector('[data-idx="' + i + '"]');
                if (placeholder) placeholder.replaceWith(card);
              }
            }
          }
        });
      }, {root: g, rootMargin: '100px'});

      for (var i = 0; i < filteredImgs.length; i++) {
        var placeholder = document.createElement('div');
        placeholder.className = 'pdl-card pdl-placeholder';
        placeholder.style.width = previewSize + 'px';
        placeholder.style.height = previewSize + 'px';
        placeholder.setAttribute('data-idx', i);
        placeholder.setAttribute('role', 'gridcell');
        g.appendChild(placeholder);
        observer.observe(placeholder);
      }
      upd();
      logMemory('render');
    } catch(e) {
      showToast('Render failed: ' + e.message, 'error');
    }
  }

  function toggleSelect(id) {
    if (sel[id]) delete sel[id]; else sel[id] = 1;
    var card = el.querySelector('.pdl-card[data-id="' + id + '"]');
    if (card) {
      card.classList.toggle('pdl-selected', !!sel[id]);
      card.querySelector('.pdl-check').textContent = sel[id] ? '\u2713' : '';
    }
    upd();
  }

  function upd() {
    var c = Object.keys(sel).length;
    el.querySelector('#pdl-st').textContent = c + '/' + filteredImgs.length + MSG.selected;
    var b = el.querySelector('#pdl-dl');
    b.innerHTML = loadIcon('download') + MSG.downloadSelected + c + ')';
    b.disabled = c === 0;
  }

  function exportSelected() {
    var s = filteredImgs.filter(function(i) { return sel[i.id]; });
    if (!s.length) { showToast('No images selected', 'info'); return; }
    var json = JSON.stringify(s.map(function(i) { return {url: i.src, prompt: i.prompt, timestamp: i.timestamp}; }), null, 2);
    var blob = new Blob([json], {type: 'application/json'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'perchance-images-' + Date.now() + '.json';
    a.click();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    showToast('Exported ' + s.length + ' image(s)', 'success');
  }

  function download() {
    var s = filteredImgs.filter(function(i) { return sel[i.id]; });
    if (!s.length) return;
    try {
      var prog = el.querySelector('#pdl-prog');
      var fill = el.querySelector('#pdl-pf');
      var text = el.querySelector('#pdl-pt');
      prog.classList.add('pdl-show');
      fill.style.width = '0%';
      text.textContent = '0/' + s.length + MSG.starting;
      api.runtime.sendMessage({type:'downloadImages', images:s}, function(r) {
        if (r && r.error === 'permission denied') {
          prog.classList.remove('pdl-show');
          showToast('Download permission denied', 'error');
        }
      });
      var d = 0;
      var total = s.length;
      if (progressInterval) clearInterval(progressInterval);
      progressInterval = setInterval(function() {
        try {
          api.runtime.sendMessage({type:'getProgress'}, function(r) {
            if (api.runtime.lastError) return;
            if (r) {
              d = r.done;
              fill.style.width = ((d / total) * 100) + '%';
              var status = d < total ? MSG.downloading : MSG.done;
              if (r.failed > 0) status += ' (' + r.failed + MSG.failed;
              text.textContent = d + '/' + total + status;
              if (d >= total) {
                clearInterval(progressInterval);
                progressInterval = null;
                if (r.failed > 0) showToast(r.failed + MSG.downloadsFailed, 'error');
                else showToast(MSG.allComplete, 'success');
                setTimeout(function() { prog.classList.remove('pdl-show'); fill.style.width = '0%'; }, 2000);
              }
            }
          });
        } catch(e) {}
      }, 500);
    } catch(e) {
      showToast('Download failed: ' + e.message, 'error');
    }
  }

  window.addEventListener('beforeunload', function() {
    removeKeydownHandler();
    removeGalleryKeyHandler();
    disconnectObserver();
    if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
  });

  loadSettings(function() {
    api.runtime.onMessage.addListener(function(m,s,send){
      if (m.type==='toggleOverlay') { if(visible) close(); else open(); send({ok:1}); }
      if (m.type==='toast' && m.data) { showToast(m.data.message, m.data.type); }
      if (m.type==='downloadProgress' && m.data) {
        var prog = el ? el.querySelector('#pdl-prog') : null;
        if (prog && prog.classList.contains('pdl-show')) {
          var fill = el.querySelector('#pdl-pf');
          var text = el.querySelector('#pdl-pt');
          if (fill) fill.style.width = ((m.data.done / m.data.total) * 100) + '%';
          if (text) {
            var status = m.data.done < m.data.total ? MSG.downloading : MSG.done;
            if (m.data.failed > 0) status += ' (' + m.data.failed + MSG.failed;
            text.textContent = m.data.done + '/' + m.data.total + status;
          }
          if (m.data.done >= m.data.total) {
            setTimeout(function() { prog.classList.remove('pdl-show'); if (fill) fill.style.width = '0%'; }, 2000);
          }
        }
      }
      return true;
    });
  });
})();

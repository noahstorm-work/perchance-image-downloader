(function() {
  'use strict';
  if (window !== window.top) return;
  if (window.__pdlLoaded) return;
  window.__pdlLoaded = true;

  var api = self.__pdl.api;

  var VISIBLE_BUFFER = 3;
  var CARD_SIZE_MIN = 80;
  var CARD_SIZE_MAX = 400;
  var CLOSE_DELAY = 150;
  var TOAST_DELAY = 2500;
  var TOAST_REMOVE = 3000;
  var PROGRESS_HIDE = 2000;
  var FOCUS_DELAY = 100;

  var MSG = {
    selectAll: 'Select All',
    deselectAll: 'Deselect All',
    refresh: 'Refresh',
    scanning: ' Scanning...',
    downloadSelected: ' Download Selected (',
    noImages: 'Click Refresh to scan for images.',
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
    downloaded: ' downloaded',
    imagesFound: ' image(s) found',
    allComplete: 'All downloads complete',
    downloadsFailed: ' download(s) failed',
    previewLabel: 'Preview:',
    folderLabel: 'Folder:',
    selected: ' selected',
    imageLabel: 'Image: '
  };

  var visible = false;
  var el = null;
  var imgs = [];
  var sel = {};
  var progressInterval = null;
  var folderName = 'Perchance Downloads';
  var theme = 'dark';
  var previewSize = 180;
  var lightboxImg = null;
  var prevFocus = null;
  var keydownHandler = null;
  var iconCache = {};
  var observer = null;
  var renderedCards = {};

  var ICONS = {
    close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    sun: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    moon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    expand: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
    download: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    refresh: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    'chevron-left': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    'chevron-right': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    'alert-circle': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
  };

  function loadIcon(name) {
    if (iconCache[name]) return iconCache[name];
    iconCache[name] = ICONS[name] || '';
    return iconCache[name];
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
    link.href = api.runtime.getURL('overlay.css') + '?v=' + Date.now();
    document.head.appendChild(link);
  }

  function updateProgress(d, total, failed) {
    if (!el) return;
    var prog = el.querySelector('#pdl-prog');
    var fill = el.querySelector('#pdl-pf');
    var text = el.querySelector('#pdl-pt');
    if (!prog || !fill || !text) return;
    fill.style.width = ((d / total) * 100) + '%';
    var status = d < total ? MSG.downloading : MSG.done;
    if (failed > 0) status += ' (' + failed + MSG.failed;
    text.textContent = d + '/' + total + status;
    if (d >= total) {
      if (failed > 0) showToast(failed + MSG.downloadsFailed, 'error');
      else showToast(MSG.allComplete, 'success');
      setTimeout(function() { prog.classList.remove('pdl-show'); fill.style.width = '0%'; }, PROGRESS_HIDE);
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
    setTimeout(function() { t.classList.add('pdl-toast-hide'); }, TOAST_DELAY);
    setTimeout(function() { if (t.parentNode) t.remove(); }, TOAST_REMOVE);
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
    setTimeout(function() { var b = el.querySelector('#pdl-x'); if (b) b.focus(); }, FOCUS_DELAY);
  }

  function close() {
    if (!el) return;
    visible = false;
    el.classList.remove('pdl-opening');
    el.classList.add('pdl-closing');
    closeLightbox();
    setTimeout(function() {
      el.classList.remove('pdl-open', 'pdl-closing');
      try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch(e) { /* expected: element may be removed */ }
    }, CLOSE_DELAY);
    if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
    removeKeydownHandler();
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
    try { api.storage.local.set({pdlTheme: theme}); } catch(e) { /* expected: storage may be unavailable */ }
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
    } catch(e) { /* expected: storage may be unavailable */ }
  }

  function loadSettings(callback) {
    try {
      api.storage.local.get(['pdlTheme', 'pdlPreviewSize', 'settings'], function(r) {
        if (api.runtime.lastError) { callback(); return; }
        if (r.pdlTheme) theme = r.pdlTheme;
        if (r.pdlPreviewSize) previewSize = parseInt(r.pdlPreviewSize, 10) || 180;
        if (r.settings && r.settings.folder) folderName = r.settings.folder;
        callback();
      });
    } catch(e) { callback(); }
  }

  function buildHeaderHtml() {
    var h = '';
    h += '<div class="pdl-header">';
    h += '<span class="pdl-title">Perchance Image Downloader</span>';
    h += '<div class="pdl-header-actions">';
    h += '<button id="pdl-theme-btn" class="pdl-icon-btn" aria-label="Toggle theme" title="Toggle theme"></button>';
    h += '<button id="pdl-x" class="pdl-icon-btn" aria-label="' + MSG.close + '" title="' + MSG.close + ' (Escape)" aria-keyshortcuts="Escape">' + loadIcon('close') + '</button>';
    h += '</div></div>';
    return h;
  }

  function buildToolbarHtml() {
    var h = '';
    h += '<div class="pdl-toolbar">';
    h += '<button id="pdl-sa" class="pdl-btn">' + MSG.selectAll + '</button>';
    h += '<button id="pdl-da" class="pdl-btn">' + MSG.deselectAll + '</button>';
    h += '<button id="pdl-rf" class="pdl-btn pdl-btn-accent">' + loadIcon('refresh') + ' ' + MSG.refresh + '</button>';
    h += '<div class="pdl-spacer"></div>';
    h += '<button id="pdl-dl" class="pdl-btn pdl-btn-green" disabled>' + loadIcon('download') + MSG.downloadSelected + '0)</button>';
    h += '</div>';
    h += '<div class="pdl-filters">';
    h += '<div class="pdl-filter-group">';
    h += '<label>' + MSG.previewLabel + '</label>';
    h += '<input type="range" id="pdl-sl" min="' + CARD_SIZE_MIN + '" max="' + CARD_SIZE_MAX + '" value="' + previewSize + '">';
    h += '<span id="pdl-sl-lb" class="pdl-filter-val">' + previewSize + 'px</span>';
    h += '</div>';
    h += '<div class="pdl-filter-group">';
    h += '<label>' + MSG.folderLabel + '</label>';
    h += '<input type="text" id="pdl-folder" value="' + esc(folderName) + '" style="width:160px" aria-label="Download folder name">';
    h += '</div>';
    h += '</div>';
    return h;
  }

  function buildStatusHtml() {
    var h = '';
    h += '<div id="pdl-gal" class="pdl-gallery" role="grid" aria-label="Image gallery"><div class="pdl-empty">' + MSG.noImages + '</div></div>';
    h += '<div id="pdl-prog" class="pdl-progress">';
    h += '<div class="pdl-pbar"><div id="pdl-pf" class="pdl-pfill"></div></div>';
    h += '<div id="pdl-pt" class="pdl-ptext"></div>';
    h += '</div>';
    h += '<div class="pdl-footer"><span id="pdl-st">0/0' + MSG.selected + '</span></div>';
    return h;
  }

  function buildLightboxHtml() {
    var h = '';
    h += '<div id="pdl-lb" class="pdl-lightbox" role="dialog" aria-label="Image preview">';
    h += '<button id="pdl-lb-x" class="pdl-icon-btn pdl-lightbox-close" aria-label="' + MSG.closePreview + '" aria-keyshortcuts="Escape">' + loadIcon('close') + '</button>';
    h += '<button id="pdl-lb-prev" class="pdl-lightbox-nav pdl-lightbox-prev" aria-label="' + MSG.prevImage + '" aria-keyshortcuts="ArrowLeft">' + loadIcon('chevron-left') + '</button>';
    h += '<button id="pdl-lb-next" class="pdl-lightbox-nav pdl-lightbox-next" aria-label="' + MSG.nextImage + '" aria-keyshortcuts="ArrowRight">' + loadIcon('chevron-right') + '</button>';
    h += '<img id="pdl-lb-img" class="pdl-lightbox-img" src="" alt="Preview">';
    h += '<div id="pdl-lb-info" class="pdl-lightbox-info"></div>';
    h += '<div class="pdl-lightbox-actions">';
    h += '<button id="pdl-lb-sel" class="pdl-btn">' + loadIcon('check') + ' <span id="pdl-lb-sel-text">' + MSG.select + '</span></button>';
    h += '<button id="pdl-lb-dl" class="pdl-btn pdl-btn-green">' + loadIcon('download') + ' ' + MSG.download + '</button>';
    h += '</div></div>';
    return h;
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
    html += buildHeaderHtml();
    html += buildToolbarHtml();
    html += buildStatusHtml();
    html += '</div>';
    html += buildLightboxHtml();

    el.innerHTML = html;
    document.documentElement.appendChild(el);
    bindEvents();
  }

  function bindEvents() {
    el.querySelector('#pdl-x').onclick = close;
    el.querySelector('.pdl-backdrop').onclick = close;
    el.querySelector('#pdl-theme-btn').onclick = toggleTheme;
    el.querySelector('#pdl-sa').onclick = function() { imgs.forEach(function(i){sel[i.id]=true}); render(); };
    el.querySelector('#pdl-da').onclick = function() { sel = {}; render(); };
    el.querySelector('#pdl-rf').onclick = load;
    el.querySelector('#pdl-dl').onclick = download;

    el.querySelector('#pdl-sl').oninput = function() {
      previewSize = parseInt(this.value, 10);
      el.querySelector('#pdl-sl-lb').textContent = previewSize + 'px';
      try { api.storage.local.set({pdlPreviewSize: previewSize}); } catch(e) { /* expected: storage may be unavailable */ }
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
      } catch(e) { /* expected: storage may be unavailable */ }
    };

    keydownHandler = function(e) {
      if (!visible) return;
      if (e.key === 'Escape') {
        if (el.querySelector('#pdl-lb').classList.contains('pdl-open')) closeLightbox();
        else close();
        e.stopPropagation();
        return;
      }
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
          var img = imgs.find(function(i){return i.id===id});
          if (img) openLightbox(img);
        }
      }
    };
    document.addEventListener('keydown', keydownHandler);

    el.querySelector('#pdl-lb-x').onclick = closeLightbox;
    el.querySelector('#pdl-lb').onclick = function(e) {
      if (e.target === el.querySelector('#pdl-lb')) closeLightbox();
    };
    el.querySelector('#pdl-lb-prev').onclick = function() { navigateLightbox(-1); };
    el.querySelector('#pdl-lb-next').onclick = function() { navigateLightbox(1); };
    el.querySelector('#pdl-lb-sel').onclick = function() {
      if (!lightboxImg) return;
      toggleSelect(lightboxImg.id);
      updateLightboxBtn();
    };
    el.querySelector('#pdl-lb-dl').onclick = function() {
      if (lightboxImg) {
        try { api.runtime.sendMessage({type:'downloadImages', images:[lightboxImg]}); } catch(e) { /* expected: messaging may fail */ }
      }
    };
  }

  function removeKeydownHandler() {
    if (keydownHandler) {
      document.removeEventListener('keydown', keydownHandler);
      keydownHandler = null;
    }
  }

  function wrapIndex(current, dir, len) {
    var next = current + dir;
    if (next < 0) next = len - 1;
    if (next >= len) next = 0;
    return next;
  }

  function navigateCard(dir) {
    var cards = el.querySelectorAll('#pdl-gal .pdl-card:not(.pdl-placeholder)');
    if (!cards.length) return;
    var current = -1;
    for (var i = 0; i < cards.length; i++) {
      if (cards[i] === document.activeElement) { current = i; break; }
    }
    cards[wrapIndex(current, dir, cards.length)].focus();
  }

  function updateLightboxBtn() {
    if (!lightboxImg) return;
    var selBtn = el.querySelector('#pdl-lb-sel');
    var selText = el.querySelector('#pdl-lb-sel-text');
    if (sel[lightboxImg.id]) { selBtn.classList.add('pdl-btn-accent'); selText.textContent = MSG.deselect; }
    else { selBtn.classList.remove('pdl-btn-accent'); selText.textContent = MSG.select; }
  }

  function openLightbox(img) {
    lightboxImg = img;
    el.querySelector('#pdl-lb-img').src = img.src;
    el.querySelector('#pdl-lb-info').textContent = img.prompt || '';
    updateLightboxBtn();
    el.querySelector('#pdl-lb').classList.add('pdl-open');
  }

  function closeLightbox() {
    lightboxImg = null;
    el.querySelector('#pdl-lb').classList.remove('pdl-open');
  }

  function navigateLightbox(dir) {
    if (!lightboxImg) return;
    var idx = -1;
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].id === lightboxImg.id) { idx = i; break; }
    }
    if (idx === -1) return;
    openLightbox(imgs[wrapIndex(idx, dir, imgs.length)]);
  }


  function resetRefreshBtn() {
    if (!el) return;
    var btn = el.querySelector('#pdl-rf');
    if (btn) { btn.innerHTML = loadIcon('refresh') + ' ' + MSG.refresh; btn.disabled = false; }
  }

  function load() {
    try {
      var btn = el.querySelector('#pdl-rf');
      btn.innerHTML = loadIcon('refresh') + MSG.scanning;
      btn.disabled = true;
      api.runtime.sendMessage({type:'refreshImages'}, function(r) {
        resetRefreshBtn();
        if (api.runtime.lastError) { return; }
        if (r && r.images) {
          imgs = r.images;
          sel = {};
          imgs.forEach(function(i) { sel[i.id] = true; });
          render();
          showToast(imgs.length + MSG.imagesFound, 'success');
        }
      });
    } catch(e) {
      resetRefreshBtn();
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
    expandDiv.style.cssText = 'top:auto !important;bottom:6px !important;right:6px !important';
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
      if (!imgs.length) {
        g.innerHTML = '<div class="pdl-empty">' + MSG.noImages + '</div>';
        upd();
        return;
      }
      g.innerHTML = '';

      observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          var idx = parseInt(entry.target.getAttribute('data-idx'), 10);
          if (isNaN(idx)) return;
          if (entry.isIntersecting) {
            var start = Math.max(0, idx - VISIBLE_BUFFER);
            var end = Math.min(imgs.length, idx + VISIBLE_BUFFER + 1);
            for (var i = start; i < end; i++) {
              var card = renderCard(imgs[i]);
              if (!card.parentNode) {
                var placeholder = g.querySelector('[data-idx="' + i + '"]');
                if (placeholder) placeholder.replaceWith(card);
              }
            }
          }
        });
      }, {root: g, rootMargin: '100px'});

      for (var i = 0; i < imgs.length; i++) {
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
    } catch(e) {
      showToast('Render failed: ' + e.message, 'error');
    }
  }

  function toggleSelect(id) {
    if (sel[id]) delete sel[id]; else sel[id] = true;
    var card = el.querySelector('.pdl-card[data-id="' + id + '"]');
    if (card) {
      card.classList.toggle('pdl-selected', !!sel[id]);
      card.querySelector('.pdl-check').textContent = sel[id] ? '\u2713' : '';
    }
    upd();
  }

  function upd() {
    var c = Object.keys(sel).length;
    el.querySelector('#pdl-st').textContent = c + '/' + imgs.length + MSG.selected;
    var b = el.querySelector('#pdl-dl');
    b.innerHTML = loadIcon('download') + MSG.downloadSelected + c + ')';
    b.disabled = c === 0;
  }


  function download() {
    var s = imgs.filter(function(i) { return sel[i.id]; });
    if (!s.length) return;
    try {
      var prog = el.querySelector('#pdl-prog');
      var fill = el.querySelector('#pdl-pf');
      var text = el.querySelector('#pdl-pt');
      prog.classList.add('pdl-show');
      fill.style.width = '0%';
      text.textContent = '0/' + s.length + MSG.starting;
      api.runtime.sendMessage({type:'downloadImages', images:s}, function(r) {
        if (api.runtime.lastError) {
          showToast('Download error: ' + api.runtime.lastError.message, 'error');
          prog.classList.remove('pdl-show');
          if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
          return;
        }
        if (r && r.error) {
          prog.classList.remove('pdl-show');
          if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
          showToast('Download error: ' + r.error, 'error');
        } else if (r && r.added === 0 && r.queueSize > 0) {
          showToast('Queue has ' + r.queueSize + ' stuck items. Clearing...', 'info');
          api.runtime.sendMessage({type:'clearQueue'}, function() {
            prog.classList.remove('pdl-show');
          });
        } else if (!r) {
          showToast('No response from background script', 'error');
          prog.classList.remove('pdl-show');
          if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
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
              updateProgress(d, total, r.failed);
              if (text) {
                text.textContent = d + '/' + total + MSG.downloaded + (r.busy ? ' [busy]' : ' [idle]') + ' queue:' + r.queueLen;
              }
              if (d >= total) {
                clearInterval(progressInterval);
                progressInterval = null;
              }
            }
          });
        } catch(e) { /* expected: messaging may fail */ }
      }, 500);
    } catch(e) {
      if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
      showToast('Download failed: ' + e.message, 'error');
    }
  }

  window.addEventListener('beforeunload', function() {
    removeKeydownHandler();
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
          updateProgress(m.data.done, m.data.total, m.data.failed);
        }
      }
      if (m.type === 'downloadAll') {
        imgs.forEach(function(img) { sel[img.id] = true; });
        upd();
        download();
      }
      return true;
    });
  });
})();

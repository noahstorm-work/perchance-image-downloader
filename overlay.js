(function() {
  if (window !== window.top) return;
  if (window.__pdlLoaded) return;
  window.__pdlLoaded = true;

  var visible = false;
  var el = null;
  var imgs = [];
  var sel = {};
  var progressInterval = null;
  var folderName = 'Perchance Downloads';
  var theme = localStorage.getItem('pdl-theme') || 'dark';
  var previewSize = parseInt(localStorage.getItem('pdl-preview') || '180');
  var lightboxImg = null;
  var prevFocus = null;

  var SVG = {
    close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    sun: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    moon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    download: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    refresh: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    chevLeft: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    chevRight: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    expand: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>'
  };

  function getCSS() {
    return '' +
    '#pdl{position:fixed;inset:0;z-index:2147483647;display:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;color:#eee}' +
    '@keyframes pdlFadeIn{from{opacity:0}to{opacity:1}}' +
    '@keyframes pdlFadeOut{from{opacity:1}to{opacity:0}}' +
    '@keyframes pdlScaleIn{from{opacity:0;transform:translate(-50%,-50%) scale(.95)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}' +
    '@keyframes pdlScaleOut{from{opacity:1;transform:translate(-50%,-50%) scale(1)}to{opacity:0;transform:translate(-50%,-50%) scale(.95)}}' +
    '#pdl.pdl-open{display:block}' +
    '#pdl.pdl-opening .pdl-backdrop{animation:pdlFadeIn .2s ease-out forwards}' +
    '#pdl.pdl-opening .pdl-panel{animation:pdlScaleIn .2s ease-out forwards}' +
    '#pdl.pdl-closing .pdl-backdrop{animation:pdlFadeOut .15s ease-in forwards}' +
    '#pdl.pdl-closing .pdl-panel{animation:pdlScaleOut .15s ease-in forwards}' +
    '#pdl .pdl-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.6)}' +
    '#pdl .pdl-panel{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:85vw;max-width:1200px;height:80vh;background:#1a1a2e;border-radius:12px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5)}' +
    '#pdl .pdl-header{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#16213e;border-bottom:1px solid #0f3460}' +
    '#pdl .pdl-title{font-weight:700;font-size:15px;color:#e94560}' +
    '#pdl .pdl-header-actions{display:flex;gap:4px;align-items:center}' +
    '#pdl .pdl-icon-btn{background:none;border:none;color:#aaa;cursor:pointer;padding:10px;border-radius:6px;display:flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;transition:background .15s,color .15s}' +
    '#pdl .pdl-icon-btn:hover{background:#0f3460;color:#fff}' +
    '#pdl .pdl-icon-btn:active{opacity:.7}' +
    '#pdl .pdl-toolbar{display:flex;gap:8px;padding:10px 16px;background:#16213e;border-bottom:1px solid #0f3460;align-items:center;flex-wrap:wrap}' +
    '#pdl .pdl-btn{padding:7px 14px;border:none;border-radius:6px;background:#0f3460;color:#eee;font-size:13px;cursor:pointer;transition:background .15s,color .15s,opacity .15s;min-height:34px;display:inline-flex;align-items:center;gap:6px}' +
    '#pdl .pdl-btn:hover{background:#e94560;color:#fff}' +
    '#pdl .pdl-btn:active{opacity:.7}' +
    '#pdl .pdl-btn:disabled{opacity:.4;cursor:not-allowed}' +
    '#pdl .pdl-btn:disabled:hover{background:#0f3460;color:#eee}' +
    '#pdl .pdl-btn-accent{background:#e94560;color:#fff}' +
    '#pdl .pdl-btn-accent:hover{background:#c73650}' +
    '#pdl .pdl-btn-green{background:#4caf50;color:#fff;font-weight:700}' +
    '#pdl .pdl-btn-green:hover{background:#388e3c}' +
    '#pdl .pdl-btn-green:disabled{background:#555;color:#999}' +
    '#pdl .pdl-spacer{flex:1}' +
    '#pdl .pdl-filters{padding:8px 16px;background:#16213e;border-bottom:1px solid #0f3460;display:flex;gap:16px;align-items:center;flex-wrap:wrap}' +
    '#pdl .pdl-filter-group{display:flex;align-items:center;gap:6px;font-size:12px;color:#aaa}' +
    '#pdl .pdl-filter-group input[type=range]{width:120px;accent-color:#e94560}' +
    '#pdl .pdl-filter-group input[type=text]{width:160px;padding:5px 8px;border:1px solid #0f3460;border-radius:4px;background:#0f3460;color:#eee;font-size:12px;transition:border-color .15s}' +
    '#pdl .pdl-filter-group input[type=text]:focus{outline:none;border-color:#e94560}' +
    '#pdl .pdl-filter-val{color:#e94560;font-weight:700;min-width:35px}' +
    '#pdl .pdl-gallery{flex:1;overflow-y:auto;padding:16px;display:flex;flex-wrap:wrap;gap:10px;align-content:flex-start}' +
    '#pdl .pdl-gallery::-webkit-scrollbar{width:8px}' +
    '#pdl .pdl-gallery::-webkit-scrollbar-thumb{background:#0f3460;border-radius:4px}' +
    '#pdl .pdl-empty{width:100%;text-align:center;padding:60px 20px;color:#888}' +
    '#pdl .pdl-card{position:relative;border-radius:8px;overflow:hidden;cursor:pointer;border:3px solid transparent;flex-shrink:0;transition:transform .2s ease-out,box-shadow .2s ease-out,border-color .15s}' +
    '#pdl .pdl-card:hover{transform:scale(1.03);box-shadow:0 4px 20px rgba(0,0,0,.3)}' +
    '#pdl .pdl-card:active{transform:scale(.97);transition-duration:.1s}' +
    '#pdl .pdl-card.pdl-sel{border-color:#e94560}' +
    '#pdl .pdl-card img{width:100%;height:100%;object-fit:cover;display:block}' +
    '#pdl .pdl-check{position:absolute;top:6px;left:6px;width:24px;height:24px;background:rgba(0,0,0,.6);border-radius:5px;display:flex;align-items:center;justify-content:center;color:#fff;z-index:1;transition:background .15s}' +
    '#pdl .pdl-card.pdl-sel .pdl-check{background:#e94560}#pdl .pdl-expand{position:absolute;top:6px;right:6px;width:24px;height:24px;background:rgba(0,0,0,.6);border-radius:5px;display:flex;align-items:center;justify-content:center;color:#fff;z-index:1;cursor:pointer;transition:background .15s}#pdl .pdl-expand:hover{background:#e94560}' +
    '#pdl .pdl-progress{display:none;padding:8px 16px;background:#16213e;border-top:1px solid #0f3460}' +
    '#pdl .pdl-progress.pdl-show{display:block}' +
    '#pdl .pdl-pbar{height:6px;background:#0f3460;border-radius:3px;overflow:hidden;margin-bottom:4px}' +
    '#pdl .pdl-pfill{height:100%;background:linear-gradient(90deg,#e94560,#ff6b6b);width:0%;transition:width .3s}' +
    '#pdl .pdl-ptext{font-size:12px;color:#aaa;text-align:center}' +
    '#pdl .pdl-footer{padding:8px 16px;background:#16213e;border-top:1px solid #0f3460;display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#aaa}' +
    '#pdl .pdl-lb{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.9);display:none;align-items:center;justify-content:center;flex-direction:column}' +
    '#pdl .pdl-lb.pdl-open{display:flex}' +
    '#pdl .pdl-lb-img{max-width:90vw;max-height:75vh;object-fit:contain;border-radius:8px}' +
    '#pdl .pdl-lb-info{margin-top:12px;padding:8px 16px;background:rgba(255,255,255,.1);border-radius:6px;color:#ccc;font-size:13px;max-width:80vw;text-align:center}' +
    '#pdl .pdl-lb-actions{margin-top:12px;display:flex;gap:10px}' +
    '#pdl .pdl-lb-close{position:absolute;top:16px;right:16px}' +
    '#pdl .pdl-lb-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.5);border:none;color:#fff;cursor:pointer;padding:12px;border-radius:50%;transition:background .15s}' +
    '#pdl .pdl-lb-nav:hover{background:rgba(255,255,255,.2)}' +
    '#pdl .pdl-lb-prev{left:16px}' +
    '#pdl .pdl-lb-next{right:16px}' +
    '#pdl.pdl-light .pdl-panel{background:#f5f5f5;color:#333}' +
    '#pdl.pdl-light .pdl-header{background:#fff;border-color:#ddd}' +
    '#pdl.pdl-light .pdl-title{color:#e94560}' +
    '#pdl.pdl-light .pdl-toolbar{background:#fff;border-color:#ddd}' +
    '#pdl.pdl-light .pdl-btn{background:#e0e0e0;color:#333}' +
    '#pdl.pdl-light .pdl-btn:hover{background:#e94560;color:#fff}' +
    '#pdl.pdl-light .pdl-icon-btn:hover{background:#e0e0e0;color:#333}' +
    '#pdl.pdl-light .pdl-filters{background:#fff;border-color:#ddd}' +
    '#pdl.pdl-light .pdl-filter-group{color:#666}' +
    '#pdl.pdl-light .pdl-filter-group input[type=text]{background:#e0e0e0;color:#333;border-color:#ccc}' +
    '#pdl.pdl-light .pdl-filter-group input[type=text]:focus{border-color:#e94560}' +
    '#pdl.pdl-light .pdl-gallery{background:#f5f5f5}' +
    '#pdl.pdl-light .pdl-gallery::-webkit-scrollbar-thumb{background:#ccc}' +
    '#pdl.pdl-light .pdl-footer{background:#fff;border-color:#ddd;color:#666}' +
    '#pdl.pdl-light .pdl-progress{background:#fff;border-color:#ddd}' +
    '#pdl.pdl-light .pdl-pbar{background:#e0e0e0}' +
    '#pdl.pdl-light .pdl-ptext{color:#666}' +
    '#pdl.pdl-light .pdl-backdrop{background:rgba(0,0,0,.3)}' +
    '#pdl.pdl-light .pdl-card:hover{box-shadow:0 4px 20px rgba(0,0,0,.15)}' +
    '@media(prefers-reduced-motion:reduce){#pdl .pdl-card,#pdl .pdl-icon-btn,#pdl .pdl-btn,#pdl .pdl-filter-group input[type=text]{transition:none!important}#pdl.pdl-opening .pdl-backdrop,#pdl.pdl-opening .pdl-panel,#pdl.pdl-closing .pdl-backdrop,#pdl.pdl-closing .pdl-panel{animation:none!important}}';
  }

  function injectStyles() {
    if (document.getElementById('pdl-css')) return;
    var s = document.createElement('style');
    s.id = 'pdl-css';
    s.textContent = getCSS();
    document.head.appendChild(s);
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
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    }, 150);
    if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
  }

  function applyTheme() {
    if (!el) return;
    if (theme === 'light') {
      el.classList.add('pdl-light');
      el.querySelector('#pdl-theme-btn').innerHTML = SVG.sun;
    } else {
      el.classList.remove('pdl-light');
      el.querySelector('#pdl-theme-btn').innerHTML = SVG.moon;
    }
  }

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('pdl-theme', theme);
    applyTheme();
  }

  function loadFolder() {
    chrome.storage.local.get('settings', function(r) {
      if (r.settings && r.settings.folder) {
        folderName = r.settings.folder;
        if (el) {
          var inp = el.querySelector('#pdl-folder');
          if (inp) inp.value = folderName;
        }
      }
    });
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
    html += '<button id="pdl-x" class="pdl-icon-btn" aria-label="Close" title="Close (Escape)">' + SVG.close + '</button>';
    html += '</div></div>';
    html += '<div class="pdl-toolbar">';
    html += '<button id="pdl-sa" class="pdl-btn">Select All</button>';
    html += '<button id="pdl-da" class="pdl-btn">Deselect All</button>';
    html += '<button id="pdl-rf" class="pdl-btn pdl-btn-accent">' + SVG.refresh + ' Refresh</button>';
    html += '<div class="pdl-spacer"></div>';
    html += '<button id="pdl-dl" class="pdl-btn pdl-btn-green" disabled>' + SVG.download + ' Download Selected (0)</button>';
    html += '</div>';
    html += '<div class="pdl-filters">';
    html += '<div class="pdl-filter-group">';
    html += '<label>Preview:</label>';
    html += '<input type="range" id="pdl-sl" min="80" max="400" value="' + previewSize + '">';
    html += '<span id="pdl-sl-lb" class="pdl-filter-val">' + previewSize + 'px</span>';
    html += '</div>';
    html += '<div class="pdl-filter-group">';
    html += '<label>Folder:</label>';
    html += '<input type="text" id="pdl-folder" value="' + folderName + '" style="width:160px" aria-label="Download folder name">';
    html += '</div>';
    html += '</div>';
    html += '<div id="pdl-gal" class="pdl-gallery"><div class="pdl-empty">Click Refresh to scan for images.</div></div>';
    html += '<div id="pdl-prog" class="pdl-progress">';
    html += '<div class="pdl-pbar"><div id="pdl-pf" class="pdl-pfill"></div></div>';
    html += '<div id="pdl-pt" class="pdl-ptext"></div>';
    html += '</div>';
    html += '<div class="pdl-footer"><span id="pdl-st">0/0 selected</span></div>';
    html += '</div>';

    html += '<div id="pdl-lb" class="pdl-lb" role="dialog" aria-label="Image preview">';
    html += '<button id="pdl-lb-x" class="pdl-icon-btn pdl-lb-close" aria-label="Close preview">' + SVG.close + '</button>';
    html += '<button id="pdl-lb-prev" class="pdl-lb-nav pdl-lb-prev" aria-label="Previous image">' + SVG.chevLeft + '</button>';
    html += '<button id="pdl-lb-next" class="pdl-lb-nav pdl-lb-next" aria-label="Next image">' + SVG.chevRight + '</button>';
    html += '<img id="pdl-lb-img" class="pdl-lb-img" src="" alt="Preview">';
    html += '<div id="pdl-lb-info" class="pdl-lb-info"></div>';
    html += '<div class="pdl-lb-actions">';
    html += '<button id="pdl-lb-sel" class="pdl-btn">' + SVG.check + ' <span id="pdl-lb-sel-text">Select</span></button>';
    html += '<button id="pdl-lb-dl" class="pdl-btn pdl-btn-green">' + SVG.download + ' Download</button>';
    html += '</div></div>';

    el.innerHTML = html;
    document.documentElement.appendChild(el);
    bindEvents();
  }

  function bindEvents() {
    el.querySelector('#pdl-x').onclick = close;
    el.querySelector('.pdl-backdrop').onclick = close;
    el.querySelector('#pdl-theme-btn').onclick = toggleTheme;
    el.querySelector('#pdl-sa').onclick = function() { imgs.forEach(function(i){sel[i.id]=1}); render(); };
    el.querySelector('#pdl-da').onclick = function() { sel = {}; render(); };
    el.querySelector('#pdl-rf').onclick = load;
    el.querySelector('#pdl-dl').onclick = download;

    el.querySelector('#pdl-sl').oninput = function() {
      previewSize = parseInt(this.value);
      el.querySelector('#pdl-sl-lb').textContent = previewSize + 'px';
      localStorage.setItem('pdl-preview', previewSize);
      render();
    };

    el.querySelector('#pdl-folder').onchange = function() {
      folderName = this.value.trim() || 'Perchance Downloads';
      chrome.storage.local.get('settings', function(r) {
        var s = r.settings || {};
        s.folder = folderName;
        chrome.storage.local.set({settings: s});
      });
    };

    document.addEventListener('keydown', function(e) {
      if (!visible) return;
      if (e.key === 'Escape') {
        if (el.querySelector('#pdl-lb').classList.contains('pdl-open')) closeLightbox();
        else close();
        e.stopPropagation();
      }
    });

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
      if (sel[lightboxImg.id]) { selBtn.classList.add('pdl-btn-accent'); selText.textContent = 'Deselect'; }
      else { selBtn.classList.remove('pdl-btn-accent'); selText.textContent = 'Select'; }
    };
    el.querySelector('#pdl-lb-dl').onclick = function() {
      if (lightboxImg) chrome.runtime.sendMessage({type:'downloadImages', images:[lightboxImg]});
    };
  }

  function openLightbox(img) {
    lightboxImg = img;
    el.querySelector('#pdl-lb-img').src = img.src;
    el.querySelector('#pdl-lb-info').textContent = img.prompt || '';
    var selBtn = el.querySelector('#pdl-lb-sel');
    var selText = el.querySelector('#pdl-lb-sel-text');
    if (sel[img.id]) { selBtn.classList.add('pdl-btn-accent'); selText.textContent = 'Deselect'; }
    else { selBtn.classList.remove('pdl-btn-accent'); selText.textContent = 'Select'; }
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
    var next = idx + dir;
    if (next < 0) next = imgs.length - 1;
    if (next >= imgs.length) next = 0;
    openLightbox(imgs[next]);
  }

  function load() {
    var btn = el.querySelector('#pdl-rf');
    btn.innerHTML = SVG.refresh + ' Scanning...';
    btn.disabled = true;
    chrome.runtime.sendMessage({type:'refreshImages'}, function(r) {
      btn.innerHTML = SVG.refresh + ' Refresh';
      btn.disabled = false;
      if (r && r.images) {
        imgs = r.images;
        sel = {};
        imgs.forEach(function(i) { sel[i.id] = 1; });
        render();
      }
    });
  }

  function render() {
    var g = el.querySelector('#pdl-gal');
    if (!imgs.length) {
      g.innerHTML = '<div class="pdl-empty">No images found. Generate then Refresh.</div>';
      upd();
      return;
    }
    g.innerHTML = '';
    imgs.forEach(function(img) {
      var c = document.createElement('div');
      c.className = 'pdl-card' + (sel[img.id] ? ' pdl-sel' : '');
      c.style.width = previewSize + 'px';
      c.style.height = previewSize + 'px';
      c.setAttribute('data-id', img.id);
      c.innerHTML = '<div class="pdl-check">' + (sel[img.id] ? '\u2713' : '') + '</div><img src="' + img.src + '" loading="lazy"><div class="pdl-expand" title="Preview">' + SVG.expand + '</div>';
      c.onclick = function(e) {
        if (e.target.closest('.pdl-expand')) { openLightbox(img); return; }
        toggleSelect(img.id);
      };
      g.appendChild(c);
    });
    upd();
  }

  function toggleSelect(id) {
    if (sel[id]) delete sel[id]; else sel[id] = 1;
    var card = el.querySelector('.pdl-card[data-id="' + id + '"]');
    if (card) {
      card.classList.toggle('pdl-sel', !!sel[id]);
      card.querySelector('.pdl-check').textContent = sel[id] ? '\u2713' : '';
    }
    upd();
  }

  function upd() {
    var c = Object.keys(sel).length;
    el.querySelector('#pdl-st').textContent = c + '/' + imgs.length + ' selected';
    var b = el.querySelector('#pdl-dl');
    b.innerHTML = SVG.download + ' Download Selected (' + c + ')';
    b.disabled = c === 0;
  }

  function download() {
    var s = imgs.filter(function(i) { return sel[i.id]; });
    if (!s.length) return;
    var prog = el.querySelector('#pdl-prog');
    var fill = el.querySelector('#pdl-pf');
    var text = el.querySelector('#pdl-pt');
    prog.classList.add('pdl-show');
    fill.style.width = '0%';
    text.textContent = '0/' + s.length + ' starting...';
    chrome.runtime.sendMessage({type:'downloadImages', images:s});
    var d = 0;
    var total = s.length;
    if (progressInterval) clearInterval(progressInterval);
    progressInterval = setInterval(function() {
      chrome.runtime.sendMessage({type:'getProgress'}, function(r) {
        if (r) {
          d = r.done;
          fill.style.width = ((d / total) * 100) + '%';
          text.textContent = d + '/' + total + (d < total ? ' downloading...' : ' done!');
          if (d >= total) {
            clearInterval(progressInterval);
            progressInterval = null;
            setTimeout(function() { prog.classList.remove('pdl-show'); fill.style.width = '0%'; }, 2000);
          }
        }
      });
    }, 500);
  }

  chrome.runtime.onMessage.addListener(function(m,s,send){
    if (m.type==='toggleOverlay') { if(visible) close(); else open(); send({ok:1}); }
    return true;
  });
})();






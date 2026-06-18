var assert = require('assert');

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  PASS: ' + name);
  } catch(e) {
    failed++;
    console.log('  FAIL: ' + name);
    console.log('        ' + e.message);
  }
}

console.log('\n--- URL Validation (content.js logic) ---');

var DETECTION_CONFIG = {
  allowedDomains: ['perchance.org', 'image-generation.perchance.org'],
  minImageSize: 50,
  promptMinLength: 3,
  promptMaxLength: 500
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

test('allows data:image URIs', function() {
  assert.strictEqual(isAllowedUrl('data:image/png;base64,abc'), true);
});

test('allows perchance.org images', function() {
  assert.strictEqual(isAllowedUrl('https://perchance.org/image.jpeg'), true);
});

test('allows subdomain of perchance.org', function() {
  assert.strictEqual(isAllowedUrl('https://image-generation.perchance.org/image/abc.jpeg'), true);
});

test('allows deep subdomains', function() {
  assert.strictEqual(isAllowedUrl('https://cdn.perchance.org/img.png'), true);
});

test('blocks non-perchance domains', function() {
  assert.strictEqual(isAllowedUrl('https://evil.com/image.jpg'), false);
});

test('blocks similar but wrong domains', function() {
  assert.strictEqual(isAllowedUrl('https://perchance.org.evil.com/img.png'), false);
});

test('blocks empty string', function() {
  assert.strictEqual(isAllowedUrl(''), false);
});

test('blocks malformed URLs gracefully', function() {
  assert.strictEqual(isAllowedUrl('not-a-url'), false);
});

console.log('\n--- Detection Config ---');

test('config has required fields', function() {
  assert.ok(DETECTION_CONFIG.allowedDomains, 'allowedDomains');
  assert.ok(DETECTION_CONFIG.minImageSize, 'minImageSize');
  assert.ok(DETECTION_CONFIG.promptMinLength, 'promptMinLength');
  assert.ok(DETECTION_CONFIG.promptMaxLength, 'promptMaxLength');
});

test('config domains are strings', function() {
  DETECTION_CONFIG.allowedDomains.forEach(function(d) {
    assert.strictEqual(typeof d, 'string');
  });
});

test('config size constraints are positive', function() {
  assert.ok(DETECTION_CONFIG.minImageSize > 0);
  assert.ok(DETECTION_CONFIG.promptMinLength > 0);
  assert.ok(DETECTION_CONFIG.promptMaxLength > DETECTION_CONFIG.promptMinLength);
});

console.log('\n--- HTML Escaping (overlay.js logic) ---');

function esc(str) {
  var div = { _text: '' };
  div.textContent = str;
  return div.textContent
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

test('escapes HTML entities', function() {
  assert.strictEqual(esc('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
});

test('escapes ampersand', function() {
  assert.strictEqual(esc('a & b'), 'a &amp; b');
});

test('passes through normal text', function() {
  assert.strictEqual(esc('hello world'), 'hello world');
});

test('escapes quotes in attributes', function() {
  assert.strictEqual(esc('value" onerror="alert(1)'), 'value&quot; onerror=&quot;alert(1)');
});

console.log('\n--- Image Dedup (background.js logic) ---');

function dedupImages(all) {
  var seen = {};
  var uniq = [];
  all.forEach(function(i) { if (!seen[i.src]) { seen[i.src] = 1; uniq.push(i); } });
  return uniq;
}

test('deduplicates by src URL', function() {
  var input = [
    {id: '1', src: 'https://a.com/1.jpg'},
    {id: '2', src: 'https://a.com/1.jpg'},
    {id: '3', src: 'https://a.com/2.jpg'}
  ];
  assert.strictEqual(dedupImages(input).length, 2);
});

test('preserves first occurrence', function() {
  var input = [
    {id: '1', src: 'https://a.com/1.jpg'},
    {id: '2', src: 'https://a.com/1.jpg'}
  ];
  assert.strictEqual(dedupImages(input)[0].id, '1');
});

test('handles empty array', function() {
  assert.strictEqual(dedupImages([]).length, 0);
});

test('handles unique images', function() {
  var input = [
    {id: '1', src: 'https://a.com/1.jpg'},
    {id: '2', src: 'https://a.com/2.jpg'}
  ];
  assert.strictEqual(dedupImages(input).length, 2);
});

console.log('\n--- Download Queue (background.js logic) ---');

function createQueue() {
  var queue = [];
  var queuedUrls = {};
  var MAX_QUEUE_SIZE = 5;
  return {
    enqueue: function(img) {
      if (queuedUrls[img.src]) return false;
      if (queue.length >= MAX_QUEUE_SIZE) return false;
      queue.push(img);
      queuedUrls[img.src] = true;
      return true;
    },
    getLength: function() { return queue.length; },
    getQueue: function() { return queue; }
  };
}

test('enqueues new images', function() {
  var q = createQueue();
  assert.strictEqual(q.enqueue({id:'1', src:'https://a.com/1.jpg'}), true);
  assert.strictEqual(q.getLength(), 1);
});

test('rejects duplicate URLs', function() {
  var q = createQueue();
  q.enqueue({id:'1', src:'https://a.com/1.jpg'});
  assert.strictEqual(q.enqueue({id:'2', src:'https://a.com/1.jpg'}), false);
  assert.strictEqual(q.getLength(), 1);
});

test('respects queue size limit', function() {
  var q = createQueue();
  for (var i = 0; i < 6; i++) {
    q.enqueue({id: String(i), src: 'https://a.com/' + i + '.jpg'});
  }
  assert.strictEqual(q.getLength(), 5);
});

test('allows different URLs', function() {
  var q = createQueue();
  q.enqueue({id:'1', src:'https://a.com/1.jpg'});
  q.enqueue({id:'2', src:'https://a.com/2.jpg'});
  assert.strictEqual(q.getLength(), 2);
});

console.log('\n--- Retry Logic (background.js logic) ---');

test('retry count increments on failure', function() {
  var img = {_retries: 0};
  var MAX_RETRIES = 3;
  function attempt() {
    var retryCount = img._retries || 0;
    if (retryCount < MAX_RETRIES) {
      img._retries = retryCount + 1;
      return 'retry';
    }
    return 'give up';
  }
  assert.strictEqual(attempt(), 'retry');
  assert.strictEqual(img._retries, 1);
  assert.strictEqual(attempt(), 'retry');
  assert.strictEqual(img._retries, 2);
  assert.strictEqual(attempt(), 'retry');
  assert.strictEqual(img._retries, 3);
  assert.strictEqual(attempt(), 'give up');
});

console.log('\n--- Prompt Extraction (content.js logic) ---');

test('trims and validates prompt length from config', function() {
  function validatePrompt(v) {
    return !!(v && v.length >= DETECTION_CONFIG.promptMinLength && v.length < DETECTION_CONFIG.promptMaxLength);
  }
  assert.strictEqual(validatePrompt('hi'), false);
  assert.strictEqual(validatePrompt('a beautiful landscape'), true);
  assert.strictEqual(validatePrompt('x'.repeat(500)), false);
  assert.strictEqual(validatePrompt(''), false);
  assert.strictEqual(validatePrompt(null), false);
});

console.log('\n--- Filename Sanitization (background.js logic) ---');

function sanitizeFilename(prompt) {
  return (prompt || 'image').replace(/[^a-z0-9]/gi, '-').substring(0, 50);
}

test('sanitizes special characters', function() {
  assert.strictEqual(sanitizeFilename('My Image! @#$'), 'My-Image-----');
});

test('truncates long names', function() {
  assert.strictEqual(sanitizeFilename('a'.repeat(100)), 'a'.repeat(50));
});

test('uses default for empty prompt', function() {
  assert.strictEqual(sanitizeFilename(''), 'image');
  assert.strictEqual(sanitizeFilename(null), 'image');
});

test('preserves alphanumeric', function() {
  assert.strictEqual(sanitizeFilename('abc123'), 'abc123');
});

console.log('\n--- Browser Polyfill ---');

test('all JS files have browser polyfill', function() {
  var fs = require('fs');
  var files = ['background.js', 'content.js', 'overlay.js'];
  files.forEach(function(f) {
    var code = fs.readFileSync(f, 'utf8');
    assert.ok(code.indexOf("typeof browser !== 'undefined' ? browser : chrome") !== -1, f + ' has polyfill');
  });
});

test('all JS files use api variable instead of direct chrome', function() {
  var fs = require('fs');
  var files = ['background.js', 'content.js', 'overlay.js'];
  files.forEach(function(f) {
    var code = fs.readFileSync(f, 'utf8');
    var lines = code.split('\n');
    var polyfillLine = lines.findIndex(function(l) { return l.indexOf('var api =') !== -1; });
    assert.ok(polyfillLine !== -1, f + ' declares api variable');
  });
});

console.log('\n--- Storage Schema Versioning ---');

test('background.js has SCHEMA_VERSION constant', function() {
  var fs = require('fs');
  var code = fs.readFileSync('background.js', 'utf8');
  assert.ok(code.indexOf('SCHEMA_VERSION') !== -1, 'SCHEMA_VERSION defined');
});

test('background.js has migrateStorage function', function() {
  var fs = require('fs');
  var code = fs.readFileSync('background.js', 'utf8');
  assert.ok(code.indexOf('function migrateStorage') !== -1, 'migrateStorage defined');
});

console.log('\n--- Queue Persistence ---');

test('background.js has persistQueue function', function() {
  var fs = require('fs');
  var code = fs.readFileSync('background.js', 'utf8');
  assert.ok(code.indexOf('function persistQueue') !== -1, 'persistQueue defined');
});

test('background.js has restoreQueue function', function() {
  var fs = require('fs');
  var code = fs.readFileSync('background.js', 'utf8');
  assert.ok(code.indexOf('function restoreQueue') !== -1, 'restoreQueue defined');
});

test('background.js uses storage.session for queue', function() {
  var fs = require('fs');
  var code = fs.readFileSync('background.js', 'utf8');
  assert.ok(code.indexOf('storage.session') !== -1, 'uses storage.session');
});

console.log('\n--- Gallery Virtualization ---');

test('overlay.js has IntersectionObserver usage', function() {
  var fs = require('fs');
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf('IntersectionObserver') !== -1, 'IntersectionObserver used');
});

test('overlay.js has VISIBLE_BUFFER constant', function() {
  var fs = require('fs');
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf('VISIBLE_BUFFER') !== -1, 'VISIBLE_BUFFER defined');
});

test('overlay.js has renderedCards cache', function() {
  var fs = require('fs');
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf('renderedCards') !== -1, 'renderedCards defined');
});

test('overlay.js has disconnectObserver function', function() {
  var fs = require('fs');
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf('function disconnectObserver') !== -1, 'disconnectObserver defined');
});

test('CSS has placeholder class for virtualization', function() {
  var fs = require('fs');
  var css = fs.readFileSync('overlay.css', 'utf8');
  assert.ok(css.indexOf('.pdl-placeholder') !== -1, 'pdl-placeholder class exists');
});

console.log('\n--- CSS Class Renaming ---');

test('new class names are used in CSS', function() {
  var fs = require('fs');
  var css = fs.readFileSync('overlay.css', 'utf8');
  assert.ok(css.indexOf('.pdl-selected') !== -1, 'pdl-selected exists');
  assert.ok(css.indexOf('.pdl-lightbox') !== -1, 'pdl-lightbox exists');
  assert.ok(css.indexOf('.pdl-lightbox-img') !== -1, 'pdl-lightbox-img exists');
  assert.ok(css.indexOf('.pdl-lightbox-nav') !== -1, 'pdl-lightbox-nav exists');
  assert.ok(css.indexOf('.pdl-lightbox-close') !== -1, 'pdl-lightbox-close exists');
  assert.ok(css.indexOf('.pdl-toast') !== -1, 'pdl-toast exists');
});

test('old class names are removed from CSS', function() {
  var fs = require('fs');
  var css = fs.readFileSync('overlay.css', 'utf8');
  assert.ok(css.indexOf('.pdl-card.pdl-sel{') === -1, 'pdl-sel as selector removed');
  assert.ok(css.indexOf('.pdl-card.pdl-sel ') === -1, 'pdl-sel with space removed');
  assert.ok(css.indexOf('.pdl-card.pdl-sel.') === -1, 'pdl-sel with class removed');
  assert.ok(css.indexOf('.pdl-lb{') === -1, 'pdl-lb removed');
  assert.ok(css.indexOf('.pdl-lb-img') === -1, 'pdl-lb-img removed');
  assert.ok(css.indexOf('.pdl-lb-nav') === -1, 'pdl-lb-nav removed');
  assert.ok(css.indexOf('.pdl-lb-close') === -1, 'pdl-lb-close removed');
});

test('JS uses new class names', function() {
  var fs = require('fs');
  var js = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(js.indexOf('pdl-selected') !== -1, 'pdl-selected used in JS');
  assert.ok(js.indexOf('pdl-lightbox') !== -1, 'pdl-lightbox used in JS');
  assert.ok(js.indexOf("'pdl-sel'") === -1, 'old pdl-sel not in JS');
  assert.ok(js.indexOf("'pdl-lb'") === -1, 'old pdl-lb not in JS');
});

console.log('\n--- Manifest Validation ---');

test('manifest has CSP', function() {
  var fs = require('fs');
  var m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.ok(m.content_security_policy, 'CSP present');
  assert.ok(m.content_security_policy.extension_pages.indexOf("'self'") !== -1, 'CSP has self');
});

test('manifest is MV3', function() {
  var fs = require('fs');
  var m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.strictEqual(m.manifest_version, 3);
});

test('manifest includes SVG icons in web_accessible_resources', function() {
  var fs = require('fs');
  var m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  var resources = m.web_accessible_resources[0].resources;
  assert.ok(resources.indexOf('icons/svg/*') !== -1, 'SVG icons accessible');
});

test('manifest includes overlay.css in web_accessible_resources', function() {
  var fs = require('fs');
  var m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  var resources = m.web_accessible_resources[0].resources;
  assert.ok(resources.indexOf('overlay.css') !== -1, 'overlay.css accessible');
});

console.log('\n--- SVG Icon Files ---');

test('all SVG icon files exist', function() {
  var fs = require('fs');
  var icons = ['close', 'sun', 'moon', 'download', 'refresh', 'chevron-left', 'check', 'chevron-right', 'expand', 'alert-circle'];
  icons.forEach(function(name) {
    assert.ok(fs.existsSync('icons/svg/' + name + '.svg'), name + '.svg exists');
  });
});

console.log('\n--- On-Demand Permissions ---');

test('manifest has optional_permissions for downloads', function() {
  var fs = require('fs');
  var m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.ok(m.optional_permissions, 'optional_permissions exists');
  assert.ok(m.optional_permissions.indexOf('downloads') !== -1, 'downloads in optional_permissions');
});

test('manifest has optional_permissions for contextMenus', function() {
  var fs = require('fs');
  var m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.ok(m.optional_permissions.indexOf('contextMenus') !== -1, 'contextMenus in optional_permissions');
});

test('manifest does NOT have downloads in required permissions', function() {
  var fs = require('fs');
  var m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.ok(m.permissions.indexOf('downloads') === -1, 'downloads not in required permissions');
});

test('manifest does NOT have contextMenus in required permissions', function() {
  var fs = require('fs');
  var m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.ok(m.permissions.indexOf('contextMenus') === -1, 'contextMenus not in required permissions');
});

test('background.js has ensureDownloadsPermission function', function() {
  var fs = require('fs');
  var code = fs.readFileSync('background.js', 'utf8');
  assert.ok(code.indexOf('function ensureDownloadsPermission') !== -1, 'ensureDownloadsPermission defined');
});

test('background.js calls ensureDownloadsPermission before download', function() {
  var fs = require('fs');
  var code = fs.readFileSync('background.js', 'utf8');
  assert.ok(code.indexOf('ensureDownloadsPermission(function(granted)') !== -1, 'permission check present');
});

console.log('\n--- Image Format Detection ---');

function detectExtension(src) {
  var MIME_EXTENSIONS = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/bmp': '.bmp' };
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

test('detects PNG from data URI', function() {
  assert.strictEqual(detectExtension('data:image/png;base64,abc'), '.png');
});

test('detects JPEG from data URI', function() {
  assert.strictEqual(detectExtension('data:image/jpeg;base64,abc'), '.jpg');
});

test('detects WebP from data URI', function() {
  assert.strictEqual(detectExtension('data:image/webp;base64,abc'), '.webp');
});

test('detects PNG from URL', function() {
  assert.strictEqual(detectExtension('https://example.com/image.png'), '.png');
});

test('detects JPEG from URL', function() {
  assert.strictEqual(detectExtension('https://example.com/image.jpeg?foo=bar'), '.jpeg');
});

test('detects WebP from URL', function() {
  assert.strictEqual(detectExtension('https://example.com/image.webp?v=1'), '.webp');
});

test('defaults to .jpg for unknown', function() {
  assert.strictEqual(detectExtension('https://example.com/image?foo=bar'), '.jpg');
});

test('defaults to .jpg for invalid URL', function() {
  assert.strictEqual(detectExtension('not-a-url'), '.jpg');
});

test('background.js has detectExtension function', function() {
  var fs = require('fs');
  var code = fs.readFileSync('background.js', 'utf8');
  assert.ok(code.indexOf('function detectExtension') !== -1, 'detectExtension defined');
});

test('background.js has MIME_EXTENSIONS constant', function() {
  var fs = require('fs');
  var code = fs.readFileSync('background.js', 'utf8');
  assert.ok(code.indexOf('MIME_EXTENSIONS') !== -1, 'MIME_EXTENSIONS defined');
});

console.log('\n--- Download History ---');

test('background.js has downloadHistory variable', function() {
  var fs = require('fs');
  var code = fs.readFileSync('background.js', 'utf8');
  assert.ok(code.indexOf('var downloadHistory') !== -1, 'downloadHistory variable defined');
});

test('background.js has persistHistory function', function() {
  var fs = require('fs');
  var code = fs.readFileSync('background.js', 'utf8');
  assert.ok(code.indexOf('function persistHistory') !== -1, 'persistHistory defined');
});

test('background.js handles getHistory message', function() {
  var fs = require('fs');
  var code = fs.readFileSync('background.js', 'utf8');
  assert.ok(code.indexOf("'getHistory'") !== -1, 'getHistory message handled');
});

test('background.js checks downloadHistory before enqueue', function() {
  var fs = require('fs');
  var code = fs.readFileSync('background.js', 'utf8');
  assert.ok(code.indexOf('downloadHistory[img.src]') !== -1, 'checks downloadHistory before enqueue');
});

test('background.js stores history on download', function() {
  var fs = require('fs');
  var code = fs.readFileSync('background.js', 'utf8');
  assert.ok(code.indexOf('function markDownloaded') !== -1, 'markDownloaded function exists');
});

console.log('\n--- i18n Messages ---');

test('overlay.js has MSG object', function() {
  var fs = require('fs');
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf('var MSG') !== -1, 'MSG object defined');
});

test('MSG has all required keys', function() {
  var fs = require('fs');
  var code = fs.readFileSync('overlay.js', 'utf8');
  var requiredKeys = ['selectAll', 'deselectAll', 'refresh', 'downloadSelected', 'noImages', 'preview', 'close', 'select', 'deselect', 'download', 'done', 'exportJson', 'searchPlaceholder'];
  requiredKeys.forEach(function(key) {
    assert.ok(code.indexOf(key) !== -1, 'MSG has key: ' + key);
  });
});

test('overlay.js uses MSG for UI strings', function() {
  var fs = require('fs');
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf('MSG.selectAll') !== -1, 'uses MSG.selectAll');
  assert.ok(code.indexOf('MSG.refresh') !== -1, 'uses MSG.refresh');
  assert.ok(code.indexOf('MSG.downloadSelected') !== -1, 'uses MSG.downloadSelected');
});

console.log('\n--- Search/Filter ---');

test('overlay.js has search input', function() {
  var fs = require('fs');
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf('pdl-search') !== -1, 'search input exists');
});

test('overlay.js has searchQuery variable', function() {
  var fs = require('fs');
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf('var searchQuery') !== -1, 'searchQuery variable defined');
});

test('overlay.js has applyFilter function', function() {
  var fs = require('fs');
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf('function applyFilter') !== -1, 'applyFilter function defined');
});

test('overlay.js has filteredImgs variable', function() {
  var fs = require('fs');
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf('var filteredImgs') !== -1, 'filteredImgs variable defined');
});

console.log('\n--- Keyboard Navigation ---');

test('overlay.js has aria-keyshortcuts', function() {
  var fs = require('fs');
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf('aria-keyshortcuts') !== -1, 'aria-keyshortcuts present');
});

test('overlay.js has navigateCard function', function() {
  var fs = require('fs');
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf('function navigateCard') !== -1, 'navigateCard defined');
});

test('overlay.js has galleryKeyHandler', function() {
  var fs = require('fs');
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf('galleryKeyHandler') !== -1, 'galleryKeyHandler defined');
});

test('overlay.js has removeGalleryKeyHandler function', function() {
  var fs = require('fs');
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf('function removeGalleryKeyHandler') !== -1, 'removeGalleryKeyHandler defined');
});

test('gallery cards have role gridcell', function() {
  var fs = require('fs');
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf("'role', 'gridcell'") !== -1, 'role gridcell present');
});

test('gallery has role="grid"', function() {
  var fs = require('fs');
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf('role="grid"') !== -1, 'role grid present');
});

console.log('\n--- Export ---');

test('overlay.js has exportSelected function', function() {
  var fs = require('fs');
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf('function exportSelected') !== -1, 'exportSelected defined');
});

test('overlay.js has export button', function() {
  var fs = require('fs');
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf('pdl-export') !== -1, 'export button exists');
});

console.log('\n--- Error Boundaries ---');

test('overlay.js has try-catch in render', function() {
  var fs = require('fs');
  var code = fs.readFileSync('overlay.js', 'utf8');
  var renderIdx = code.indexOf('function render()');
  assert.ok(renderIdx !== -1, 'render function exists');
  var renderBody = code.substring(renderIdx, renderIdx + 500);
  assert.ok(renderBody.indexOf('try') !== -1, 'render has try block');
});

test('overlay.js has try-catch in load', function() {
  var fs = require('fs');
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf('function load') !== -1, 'load function exists');
  var loadStart = code.indexOf('function load');
  var loadBody = code.substring(loadStart, loadStart + 500);
  assert.ok(loadBody.indexOf('try') !== -1, 'load has try block');
});

test('overlay.js has logMemory function', function() {
  var fs = require('fs');
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf('function logMemory') !== -1, 'logMemory defined');
});

test('overlay.js has showToast function', function() {
  var fs = require('fs');
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf('function showToast') !== -1, 'showToast defined');
});

console.log('\n--- Version Check ---');

test('manifest version is 2.4.0', function() {
  var fs = require('fs');
  var m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.strictEqual(m.version, '2.4.0');
});

console.log('\n=============================');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('=============================\n');

process.exit(failed > 0 ? 1 : 0);

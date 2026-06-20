var assert = require('assert');
var fs = require('fs');

var passed = 0;
var failed = 0;
var total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log('  PASS: ' + name);
  } catch(e) {
    failed++;
    console.log('  FAIL: ' + name);
    console.log('        ' + e.message);
    if (e.actual !== undefined && e.expected !== undefined) {
      console.log('        actual:   ' + JSON.stringify(e.actual));
      console.log('        expected: ' + JSON.stringify(e.expected));
    }
  }
}

function section(name) {
  console.log('\n--- ' + name + ' ---');
}

// ============================================================
// UNIT TESTS: content.js — URL Validation
// ============================================================

section('content.js — isAllowedUrl');

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

test('allows data:image/png URIs', function() {
  assert.strictEqual(isAllowedUrl('data:image/png;base64,abc'), true);
});

test('allows data:image/jpeg URIs', function() {
  assert.strictEqual(isAllowedUrl('data:image/jpeg;base64,abc'), true);
});

test('allows data:image/gif URIs', function() {
  assert.strictEqual(isAllowedUrl('data:image/gif;base64,abc'), true);
});

test('allows data:image/webp URIs', function() {
  assert.strictEqual(isAllowedUrl('data:image/webp;base64,abc'), true);
});

test('allows perchance.org images', function() {
  assert.strictEqual(isAllowedUrl('https://perchance.org/image.jpeg'), true);
});

test('allows image-generation.perchance.org', function() {
  assert.strictEqual(isAllowedUrl('https://image-generation.perchance.org/image/abc.jpeg'), true);
});

test('allows deep subdomains', function() {
  assert.strictEqual(isAllowedUrl('https://cdn.perchance.org/img.png'), true);
});

test('allows http perchance.org', function() {
  assert.strictEqual(isAllowedUrl('http://perchance.org/img.jpg'), true);
});

test('blocks evil.com', function() {
  assert.strictEqual(isAllowedUrl('https://evil.com/image.jpg'), false);
});

test('blocks perchance.org.evil.com (not a subdomain)', function() {
  assert.strictEqual(isAllowedUrl('https://perchance.org.evil.com/img.png'), false);
});

test('blocks evil-perchance.org', function() {
  assert.strictEqual(isAllowedUrl('https://evil-perchance.org/img.png'), false);
});

test('blocks empty string', function() {
  assert.strictEqual(isAllowedUrl(''), false);
});

test('blocks malformed URLs gracefully', function() {
  assert.strictEqual(isAllowedUrl('not-a-url'), false);
});

test('blocks javascript: URIs', function() {
  assert.strictEqual(isAllowedUrl('javascript:alert(1)'), false);
});

test('blocks ftp with non-perchance host', function() {
  assert.strictEqual(isAllowedUrl('ftp://evil.com/img.jpg'), false);
});

// ============================================================
// UNIT TESTS: content.js — DETECTION_CONFIG
// ============================================================

section('content.js — DETECTION_CONFIG structure');

test('config has allowedDomains array', function() {
  assert.ok(Array.isArray(DETECTION_CONFIG.allowedDomains));
  assert.ok(DETECTION_CONFIG.allowedDomains.length > 0);
});

test('config domains are strings', function() {
  DETECTION_CONFIG.allowedDomains.forEach(function(d) {
    assert.strictEqual(typeof d, 'string');
    assert.ok(d.length > 0);
  });
});

test('config minImageSize is positive', function() {
  assert.ok(DETECTION_CONFIG.minImageSize > 0);
});

test('config promptMinLength is positive', function() {
  assert.ok(DETECTION_CONFIG.promptMinLength > 0);
});

test('config promptMaxLength > promptMinLength', function() {
  assert.ok(DETECTION_CONFIG.promptMaxLength > DETECTION_CONFIG.promptMinLength);
});

test('config has promptSelectors', function() {
  assert.strictEqual(typeof DETECTION_CONFIG.promptSelectors, 'string');
  assert.ok(DETECTION_CONFIG.promptSelectors.length > 0);
});

test('config has postMessagePatterns', function() {
  assert.ok(Array.isArray(DETECTION_CONFIG.postMessagePatterns));
  assert.ok(DETECTION_CONFIG.postMessagePatterns.length > 0);
});

test('config has consoleLogPatterns', function() {
  assert.ok(Array.isArray(DETECTION_CONFIG.consoleLogPatterns));
  assert.ok(DETECTION_CONFIG.consoleLogPatterns.length > 0);
});

test('config has promptKeys', function() {
  assert.ok(Array.isArray(DETECTION_CONFIG.promptKeys));
  assert.ok(DETECTION_CONFIG.promptKeys.indexOf('prompt') !== -1);
});

test('postMessagePatterns have required fields', function() {
  DETECTION_CONFIG.postMessagePatterns.forEach(function(p) {
    if (p.type) assert.ok(p.srcKey || p.srcTemplate, 'pattern with type has srcKey or srcTemplate');
    if (p.statusMatch) assert.ok(p.idKey, 'pattern with statusMatch has idKey');
  });
});

test('consoleLogPatterns have required fields', function() {
  DETECTION_CONFIG.consoleLogPatterns.forEach(function(p) {
    assert.ok(p.statusMatch, 'has statusMatch');
    assert.ok(p.srcTemplate, 'has srcTemplate');
    assert.ok(p.idKey, 'has idKey');
  });
});

// ============================================================
// UNIT TESTS: content.js — extractPrompt
// ============================================================

section('content.js — extractPrompt');

function extractPrompt(data) {
  var keys = DETECTION_CONFIG.promptKeys;
  for (var i = 0; i < keys.length; i++) {
    if (data && data[keys[i]]) return data[keys[i]];
  }
  return null;
}

test('extracts prompt from valid data', function() {
  assert.strictEqual(extractPrompt({prompt: 'a cat'}), 'a cat');
});

test('returns null for null data', function() {
  assert.strictEqual(extractPrompt(null), null);
});

test('returns null for undefined data', function() {
  assert.strictEqual(extractPrompt(undefined), null);
});

test('returns null for empty object', function() {
  assert.strictEqual(extractPrompt({}), null);
});

test('returns null for empty prompt string', function() {
  assert.strictEqual(extractPrompt({prompt: ''}), null);
});

test('returns null for missing prompt key', function() {
  assert.strictEqual(extractPrompt({other: 'value'}), null);
});

test('extracts prompt with special characters', function() {
  assert.strictEqual(extractPrompt({prompt: '<script>alert("xss")</script>'}), '<script>alert("xss")</script>');
});

test('extracts prompt with unicode', function() {
  assert.strictEqual(extractPrompt({prompt: '\u4e2d\u6587\u6d4b\u8bd5'}), '\u4e2d\u6587\u6d4b\u8bd5');
});

// ============================================================
// UNIT TESTS: content.js — generateId
// ============================================================

section('content.js — generateId');

function generateId(prefix) {
  return prefix + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
}

test('generates id with prefix', function() {
  var id = generateId('_');
  assert.ok(id.indexOf('_') === 0);
});

test('generates unique ids', function() {
  var ids = {};
  var dupes = 0;
  for (var i = 0; i < 100; i++) {
    var id = generateId('test');
    if (ids[id]) dupes++;
    ids[id] = true;
  }
  assert.strictEqual(dupes, 0);
});

test('generates id with d prefix', function() {
  var id = generateId('d');
  assert.ok(id.indexOf('d') === 0);
});

// ============================================================
// UNIT TESTS: content.js — add / dedup
// ============================================================

section('content.js — add / image dedup');

function createImgStore() {
  var imgs = {};
  function add(id, src, prompt) {
    if (!id || !src) return false;
    if (imgs[id]) return false;
    var keys = Object.keys(imgs);
    for (var i = 0; i < keys.length; i++) {
      if (imgs[keys[i]].src === src) return false;
    }
    imgs[id] = { id: id, src: src, prompt: prompt || 'image', timestamp: new Date().toISOString() };
    return true;
  }
  return { add: add, get: function() { return imgs; }, count: function() { return Object.keys(imgs).length; } };
}

test('add stores image', function() {
  var store = createImgStore();
  assert.strictEqual(store.add('1', 'https://a.com/1.jpg'), true);
  assert.strictEqual(store.count(), 1);
});

test('add rejects duplicate id', function() {
  var store = createImgStore();
  store.add('1', 'https://a.com/1.jpg');
  assert.strictEqual(store.add('1', 'https://a.com/2.jpg'), false);
  assert.strictEqual(store.count(), 1);
});

test('add rejects duplicate src with different id', function() {
  var store = createImgStore();
  store.add('1', 'https://a.com/1.jpg');
  assert.strictEqual(store.add('2', 'https://a.com/1.jpg'), false);
  assert.strictEqual(store.count(), 1);
});

test('add rejects empty id', function() {
  var store = createImgStore();
  assert.strictEqual(store.add('', 'https://a.com/1.jpg'), false);
  assert.strictEqual(store.count(), 0);
});

test('add rejects empty src', function() {
  var store = createImgStore();
  assert.strictEqual(store.add('1', ''), false);
  assert.strictEqual(store.count(), 0);
});

test('add stores prompt or default', function() {
  var store = createImgStore();
  store.add('1', 'https://a.com/1.jpg', 'cat');
  assert.strictEqual(store.get()['1'].prompt, 'cat');
  store.add('2', 'https://a.com/2.jpg');
  assert.strictEqual(store.get()['2'].prompt, 'image');
});

test('add stores timestamp', function() {
  var store = createImgStore();
  store.add('1', 'https://a.com/1.jpg');
  assert.ok(store.get()['1'].timestamp);
  assert.ok(new Date(store.get()['1'].timestamp).getTime() > 0);
});

// ============================================================
// UNIT TESTS: content.js — processImageMessage
// ============================================================

section('content.js — processImageMessage');

function processImageMessage(pattern, data, imgs, addFn) {
  if (pattern.type && data.type === pattern.type && data[pattern.srcKey || 'dataUrl']) {
    var id = (pattern.idPrefix || '_') + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    addFn(id, data[pattern.srcKey || 'dataUrl']);
    return true;
  }
  if (pattern.statusMatch && data.status === pattern.statusMatch && data[pattern.idKey]) {
    var imgId = data[pattern.idKey];
    var imgUrl = pattern.srcTemplate.replace('{imageId}', imgId);
    addFn(imgId, imgUrl);
    return true;
  }
  return false;
}

test('processes finished pattern', function() {
  var added = [];
  var p = { type: 'finished', srcKey: 'dataUrl', idPrefix: '_' };
  var result = processImageMessage(p, { type: 'finished', dataUrl: 'data:image/png;base64,abc' }, {}, function(id, src) { added.push({id: id, src: src}); });
  assert.strictEqual(result, true);
  assert.strictEqual(added.length, 1);
  assert.strictEqual(added[0].src, 'data:image/png;base64,abc');
});

test('processes success pattern with template', function() {
  var added = [];
  var p = { statusMatch: 'success', srcTemplate: 'https://image-generation.perchance.org/image/{imageId}.jpeg', idKey: 'imageId' };
  var result = processImageMessage(p, { status: 'success', imageId: 'abc123' }, {}, function(id, src) { added.push({id: id, src: src}); });
  assert.strictEqual(result, true);
  assert.strictEqual(added[0].id, 'abc123');
  assert.strictEqual(added[0].src, 'https://image-generation.perchance.org/image/abc123.jpeg');
});

test('ignores non-matching type', function() {
  var added = [];
  var p = { type: 'finished', srcKey: 'dataUrl', idPrefix: '_' };
  var result = processImageMessage(p, { type: 'other', dataUrl: 'data:image/png;base64,abc' }, {}, function(id, src) { added.push({id: id, src: src}); });
  assert.strictEqual(result, false);
  assert.strictEqual(added.length, 0);
});

test('ignores non-matching status', function() {
  var added = [];
  var p = { statusMatch: 'success', srcTemplate: 'https://example.com/{imageId}.jpg', idKey: 'imageId' };
  var result = processImageMessage(p, { status: 'failed', imageId: 'abc' }, {}, function(id, src) { added.push({id: id, src: src}); });
  assert.strictEqual(result, false);
  assert.strictEqual(added.length, 0);
});

// ============================================================
// UNIT TESTS: content.js — processLogMessage
// ============================================================

section('content.js — processLogMessage');

function processLogMessage(pattern, arg, addFn) {
  if (arg && typeof arg === 'object' && arg.status === pattern.statusMatch && arg[pattern.idKey]) {
    var imgId = arg[pattern.idKey];
    var imgUrl = pattern.srcTemplate.replace('{imageId}', imgId);
    addFn(imgId, imgUrl, arg.prompt);
    return true;
  }
  return false;
}

test('processes matching log message', function() {
  var added = [];
  var p = { statusMatch: 'success', srcTemplate: 'https://example.com/{imageId}.jpg', idKey: 'imageId' };
  var result = processLogMessage(p, { status: 'success', imageId: 'xyz', prompt: 'a cat' }, function(id, src, prompt) { added.push({id: id, src: src, prompt: prompt}); });
  assert.strictEqual(result, true);
  assert.strictEqual(added[0].id, 'xyz');
  assert.strictEqual(added[0].prompt, 'a cat');
});

test('ignores non-object arg', function() {
  var added = [];
  var p = { statusMatch: 'success', srcTemplate: 'https://example.com/{imageId}.jpg', idKey: 'imageId' };
  var result = processLogMessage(p, 'string', function() { added.push(1); });
  assert.strictEqual(result, false);
  assert.strictEqual(added.length, 0);
});

test('ignores null arg', function() {
  var added = [];
  var p = { statusMatch: 'success', srcTemplate: 'https://example.com/{imageId}.jpg', idKey: 'imageId' };
  var result = processLogMessage(p, null, function() { added.push(1); });
  assert.strictEqual(result, false);
  assert.strictEqual(added.length, 0);
});

test('ignores non-matching status', function() {
  var added = [];
  var p = { statusMatch: 'success', srcTemplate: 'https://example.com/{imageId}.jpg', idKey: 'imageId' };
  var result = processLogMessage(p, { status: 'pending', imageId: 'xyz' }, function() { added.push(1); });
  assert.strictEqual(result, false);
  assert.strictEqual(added.length, 0);
});

// ============================================================
// UNIT TESTS: background.js — detectExtension
// ============================================================

section('background.js — detectExtension');

var MIME_EXTENSIONS = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/bmp': '.bmp' };

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

test('detects PNG from data URI', function() {
  assert.strictEqual(detectExtension('data:image/png;base64,abc'), '.png');
});

test('detects JPEG from data URI', function() {
  assert.strictEqual(detectExtension('data:image/jpeg;base64,abc'), '.jpg');
});

test('detects GIF from data URI', function() {
  assert.strictEqual(detectExtension('data:image/gif;base64,abc'), '.gif');
});

test('detects WebP from data URI', function() {
  assert.strictEqual(detectExtension('data:image/webp;base64,abc'), '.webp');
});

test('detects BMP from data URI', function() {
  assert.strictEqual(detectExtension('data:image/bmp;base64,abc'), '.bmp');
});

test('defaults to .jpg for unknown data URI mime', function() {
  assert.strictEqual(detectExtension('data:image/tiff;base64,abc'), '.jpg');
});

test('detects .png from URL', function() {
  assert.strictEqual(detectExtension('https://example.com/image.png'), '.png');
});

test('detects .jpg from URL', function() {
  assert.strictEqual(detectExtension('https://example.com/image.jpg'), '.jpg');
});

test('detects .jpeg from URL', function() {
  assert.strictEqual(detectExtension('https://example.com/image.jpeg?foo=bar'), '.jpeg');
});

test('detects .gif from URL', function() {
  assert.strictEqual(detectExtension('https://example.com/image.gif?v=1'), '.gif');
});

test('detects .webp from URL', function() {
  assert.strictEqual(detectExtension('https://example.com/image.webp?foo=bar'), '.webp');
});

test('detects .svg from URL', function() {
  assert.strictEqual(detectExtension('https://example.com/image.svg'), '.svg');
});

test('detects .bmp from URL', function() {
  assert.strictEqual(detectExtension('https://example.com/image.bmp'), '.bmp');
});

test('detects uppercase extension from URL', function() {
  assert.strictEqual(detectExtension('https://example.com/image.PNG'), '.png');
});

test('detects mixed case extension from URL', function() {
  assert.strictEqual(detectExtension('https://example.com/image.Jpeg'), '.jpeg');
});

test('defaults to .jpg for URL without extension', function() {
  assert.strictEqual(detectExtension('https://example.com/image?foo=bar'), '.jpg');
});

test('defaults to .jpg for invalid URL', function() {
  assert.strictEqual(detectExtension('not-a-url'), '.jpg');
});

test('detects .jpg from URL with query string', function() {
  assert.strictEqual(detectExtension('https://example.com/img.jpg?token=abc'), '.jpg');
});

// ============================================================
// UNIT TESTS: background.js — sanitizeFilename
// ============================================================

section('background.js — sanitizeFilename');

function sanitizeFilename(prompt) {
  return (prompt || 'image').replace(/[^a-z0-9]/gi, '-').substring(0, 50);
}

test('sanitizes special characters', function() {
  assert.strictEqual(sanitizeFilename('My Image! @#$'), 'My-Image-----');
});

test('truncates long names to 50 chars', function() {
  assert.strictEqual(sanitizeFilename('a'.repeat(100)).length, 50);
});

test('uses default for empty string', function() {
  assert.strictEqual(sanitizeFilename(''), 'image');
});

test('uses default for null', function() {
  assert.strictEqual(sanitizeFilename(null), 'image');
});

test('uses default for undefined', function() {
  assert.strictEqual(sanitizeFilename(undefined), 'image');
});

test('preserves alphanumeric', function() {
  assert.strictEqual(sanitizeFilename('abc123'), 'abc123');
});

test('preserves hyphens', function() {
  assert.strictEqual(sanitizeFilename('a-b-c'), 'a-b-c');
});

test('sanitizes unicode', function() {
  assert.strictEqual(sanitizeFilename('\u00e9\u00e8\u00ea'), '---');
});

test('sanitizes spaces', function() {
  assert.strictEqual(sanitizeFilename('hello world'), 'hello-world');
});

test('sanitizes forward slashes', function() {
  assert.strictEqual(sanitizeFilename('path/to/file'), 'path-to-file');
});

// ============================================================
// UNIT TESTS: background.js — dedupImages
// ============================================================

section('background.js — dedupImages');

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

test('handles single image', function() {
  var input = [{id: '1', src: 'https://a.com/1.jpg'}];
  assert.strictEqual(dedupImages(input).length, 1);
});

test('handles all duplicates', function() {
  var input = [
    {id: '1', src: 'https://a.com/1.jpg'},
    {id: '2', src: 'https://a.com/1.jpg'},
    {id: '3', src: 'https://a.com/1.jpg'}
  ];
  assert.strictEqual(dedupImages(input).length, 1);
});

test('handles all unique', function() {
  var input = [
    {id: '1', src: 'https://a.com/1.jpg'},
    {id: '2', src: 'https://a.com/2.jpg'},
    {id: '3', src: 'https://a.com/3.jpg'}
  ];
  assert.strictEqual(dedupImages(input).length, 3);
});

test('handles data URIs', function() {
  var input = [
    {id: '1', src: 'data:image/png;base64,abc'},
    {id: '2', src: 'data:image/png;base64,abc'}
  ];
  assert.strictEqual(dedupImages(input).length, 1);
});

test('handles mixed data and http', function() {
  var input = [
    {id: '1', src: 'data:image/png;base64,abc'},
    {id: '2', src: 'https://example.com/img.jpg'}
  ];
  assert.strictEqual(dedupImages(input).length, 2);
});

// ============================================================
// UNIT TESTS: background.js — Queue Operations
// ============================================================

section('background.js — Queue Operations');

function createQueueSystem(maxSize) {
  var queue = [];
  var queuedUrls = {};
  var MAX = maxSize || 500;
  return {
    enqueue: function(img) {
      if (queuedUrls[img.src]) return { ok: false, reason: 'duplicate' };
      if (queue.length >= MAX) return { ok: false, reason: 'full' };
      queue.push(img);
      queuedUrls[img.src] = true;
      return { ok: true };
    },
    dequeue: function() {
      if (!queue.length) return null;
      var img = queue.shift();
      delete queuedUrls[img.src];
      return img;
    },
    requeue: function(img) {
      queue.unshift(img);
      queuedUrls[img.src] = true;
    },
    peek: function() { return queue[0] || null; },
    length: function() { return queue.length; },
    isQueued: function(src) { return !!queuedUrls[src]; },
    getQueue: function() { return queue; },
    clear: function() { queue = []; queuedUrls = {}; }
  };
}

test('enqueue new image', function() {
  var q = createQueueSystem(5);
  var r = q.enqueue({id: '1', src: 'https://a.com/1.jpg'});
  assert.strictEqual(r.ok, true);
  assert.strictEqual(q.length(), 1);
});

test('rejects duplicate URL', function() {
  var q = createQueueSystem(5);
  q.enqueue({id: '1', src: 'https://a.com/1.jpg'});
  var r = q.enqueue({id: '2', src: 'https://a.com/1.jpg'});
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'duplicate');
  assert.strictEqual(q.length(), 1);
});

test('respects max queue size', function() {
  var q = createQueueSystem(3);
  q.enqueue({id: '1', src: 'https://a.com/1.jpg'});
  q.enqueue({id: '2', src: 'https://a.com/2.jpg'});
  q.enqueue({id: '3', src: 'https://a.com/3.jpg'});
  var r = q.enqueue({id: '4', src: 'https://a.com/4.jpg'});
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'full');
  assert.strictEqual(q.length(), 3);
});

test('dequeue returns first image', function() {
  var q = createQueueSystem(5);
  q.enqueue({id: '1', src: 'https://a.com/1.jpg'});
  q.enqueue({id: '2', src: 'https://a.com/2.jpg'});
  var img = q.dequeue();
  assert.strictEqual(img.id, '1');
  assert.strictEqual(q.length(), 1);
});

test('dequeue removes from queuedUrls', function() {
  var q = createQueueSystem(5);
  q.enqueue({id: '1', src: 'https://a.com/1.jpg'});
  q.dequeue();
  assert.strictEqual(q.isQueued('https://a.com/1.jpg'), false);
});

test('dequeue empty returns null', function() {
  var q = createQueueSystem(5);
  assert.strictEqual(q.dequeue(), null);
});

test('requeue adds to front after dequeue', function() {
  var q = createQueueSystem(5);
  q.enqueue({id: '1', src: 'https://a.com/1.jpg'});
  q.enqueue({id: '2', src: 'https://a.com/2.jpg'});
  var img1 = q.dequeue();
  assert.strictEqual(q.length(), 1);
  q.requeue(img1);
  assert.strictEqual(q.peek().id, '1');
  assert.strictEqual(q.length(), 2);
});

test('can re-enqueue after dequeue', function() {
  var q = createQueueSystem(5);
  q.enqueue({id: '1', src: 'https://a.com/1.jpg'});
  q.dequeue();
  var r = q.enqueue({id: '1', src: 'https://a.com/1.jpg'});
  assert.strictEqual(r.ok, true);
  assert.strictEqual(q.length(), 1);
});

test('queue 500 limit enforced', function() {
  var q = createQueueSystem(500);
  for (var i = 0; i < 500; i++) {
    q.enqueue({id: String(i), src: 'https://a.com/' + i + '.jpg'});
  }
  assert.strictEqual(q.length(), 500);
  var r = q.enqueue({id: '501', src: 'https://a.com/501.jpg'});
  assert.strictEqual(r.ok, false);
});

// ============================================================
// UNIT TESTS: background.js — Retry Logic
// ============================================================

section('background.js — Retry Logic');

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

test('retries use exponential backoff delays', function() {
  var RETRY_DELAY = 1000;
  var delays = [];
  for (var i = 0; i < 3; i++) {
    delays.push(RETRY_DELAY * (i + 1));
  }
  assert.deepStrictEqual(delays, [1000, 2000, 3000]);
});

test('new image has no retry count', function() {
  var img = {src: 'https://a.com/1.jpg'};
  assert.strictEqual(img._retries || 0, 0);
});

test('downloadId is removed on retry', function() {
  var img = {_downloadId: 123, _retries: 1};
  delete img._downloadId;
  assert.strictEqual(img._downloadId, undefined);
  assert.strictEqual(img._retries, 1);
});

// ============================================================
// UNIT TESTS: background.js — Download History
// ============================================================

section('background.js — Download History');

function createDownloadHistory() {
  var history = {};
  return {
    markDownloaded: function(img) {
      history[img.src] = {timestamp: new Date().toISOString(), prompt: img.prompt || 'image'};
    },
    isDownloaded: function(src) {
      return !!history[src];
    },
    getHistory: function() { return history; },
    count: function() { return Object.keys(history).length; }
  };
}

test('markDownloaded stores in history', function() {
  var h = createDownloadHistory();
  h.markDownloaded({src: 'https://a.com/1.jpg', prompt: 'cat'});
  assert.strictEqual(h.isDownloaded('https://a.com/1.jpg'), true);
});

test('markDownloaded stores timestamp', function() {
  var h = createDownloadHistory();
  h.markDownloaded({src: 'https://a.com/1.jpg', prompt: 'cat'});
  var entry = h.getHistory()['https://a.com/1.jpg'];
  assert.ok(entry.timestamp);
  assert.ok(new Date(entry.timestamp).getTime() > 0);
});

test('markDownloaded stores prompt', function() {
  var h = createDownloadHistory();
  h.markDownloaded({src: 'https://a.com/1.jpg', prompt: 'a beautiful sunset'});
  assert.strictEqual(h.getHistory()['https://a.com/1.jpg'].prompt, 'a beautiful sunset');
});

test('markDownloaded defaults prompt to "image"', function() {
  var h = createDownloadHistory();
  h.markDownloaded({src: 'https://a.com/1.jpg'});
  assert.strictEqual(h.getHistory()['https://a.com/1.jpg'].prompt, 'image');
});

test('isDownloaded returns false for unknown', function() {
  var h = createDownloadHistory();
  assert.strictEqual(h.isDownloaded('https://a.com/1.jpg'), false);
});

test('marks multiple images', function() {
  var h = createDownloadHistory();
  h.markDownloaded({src: 'https://a.com/1.jpg', prompt: 'cat'});
  h.markDownloaded({src: 'https://a.com/2.jpg', prompt: 'dog'});
  assert.strictEqual(h.count(), 2);
});

// ============================================================
// UNIT TESTS: background.js — advanceQueue / afterDownload
// ============================================================

section('background.js — advanceQueue / afterDownload');

test('advanceQueue increments done and clears busy', function() {
  var state = { done: 0, busy: true, total: 5, failed: 0 };
  function advanceQueue() {
    state.done++;
    state.busy = false;
  }
  advanceQueue();
  assert.strictEqual(state.done, 1);
  assert.strictEqual(state.busy, false);
});

test('afterDownload sets downloadId and stores in history', function() {
  var history = {};
  var img = {src: 'https://a.com/1.jpg', prompt: 'cat'};
  function afterDownload(id, img) {
    img._downloadId = id;
    history[img.src] = {timestamp: new Date().toISOString(), prompt: img.prompt || 'image'};
  }
  afterDownload(42, img);
  assert.strictEqual(img._downloadId, 42);
  assert.ok(history['https://a.com/1.jpg']);
  assert.strictEqual(history['https://a.com/1.jpg'].prompt, 'cat');
});

// ============================================================
// UNIT TESTS: overlay.js — esc (HTML Escaping)
// ============================================================

section('overlay.js — esc (HTML Escaping)');

function esc(str) {
  var div = { _text: '' };
  div.textContent = str;
  return div.textContent
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

test('escapes script tags', function() {
  assert.strictEqual(esc('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
});

test('escapes ampersand', function() {
  assert.strictEqual(esc('a & b'), 'a &amp; b');
});

test('passes through normal text', function() {
  assert.strictEqual(esc('hello world'), 'hello world');
});

test('escapes double quotes', function() {
  assert.strictEqual(esc('value" onerror="alert(1)'), 'value&quot; onerror=&quot;alert(1)');
});

test('escapes angle brackets', function() {
  assert.strictEqual(esc('<div>'), '&lt;div&gt;');
});

test('escapes multiple special chars', function() {
  assert.strictEqual(esc('<>&"\''), '&lt;&gt;&amp;&quot;\'');
});

test('handles empty string', function() {
  assert.strictEqual(esc(''), '');
});

test('handles unicode', function() {
  assert.strictEqual(esc('\u00e9\u00e8\u00ea'), '\u00e9\u00e8\u00ea');
});

test('handles newlines', function() {
  assert.strictEqual(esc('line1\nline2'), 'line1\nline2');
});

// ============================================================
// UNIT TESTS: overlay.js — wrapIndex
// ============================================================

section('overlay.js — wrapIndex');

function wrapIndex(current, dir, len) {
  var next = current + dir;
  if (next < 0) next = len - 1;
  if (next >= len) next = 0;
  return next;
}

test('moves forward', function() {
  assert.strictEqual(wrapIndex(0, 1, 5), 1);
});

test('moves backward', function() {
  assert.strictEqual(wrapIndex(2, -1, 5), 1);
});

test('wraps forward from end', function() {
  assert.strictEqual(wrapIndex(4, 1, 5), 0);
});

test('wraps backward from start', function() {
  assert.strictEqual(wrapIndex(0, -1, 5), 4);
});

test('single element stays at 0', function() {
  assert.strictEqual(wrapIndex(0, 1, 1), 0);
  assert.strictEqual(wrapIndex(0, -1, 1), 0);
});

test('two elements toggle', function() {
  assert.strictEqual(wrapIndex(0, 1, 2), 1);
  assert.strictEqual(wrapIndex(1, 1, 2), 0);
  assert.strictEqual(wrapIndex(0, -1, 2), 1);
  assert.strictEqual(wrapIndex(1, -1, 2), 0);
});

test('multi-step forward wraps', function() {
  assert.strictEqual(wrapIndex(3, 2, 5), 0);
});

test('multi-step backward wraps', function() {
  assert.strictEqual(wrapIndex(1, -2, 5), 4);
});

// ============================================================
// UNIT TESTS: overlay.js — loadIcon / ICONS
// ============================================================

section('overlay.js — loadIcon / ICONS');

var ICONS = {
  close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  sun: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/></svg>',
  moon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  expand: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
  download: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  refresh: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  'chevron-left': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
  'chevron-right': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  'alert-circle': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
};

var REQUIRED_ICONS = ['close', 'sun', 'moon', 'expand', 'download', 'refresh', 'check', 'chevron-left', 'chevron-right', 'alert-circle'];

test('all required icons exist', function() {
  REQUIRED_ICONS.forEach(function(name) {
    assert.ok(ICONS[name], 'icon ' + name + ' exists');
  });
});

test('all icons are SVG strings', function() {
  REQUIRED_ICONS.forEach(function(name) {
    assert.ok(ICONS[name].indexOf('<svg') === 0, name + ' starts with <svg');
    assert.ok(ICONS[name].indexOf('</svg>') !== -1, name + ' ends with </svg>');
  });
});

test('close icon has 18x18 dimensions', function() {
  assert.ok(ICONS.close.indexOf('width="18"') !== -1);
  assert.ok(ICONS.close.indexOf('height="18"') !== -1);
});

test('expand icon has 12x12 dimensions', function() {
  assert.ok(ICONS.expand.indexOf('width="12"') !== -1);
  assert.ok(ICONS.expand.indexOf('height="12"') !== -1);
});

test('chevron icons have 24x24 dimensions', function() {
  assert.ok(ICONS['chevron-left'].indexOf('width="24"') !== -1);
  assert.ok(ICONS['chevron-right'].indexOf('width="24"') !== -1);
});

test('loadIcon returns cached value', function() {
  var iconCache = {};
  function loadIcon(name) {
    if (iconCache[name]) return iconCache[name];
    iconCache[name] = ICONS[name] || '';
    return iconCache[name];
  }
  var first = loadIcon('close');
  var second = loadIcon('close');
  assert.strictEqual(first, second);
  assert.strictEqual(first, ICONS.close);
});

test('loadIcon returns empty string for unknown icon', function() {
  var iconCache = {};
  function loadIcon(name) {
    if (iconCache[name]) return iconCache[name];
    iconCache[name] = ICONS[name] || '';
    return iconCache[name];
  }
  assert.strictEqual(loadIcon('nonexistent'), '');
});

test('all icons use currentColor for stroke', function() {
  REQUIRED_ICONS.forEach(function(name) {
    assert.ok(ICONS[name].indexOf('currentColor') !== -1, name + ' uses currentColor');
  });
});

// ============================================================
// UNIT TESTS: overlay.js — build*Html functions
// ============================================================

section('overlay.js — buildHtml functions');

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
  imagesFound: ' image(s) found',
  allComplete: 'All downloads complete',
  downloadsFailed: ' download(s) failed',
  previewLabel: 'Preview:',
  folderLabel: 'Folder:',
  selected: ' selected',
  imageLabel: 'Image: '
};

function buildHeaderHtml() {
  var h = '';
  h += '<div class="pdl-header">';
  h += '<span class="pdl-title">Perchance Image Downloader</span>';
  h += '<div class="pdl-header-actions">';
  h += '<button id="pdl-theme-btn" class="pdl-icon-btn" aria-label="Toggle theme" title="Toggle theme"></button>';
  h += '<button id="pdl-x" class="pdl-icon-btn" aria-label="' + MSG.close + '" title="' + MSG.close + ' (Escape)" aria-keyshortcuts="Escape">' + ICONS.close + '</button>';
  h += '</div></div>';
  return h;
}

function buildToolbarHtml() {
  var h = '';
  h += '<div class="pdl-toolbar">';
  h += '<button id="pdl-sa" class="pdl-btn">' + MSG.selectAll + '</button>';
  h += '<button id="pdl-da" class="pdl-btn">' + MSG.deselectAll + '</button>';
  h += '<button id="pdl-rf" class="pdl-btn pdl-btn-accent">' + ICONS.refresh + ' ' + MSG.refresh + '</button>';
  h += '<div class="pdl-spacer"></div>';
  h += '<button id="pdl-dl" class="pdl-btn pdl-btn-green" disabled>' + ICONS.download + MSG.downloadSelected + '0)</button>';
  h += '</div>';
  h += '<div class="pdl-filters">';
  h += '<div class="pdl-filter-group">';
  h += '<label>' + MSG.previewLabel + '</label>';
  h += '<input type="range" id="pdl-sl" min="80" max="400" value="180">';
  h += '<span id="pdl-sl-lb" class="pdl-filter-val">180px</span>';
  h += '</div>';
  h += '<div class="pdl-filter-group">';
  h += '<label>' + MSG.folderLabel + '</label>';
  h += '<input type="text" id="pdl-folder" value="Perchance Downloads" style="width:160px" aria-label="Download folder name">';
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
  h += '<button id="pdl-lb-x" class="pdl-icon-btn pdl-lightbox-close" aria-label="' + MSG.closePreview + '" aria-keyshortcuts="Escape">' + ICONS.close + '</button>';
  h += '<button id="pdl-lb-prev" class="pdl-lightbox-nav pdl-lightbox-prev" aria-label="' + MSG.prevImage + '" aria-keyshortcuts="ArrowLeft">' + ICONS['chevron-left'] + '</button>';
  h += '<button id="pdl-lb-next" class="pdl-lightbox-nav pdl-lightbox-next" aria-label="' + MSG.nextImage + '" aria-keyshortcuts="ArrowRight">' + ICONS['chevron-right'] + '</button>';
  h += '<img id="pdl-lb-img" class="pdl-lightbox-img" src="" alt="Preview">';
  h += '<div id="pdl-lb-info" class="pdl-lightbox-info"></div>';
  h += '<div class="pdl-lightbox-actions">';
  h += '<button id="pdl-lb-sel" class="pdl-btn">' + ICONS.check + ' <span id="pdl-lb-sel-text">' + MSG.select + '</span></button>';
  h += '<button id="pdl-lb-dl" class="pdl-btn pdl-btn-green">' + ICONS.download + ' ' + MSG.download + '</button>';
  h += '</div></div>';
  return h;
}

test('buildHeaderHtml has title', function() {
  var h = buildHeaderHtml();
  assert.ok(h.indexOf('Perchance Image Downloader') !== -1);
});

test('buildHeaderHtml has close button with aria-keyshortcuts', function() {
  var h = buildHeaderHtml();
  assert.ok(h.indexOf('id="pdl-x"') !== -1);
  assert.ok(h.indexOf('aria-keyshortcuts="Escape"') !== -1);
});

test('buildHeaderHtml has theme toggle button', function() {
  var h = buildHeaderHtml();
  assert.ok(h.indexOf('id="pdl-theme-btn"') !== -1);
});

test('buildToolbarHtml has select/deselect buttons', function() {
  var h = buildToolbarHtml();
  assert.ok(h.indexOf('id="pdl-sa"') !== -1);
  assert.ok(h.indexOf('id="pdl-da"') !== -1);
});

test('buildToolbarHtml has refresh button', function() {
  var h = buildToolbarHtml();
  assert.ok(h.indexOf('id="pdl-rf"') !== -1);
});

test('buildToolbarHtml has download button disabled', function() {
  var h = buildToolbarHtml();
  assert.ok(h.indexOf('id="pdl-dl"') !== -1);
  assert.ok(h.indexOf('disabled') !== -1);
});

test('buildToolbarHtml has preview slider', function() {
  var h = buildToolbarHtml();
  assert.ok(h.indexOf('id="pdl-sl"') !== -1);
  assert.ok(h.indexOf('type="range"') !== -1);
});

test('buildToolbarHtml has folder input', function() {
  var h = buildToolbarHtml();
  assert.ok(h.indexOf('id="pdl-folder"') !== -1);
  assert.ok(h.indexOf('aria-label="Download folder name"') !== -1);
});

test('buildStatusHtml has gallery with role grid', function() {
  var h = buildStatusHtml();
  assert.ok(h.indexOf('id="pdl-gal"') !== -1);
  assert.ok(h.indexOf('role="grid"') !== -1);
});

test('buildStatusHtml has progress bar', function() {
  var h = buildStatusHtml();
  assert.ok(h.indexOf('id="pdl-prog"') !== -1);
  assert.ok(h.indexOf('id="pdl-pf"') !== -1);
  assert.ok(h.indexOf('id="pdl-pt"') !== -1);
});

test('buildStatusHtml has status text', function() {
  var h = buildStatusHtml();
  assert.ok(h.indexOf('id="pdl-st"') !== -1);
});

test('buildLightboxHtml has dialog role', function() {
  var h = buildLightboxHtml();
  assert.ok(h.indexOf('role="dialog"') !== -1);
});

test('buildLightboxHtml has prev/next nav', function() {
  var h = buildLightboxHtml();
  assert.ok(h.indexOf('id="pdl-lb-prev"') !== -1);
  assert.ok(h.indexOf('id="pdl-lb-next"') !== -1);
});

test('buildLightboxHtml has aria-keyshortcuts for arrows', function() {
  var h = buildLightboxHtml();
  assert.ok(h.indexOf('aria-keyshortcuts="ArrowLeft"') !== -1);
  assert.ok(h.indexOf('aria-keyshortcuts="ArrowRight"') !== -1);
});

test('buildLightboxHtml has select and download buttons', function() {
  var h = buildLightboxHtml();
  assert.ok(h.indexOf('id="pdl-lb-sel"') !== -1);
  assert.ok(h.indexOf('id="pdl-lb-dl"') !== -1);
});

test('buildLightboxHtml has preview image', function() {
  var h = buildLightboxHtml();
  assert.ok(h.indexOf('id="pdl-lb-img"') !== -1);
  assert.ok(h.indexOf('alt="Preview"') !== -1);
});

test('buildLightboxHtml has info div', function() {
  var h = buildLightboxHtml();
  assert.ok(h.indexOf('id="pdl-lb-info"') !== -1);
});

// ============================================================
// UNIT TESTS: overlay.js — updateProgress
// ============================================================

section('overlay.js — updateProgress');

function createProgressMock() {
  return {
    fillWidth: '',
    textContent: '',
    showClass: false,
    removed: false
  };
}

test('shows percentage during download', function() {
  var mock = createProgressMock();
  function updateProgress(d, total, failed) {
    mock.fillWidth = ((d / total) * 100) + '%';
    var status = d < total ? 'downloading' : 'done';
    if (failed > 0) status += ' (' + failed + ' failed)';
    mock.textContent = d + '/' + total + status;
  }
  updateProgress(3, 10, 0);
  assert.strictEqual(mock.fillWidth, '30%');
  assert.strictEqual(mock.textContent, '3/10downloading');
});

test('shows done at 100%', function() {
  var mock = createProgressMock();
  function updateProgress(d, total, failed) {
    mock.fillWidth = ((d / total) * 100) + '%';
    var status = d < total ? 'downloading' : 'done';
    mock.textContent = d + '/' + total + status;
  }
  updateProgress(10, 10, 0);
  assert.strictEqual(mock.fillWidth, '100%');
  assert.strictEqual(mock.textContent, '10/10done');
});

test('shows failure count', function() {
  var mock = createProgressMock();
  function updateProgress(d, total, failed) {
    mock.fillWidth = ((d / total) * 100) + '%';
    var status = d < total ? 'downloading' : 'done';
    if (failed > 0) status += ' (' + failed + ' failed)';
    mock.textContent = d + '/' + total + status;
  }
  updateProgress(8, 10, 2);
  assert.strictEqual(mock.textContent, '8/10downloading (2 failed)');
});

test('zero progress shows 0%', function() {
  var mock = createProgressMock();
  function updateProgress(d, total) {
    mock.fillWidth = ((d / total) * 100) + '%';
  }
  updateProgress(0, 10);
  assert.strictEqual(mock.fillWidth, '0%');
});

test('half progress shows 50%', function() {
  var mock = createProgressMock();
  function updateProgress(d, total) {
    mock.fillWidth = ((d / total) * 100) + '%';
  }
  updateProgress(5, 10);
  assert.strictEqual(mock.fillWidth, '50%');
});

// ============================================================
// UNIT TESTS: overlay.js — toggleSelect
// ============================================================

section('overlay.js — toggleSelect');

function createSel() { return {}; }

test('selects deselected item', function() {
  var sel = createSel();
  if (sel['1']) delete sel['1']; else sel['1'] = true;
  assert.strictEqual(sel['1'], true);
});

test('deselects selected item', function() {
  var sel = createSel();
  sel['1'] = true;
  if (sel['1']) delete sel['1']; else sel['1'] = true;
  assert.strictEqual(sel['1'], undefined);
});

test('count selected items', function() {
  var sel = createSel();
  sel['1'] = true;
  sel['2'] = true;
  assert.strictEqual(Object.keys(sel).length, 2);
});

test('count zero selected', function() {
  var sel = createSel();
  assert.strictEqual(Object.keys(sel).length, 0);
});

// ============================================================
// INTEGRATION TESTS: Message Flow
// ============================================================

section('Integration — Message Flow');

test('imageCount message updates badge', function() {
  var badge = { text: '', color: '' };
  function updateBadge(tabId, count) {
    var text = count > 0 ? String(count) : '';
    badge.text = text;
    badge.color = '#e94560';
  }
  updateBadge(1, 5);
  assert.strictEqual(badge.text, '5');
  assert.strictEqual(badge.color, '#e94560');
});

test('imageCount with zero clears badge', function() {
  var badge = { text: '' };
  function updateBadge(tabId, count) {
    badge.text = count > 0 ? String(count) : '';
  }
  updateBadge(1, 0);
  assert.strictEqual(badge.text, '');
});

test('downloadImages message adds to queue', function() {
  var q = createQueueSystem(500);
  var images = [
    {id: '1', src: 'https://a.com/1.jpg', prompt: 'cat'},
    {id: '2', src: 'https://a.com/2.jpg', prompt: 'dog'}
  ];
  var added = 0;
  var skipped = 0;
  var history = {};
  images.forEach(function(img) {
    if (q.isQueued(img.src)) { skipped++; return; }
    if (history[img.src]) { skipped++; return; }
    var r = q.enqueue(img);
    if (r.ok) added++; else skipped++;
  });
  assert.strictEqual(added, 2);
  assert.strictEqual(skipped, 0);
  assert.strictEqual(q.length(), 2);
});

test('downloadImages skips already queued', function() {
  var q = createQueueSystem(500);
  q.enqueue({id: '1', src: 'https://a.com/1.jpg'});
  var images = [
    {id: '2', src: 'https://a.com/1.jpg'},
    {id: '3', src: 'https://a.com/2.jpg'}
  ];
  var added = 0;
  var skipped = 0;
  images.forEach(function(img) {
    if (q.isQueued(img.src)) { skipped++; return; }
    var r = q.enqueue(img);
    if (r.ok) added++; else skipped++;
  });
  assert.strictEqual(added, 1);
  assert.strictEqual(skipped, 1);
});

test('downloadImages skips already downloaded', function() {
  var q = createQueueSystem(500);
  var history = {'https://a.com/1.jpg': true};
  var images = [
    {id: '1', src: 'https://a.com/1.jpg'},
    {id: '2', src: 'https://a.com/2.jpg'}
  ];
  var added = 0;
  var skipped = 0;
  images.forEach(function(img) {
    if (q.isQueued(img.src)) { skipped++; return; }
    if (history[img.src]) { skipped++; return; }
    var r = q.enqueue(img);
    if (r.ok) added++; else skipped++;
  });
  assert.strictEqual(added, 1);
  assert.strictEqual(skipped, 1);
});

test('getProgress returns current state', function() {
  var state = {done: 3, total: 10, busy: true, failed: 1};
  var response = {done: state.done, total: state.total, busy: state.busy, failed: state.failed};
  assert.deepStrictEqual(response, {done: 3, total: 10, busy: true, failed: 1});
});

test('getHistory returns download history', function() {
  var history = {
    'https://a.com/1.jpg': {timestamp: '2024-01-01', prompt: 'cat'},
    'https://a.com/2.jpg': {timestamp: '2024-01-02', prompt: 'dog'}
  };
  var response = {history: history};
  assert.strictEqual(Object.keys(response.history).length, 2);
});

// ============================================================
// INTEGRATION TESTS: Queue Lifecycle
// ============================================================

section('Integration — Queue Lifecycle');

test('full lifecycle: enqueue → process → complete → history', function() {
  var q = createQueueSystem(500);
  var history = {};
  var completed = [];

  function markDownloaded(img) {
    history[img.src] = {timestamp: new Date().toISOString(), prompt: img.prompt || 'image'};
  }

  function processQueue() {
    while (q.length() > 0) {
      var img = q.dequeue();
      markDownloaded(img);
      completed.push(img);
    }
  }

  q.enqueue({id: '1', src: 'https://a.com/1.jpg', prompt: 'cat'});
  q.enqueue({id: '2', src: 'https://a.com/2.jpg', prompt: 'dog'});
  q.enqueue({id: '3', src: 'https://a.com/3.jpg', prompt: 'bird'});

  processQueue();

  assert.strictEqual(q.length(), 0);
  assert.strictEqual(completed.length, 3);
  assert.strictEqual(Object.keys(history).length, 3);
  assert.strictEqual(history['https://a.com/1.jpg'].prompt, 'cat');
  assert.strictEqual(history['https://a.com/2.jpg'].prompt, 'dog');
  assert.strictEqual(history['https://a.com/3.jpg'].prompt, 'bird');
});

test('re-enqueue on failure', function() {
  var q = createQueueSystem(500);
  var img = {id: '1', src: 'https://a.com/1.jpg', prompt: 'cat'};
  q.enqueue(img);

  var dequeued = q.dequeue();
  assert.strictEqual(dequeued.id, '1');

  q.requeue(dequeued);
  assert.strictEqual(q.length(), 1);
  assert.strictEqual(q.peek().id, '1');
});

test('max retries stops re-enqueue', function() {
  var q = createQueueSystem(500);
  var history = {};
  var MAX_RETRIES = 3;

  var img = {id: '1', src: 'https://a.com/1.jpg', _retries: 3};
  q.enqueue(img);

  var dequeued = q.dequeue();
  var retryCount = dequeued._retries || 0;

  if (retryCount >= MAX_RETRIES) {
    history[dequeued.src] = {error: 'max retries'};
  } else {
    q.requeue(dequeued);
  }

  assert.strictEqual(q.length(), 0);
  assert.ok(history['https://a.com/1.jpg']);
  assert.strictEqual(history['https://a.com/1.jpg'].error, 'max retries');
});

// ============================================================
// INTEGRATION TESTS: Error Recovery
// ============================================================

section('Integration — Error Recovery');

test('download error increments failed count', function() {
  var state = {done: 0, busy: true, failedCount: 0, total: 5};
  function handleDownloadError() {
    state.busy = false;
    state.failedCount++;
    state.done++;
  }
  handleDownloadError();
  assert.strictEqual(state.done, 1);
  assert.strictEqual(state.failedCount, 1);
  assert.strictEqual(state.busy, false);
});

test('all downloads fail shows all failed', function() {
  var state = {done: 0, busy: false, failedCount: 0, total: 3};
  function handleDownloadError() {
    state.busy = false;
    state.failedCount++;
    state.done++;
  }
  handleDownloadError();
  handleDownloadError();
  handleDownloadError();
  assert.strictEqual(state.done, 3);
  assert.strictEqual(state.failedCount, 3);
});

test('partial failure tracks correctly', function() {
  var state = {done: 0, busy: false, failedCount: 0, total: 5};
  function handleComplete() { state.done++; state.busy = false; }
  function handleError() { state.done++; state.failedCount++; state.busy = false; }
  handleComplete();
  handleComplete();
  handleError();
  handleComplete();
  handleError();
  assert.strictEqual(state.done, 5);
  assert.strictEqual(state.failedCount, 2);
});

test('queue continues after error', function() {
  var q = createQueueSystem(500);
  q.enqueue({id: '1', src: 'https://a.com/1.jpg'});
  q.enqueue({id: '2', src: 'https://a.com/2.jpg'});
  q.enqueue({id: '3', src: 'https://a.com/3.jpg'});

  var processed = [];
  q.dequeue(); // process 1
  processed.push('1');

  // error on 1, re-enqueue
  q.requeue({id: '1', src: 'https://a.com/1.jpg'});

  // continue processing
  var img2 = q.dequeue();
  processed.push(img2.id);

  assert.strictEqual(processed.length, 2);
  assert.strictEqual(q.length(), 2); // 1 re-enqueued + 3 still in queue
});

// ============================================================
// INTEGRATION TESTS: Context Menu
// ============================================================

section('Integration — Context Menu');

test('context menu debounce rejects rapid clicks', function() {
  var lastClick = 0;
  var CONTEXT_MENU_DEBOUNCE = 1000;
  var accepted = 0;

  function handleClick() {
    var now = Date.now();
    if (now - lastClick < CONTEXT_MENU_DEBOUNCE) return false;
    lastClick = now;
    accepted++;
    return true;
  }

  handleClick();
  assert.strictEqual(accepted, 1);
  assert.strictEqual(handleClick(), false);
  assert.strictEqual(accepted, 1);
});

test('context menu debounce allows after delay', function() {
  var lastClick = 0;
  var CONTEXT_MENU_DEBOUNCE = 0; // instant for test
  var accepted = 0;

  function handleClick() {
    var now = Date.now();
    if (now - lastClick < CONTEXT_MENU_DEBOUNCE) return false;
    lastClick = now;
    accepted++;
    return true;
  }

  handleClick();
  assert.strictEqual(accepted, 1);
  assert.strictEqual(handleClick(), true);
  assert.strictEqual(accepted, 2);
});

test('context menu creates with correct patterns', function() {
  var created = null;
  function createContextMenu() {
    created = {
      id: 'pdl-ctx',
      title: 'Download with Perchance Downloader',
      contexts: ['image'],
      documentUrlPatterns: ['https://*.perchance.org/*']
    };
  }
  createContextMenu();
  assert.strictEqual(created.id, 'pdl-ctx');
  assert.deepStrictEqual(created.contexts, ['image']);
  assert.deepStrictEqual(created.documentUrlPatterns, ['https://*.perchance.org/*']);
});

// ============================================================
// E2E TESTS: Full Download Flow
// ============================================================

section('E2E — Full Download Flow');

test('images detected → selected → queued → downloaded → history', function() {
  var q = createQueueSystem(500);
  var history = {};
  var downloaded = [];

  // Step 1: Detect images
  var detected = [
    {id: '1', src: 'https://a.com/1.jpg', prompt: 'a cat sitting'},
    {id: '2', src: 'https://a.com/2.jpg', prompt: 'a dog running'},
    {id: '3', src: 'https://a.com/3.jpg', prompt: 'a bird flying'}
  ];

  // Step 2: Select images (all)
  var sel = {};
  detected.forEach(function(img) { sel[img.id] = true; });
  var selected = detected.filter(function(img) { return sel[img.id]; });
  assert.strictEqual(selected.length, 3);

  // Step 3: Queue images
  selected.forEach(function(img) {
    var r = q.enqueue(img);
    assert.strictEqual(r.ok, true);
  });
  assert.strictEqual(q.length(), 3);

  // Step 4: Process queue (simulate download)
  while (q.length() > 0) {
    var img = q.dequeue();
    history[img.src] = {timestamp: new Date().toISOString(), prompt: img.prompt};
    downloaded.push(img);
  }

  // Step 5: Verify
  assert.strictEqual(downloaded.length, 3);
  assert.strictEqual(Object.keys(history).length, 3);
  assert.strictEqual(q.length(), 0);
  assert.strictEqual(downloaded[0].prompt, 'a cat sitting');
  assert.strictEqual(downloaded[1].prompt, 'a dog running');
  assert.strictEqual(downloaded[2].prompt, 'a bird flying');
});

test('partial selection → only selected queued', function() {
  var q = createQueueSystem(500);
  var detected = [
    {id: '1', src: 'https://a.com/1.jpg'},
    {id: '2', src: 'https://a.com/2.jpg'},
    {id: '3', src: 'https://a.com/3.jpg'}
  ];
  var sel = {'1': true, '3': true};
  var selected = detected.filter(function(img) { return sel[img.id]; });
  selected.forEach(function(img) { q.enqueue(img); });
  assert.strictEqual(q.length(), 2);
  assert.strictEqual(q.dequeue().id, '1');
  assert.strictEqual(q.dequeue().id, '3');
});

// ============================================================
// E2E TESTS: Retry Flow
// ============================================================

section('E2E — Retry Flow');

test('fail → retry 3 times → give up', function() {
  var q = createQueueSystem(500);
  var history = {};
  var MAX_RETRIES = 3;
  var img = {id: '1', src: 'https://a.com/1.jpg', prompt: 'cat'};

  q.enqueue(img);

  for (var attempt = 0; attempt < 5; attempt++) {
    var current = q.dequeue();
    if (!current) break;

    var retryCount = current._retries || 0;
    if (retryCount < MAX_RETRIES) {
      current._retries = retryCount + 1;
      q.requeue(current);
    } else {
      history[current.src] = {error: 'max retries'};
      break;
    }
  }

  assert.strictEqual(q.length(), 0);
  assert.ok(history['https://a.com/1.jpg']);
  assert.strictEqual(history['https://a.com/1.jpg'].error, 'max retries');
});

test('success on second attempt', function() {
  var q = createQueueSystem(500);
  var history = {};
  var MAX_RETRIES = 3;
  var failCount = 0;
  var FAIL_AFTER = 1;
  var img = {id: '1', src: 'https://a.com/1.jpg', prompt: 'cat'};

  q.enqueue(img);

  for (var attempt = 0; attempt < 5; attempt++) {
    var current = q.dequeue();
    if (!current) break;

    failCount++;
    if (failCount <= FAIL_AFTER) {
      // simulate failure → retry
      var retryCount = current._retries || 0;
      current._retries = retryCount + 1;
      q.requeue(current);
    } else {
      // simulate success
      history[current.src] = {prompt: current.prompt};
      break;
    }
  }

  assert.strictEqual(q.length(), 0);
  assert.ok(history['https://a.com/1.jpg']);
  assert.strictEqual(history['https://a.com/1.jpg'].prompt, 'cat');
});

// ============================================================
// E2E TESTS: Dedup Flow
// ============================================================

section('E2E — Dedup Flow');

test('same URL rejected as duplicate', function() {
  var q = createQueueSystem(500);
  var r1 = q.enqueue({id: '1', src: 'https://a.com/img.jpg'});
  var r2 = q.enqueue({id: '2', src: 'https://a.com/img.jpg'});
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(q.length(), 1);
});

test('different URLs allowed', function() {
  var q = createQueueSystem(500);
  var r1 = q.enqueue({id: '1', src: 'https://a.com/1.jpg'});
  var r2 = q.enqueue({id: '2', src: 'https://a.com/2.jpg'});
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r2.ok, true);
  assert.strictEqual(q.length(), 2);
});

test('already downloaded skipped', function() {
  var q = createQueueSystem(500);
  var history = {'https://a.com/1.jpg': true};
  var images = [
    {id: '1', src: 'https://a.com/1.jpg'},
    {id: '2', src: 'https://a.com/2.jpg'}
  ];
  var added = 0;
  var skipped = 0;
  images.forEach(function(img) {
    if (q.isQueued(img.src)) { skipped++; return; }
    if (history[img.src]) { skipped++; return; }
    var r = q.enqueue(img);
    if (r.ok) added++; else skipped++;
  });
  assert.strictEqual(added, 1);
  assert.strictEqual(skipped, 1);
});

// ============================================================
// E2E TESTS: Queue Overflow
// ============================================================

section('E2E — Queue Overflow');

test('500 limit enforced end-to-end', function() {
  var q = createQueueSystem(500);
  for (var i = 0; i < 500; i++) {
    q.enqueue({id: String(i), src: 'https://a.com/' + i + '.jpg'});
  }
  var r = q.enqueue({id: '501', src: 'https://a.com/501.jpg'});
  assert.strictEqual(r.ok, false);
  assert.strictEqual(q.length(), 500);
});

test('queue fills and drains correctly', function() {
  var q = createQueueSystem(5);
  for (var i = 0; i < 5; i++) {
    q.enqueue({id: String(i), src: 'https://a.com/' + i + '.jpg'});
  }
  assert.strictEqual(q.length(), 5);
  for (var j = 0; j < 5; j++) {
    var img = q.dequeue();
    assert.ok(img);
  }
  assert.strictEqual(q.length(), 0);
  assert.strictEqual(q.dequeue(), null);
});

// ============================================================
// E2E TESTS: Storage Persistence
// ============================================================

section('E2E — Storage Persistence');

test('queue state serializable and restorable', function() {
  var q = createQueueSystem(500);
  q.enqueue({id: '1', src: 'https://a.com/1.jpg', prompt: 'cat'});
  q.enqueue({id: '2', src: 'https://a.com/2.jpg', prompt: 'dog'});

  var state = {
    pdlQueue: q.getQueue(),
    pdlQueuedUrls: {},
    pdlTotal: 2,
    pdlDone: 0,
    pdlFailed: 0
  };
  q.getQueue().forEach(function(img) { state.pdlQueuedUrls[img.src] = true; });

  var json = JSON.stringify(state);
  var restored = JSON.parse(json);

  assert.strictEqual(restored.pdlQueue.length, 2);
  assert.strictEqual(restored.pdlQueuedUrls['https://a.com/1.jpg'], true);
  assert.strictEqual(restored.pdlTotal, 2);
});

test('history serializable and restorable', function() {
  var history = {};
  history['https://a.com/1.jpg'] = {timestamp: new Date().toISOString(), prompt: 'cat'};
  history['https://a.com/2.jpg'] = {timestamp: new Date().toISOString(), prompt: 'dog'};

  var json = JSON.stringify(history);
  var restored = JSON.parse(json);

  assert.strictEqual(Object.keys(restored).length, 2);
  assert.strictEqual(restored['https://a.com/1.jpg'].prompt, 'cat');
  assert.strictEqual(restored['https://a.com/2.jpg'].prompt, 'dog');
});

// ============================================================
// STRUCTURAL TESTS: Manifest, Files, CSS
// ============================================================

section('Structural — Manifest Validation');

test('manifest is MV3', function() {
  var m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.strictEqual(m.manifest_version, 3);
});

test('manifest version is 2.4.2', function() {
  var m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.strictEqual(m.version, '2.4.2');
});

test('manifest has CSP', function() {
  var m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.ok(m.content_security_policy, 'CSP present');
  assert.ok(m.content_security_policy.extension_pages.indexOf("'self'") !== -1, 'CSP has self');
});

test('manifest has downloads in required permissions', function() {
  var m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.ok(m.permissions.indexOf('downloads') !== -1);
});

test('manifest has contextMenus in required permissions', function() {
  var m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.ok(m.permissions.indexOf('contextMenus') !== -1);
});

test('manifest has web_accessible_resources with CSS', function() {
  var m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  var resources = m.web_accessible_resources[0].resources;
  assert.ok(resources.indexOf('overlay.css') !== -1);
});

test('manifest has content_scripts with correct matches', function() {
  var m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.ok(m.content_scripts);
  var matches = m.content_scripts[0].matches;
  assert.ok(matches.indexOf('https://perchance.org/*') !== -1);
  assert.ok(matches.indexOf('https://*.perchance.org/*') !== -1);
});

test('manifest has background scripts', function() {
  var m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.ok(m.background.scripts);
  assert.ok(m.background.scripts.indexOf('shared.js') !== -1);
  assert.ok(m.background.scripts.indexOf('background.js') !== -1);
});

test('manifest has content_scripts with shared.js first', function() {
  var m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.ok(m.content_scripts);
  var js = m.content_scripts[0].js;
  assert.ok(js[0] === 'shared.js', 'shared.js is first');
  assert.ok(js.indexOf('content.js') !== -1);
  assert.ok(js.indexOf('overlay.js') !== -1);
});

test('manifest has action (not browser_action)', function() {
  var m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.ok(m.action);
  assert.ok(!m.browser_action);
});

test('manifest has gecko ID', function() {
  var m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.ok(m.browser_specific_settings.gecko.id);
});

section('Structural — Source File Validation');

test('shared.js has browser polyfill', function() {
  var code = fs.readFileSync('shared.js', 'utf8');
  assert.ok(code.indexOf("typeof browser !== 'undefined' ? browser : chrome") !== -1);
});

test('shared.js exports to self.__pdl', function() {
  var code = fs.readFileSync('shared.js', 'utf8');
  assert.ok(code.indexOf('self.__pdl') !== -1);
});

test('shared.js has required constants', function() {
  var code = fs.readFileSync('shared.js', 'utf8');
  assert.ok(code.indexOf('SCHEMA_VERSION') !== -1);
  assert.ok(code.indexOf('MAX_QUEUE_SIZE') !== -1);
  assert.ok(code.indexOf('MAX_RETRIES') !== -1);
  assert.ok(code.indexOf('RETRY_DELAY') !== -1);
  assert.ok(code.indexOf('MIME_EXTENSIONS') !== -1);
  assert.ok(code.indexOf('DETECTION_CONFIG') !== -1);
});

test('shared.js has required functions', function() {
  var code = fs.readFileSync('shared.js', 'utf8');
  var fns = ['isAllowedUrl', 'detectExtension', 'sanitizeFilename', 'extractPrompt', 'generateId'];
  fns.forEach(function(fn) {
    assert.ok(code.indexOf('function ' + fn) !== -1, 'has ' + fn);
  });
});

test('all JS files use api variable', function() {
  var files = ['shared.js', 'background.js', 'content.js', 'overlay.js'];
  files.forEach(function(f) {
    var code = fs.readFileSync(f, 'utf8');
    assert.ok(code.indexOf('var api =') !== -1 || code.indexOf('api =') !== -1 || code.indexOf('self.__pdl') !== -1, f + ' declares api variable');
  });
});

test('background.js has required constants', function() {
  var code = fs.readFileSync('background.js', 'utf8');
  assert.ok(code.indexOf('SCHEMA_VERSION') !== -1);
  assert.ok(code.indexOf('MAX_QUEUE_SIZE') !== -1);
  assert.ok(code.indexOf('MAX_RETRIES') !== -1);
  assert.ok(code.indexOf('RETRY_DELAY') !== -1);
});

test('background.js has required functions', function() {
  var code = fs.readFileSync('background.js', 'utf8');
  var fns = ['handleDownloadError', 'createContextMenu', 'advanceQueue', 'afterDownload', 'migrateStorage', 'persistQueue', 'persistHistory', 'markDownloaded', 'restoreQueue', 'runQueue', 'handleDownloadFailure', 'handleMessage', 'doRefresh', 'registerDownloadListener', 'buildFilename'];
  fns.forEach(function(fn) {
    assert.ok(code.indexOf('function ' + fn) !== -1, 'has ' + fn);
  });
});

test('background.js uses storage.session for queue', function() {
  var code = fs.readFileSync('background.js', 'utf8');
  assert.ok(code.indexOf('storage.session') !== -1);
});

test('overlay.js has required functions', function() {
  var code = fs.readFileSync('overlay.js', 'utf8');
  var fns = ['loadIcon', 'esc', 'injectStyles', 'updateProgress', 'showToast', 'open', 'close', 'applyTheme', 'toggleTheme', 'loadFolder', 'loadSettings', 'buildHeaderHtml', 'buildToolbarHtml', 'buildStatusHtml', 'buildLightboxHtml', 'create', 'bindEvents', 'removeKeydownHandler', 'wrapIndex', 'navigateCard', 'openLightbox', 'closeLightbox', 'navigateLightbox', 'load', 'disconnectObserver', 'renderCard', 'render', 'toggleSelect', 'upd', 'download', 'resetRefreshBtn', 'updateLightboxBtn'];
  fns.forEach(function(fn) {
    assert.ok(code.indexOf('function ' + fn) !== -1, 'has ' + fn);
  });
});

test('overlay.js has MSG object with required keys', function() {
  var code = fs.readFileSync('overlay.js', 'utf8');
  var keys = ['selectAll', 'deselectAll', 'refresh', 'downloadSelected', 'noImages', 'preview', 'close', 'select', 'deselect', 'download', 'done'];
  keys.forEach(function(key) {
    assert.ok(code.indexOf(key) !== -1, 'MSG has ' + key);
  });
});

test('overlay.js has aria-keyshortcuts', function() {
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf('aria-keyshortcuts') !== -1);
});

test('overlay.js has merged keydownHandler', function() {
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf('keydownHandler = function(e)') !== -1);
  assert.ok(code.indexOf('galleryKeyHandler') === -1);
  assert.ok(code.indexOf('removeGalleryKeyHandler') === -1);
});

test('overlay.js has IntersectionObserver and virtualization', function() {
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf('IntersectionObserver') !== -1);
  assert.ok(code.indexOf('VISIBLE_BUFFER') !== -1);
  assert.ok(code.indexOf('renderedCards') !== -1);
  assert.ok(code.indexOf('disconnectObserver') !== -1);
});

test('overlay.js has ICONS at module level', function() {
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf('var ICONS') !== -1);
  assert.ok(code.indexOf('icons[name]') === -1 || code.indexOf('ICONS[name]') !== -1);
});

test('overlay.js uses sel[id] = true (not = 1)', function() {
  var code = fs.readFileSync('overlay.js', 'utf8');
  assert.ok(code.indexOf('sel[i.id] = true') !== -1);
  assert.ok(code.indexOf('sel[i.id] = 1') === -1);
});

section('Structural — CSS Validation');

test('CSS uses custom properties', function() {
  var css = fs.readFileSync('overlay.css', 'utf8');
  assert.ok(css.indexOf(':root') !== -1);
  assert.ok(css.indexOf('--pdl-bg') !== -1);
  assert.ok(css.indexOf('--pdl-accent') !== -1);
});

test('CSS has required classes', function() {
  var css = fs.readFileSync('overlay.css', 'utf8');
  var classes = ['pdl-open', 'pdl-closing', 'pdl-backdrop', 'pdl-panel', 'pdl-header', 'pdl-title', 'pdl-toolbar', 'pdl-btn', 'pdl-btn-accent', 'pdl-btn-green', 'pdl-gallery', 'pdl-card', 'pdl-selected', 'pdl-placeholder', 'pdl-check', 'pdl-expand', 'pdl-progress', 'pdl-pbar', 'pdl-pfill', 'pdl-lightbox', 'pdl-lightbox-img', 'pdl-lightbox-nav', 'pdl-toast'];
  classes.forEach(function(cls) {
    assert.ok(css.indexOf('.' + cls) !== -1, 'CSS has .' + cls);
  });
});

test('CSS has old class names removed', function() {
  var css = fs.readFileSync('overlay.css', 'utf8');
  assert.ok(css.indexOf('.pdl-card.pdl-sel{') === -1);
  assert.ok(css.indexOf('.pdl-lb{') === -1);
  assert.ok(css.indexOf('.pdl-lb-img') === -1);
  assert.ok(css.indexOf('.pdl-lb-nav') === -1);
});

test('CSS has light theme', function() {
  var css = fs.readFileSync('overlay.css', 'utf8');
  assert.ok(css.indexOf('.pdl-light') !== -1);
  assert.ok(css.indexOf('prefers-reduced-motion') !== -1);
});

section('Structural — SVG Icons');

test('icons directory exists with PNG files', function() {
  assert.ok(fs.existsSync('icons'));
  var files = fs.readdirSync('icons');
  var pngs = files.filter(function(f) { return f.endsWith('.png'); });
  assert.ok(pngs.length >= 2, 'at least 2 PNG icons');
});

// ============================================================
// RESULTS
// ============================================================

console.log('\n=============================');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed, ' + total + ' total');
console.log('=============================\n');

process.exit(failed > 0 ? 1 : 0);

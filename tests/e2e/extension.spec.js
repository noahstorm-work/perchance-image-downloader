var { test, expect } = require('@playwright/test');
var path = require('path');

test.describe('Perchance Image Downloader', function() {
  test('loads extension without errors', async function() {
    var extensionPath = path.resolve(__dirname, '../..');
    var context = await test.chromium.launchPersistentContext('', {
      headless: false,
      args: [
        '--disable-extensions-except=' + extensionPath,
        '--load-extension=' + extensionPath
      ]
    });
    var page = await context.newPage();
    var errors = [];
    page.on('pageerror', function(e) { errors.push(e.message); });
    await page.goto('about:blank');
    await page.waitForTimeout(2000);
    expect(errors).toEqual([]);
    await context.close();
  });

  test('manifest is valid MV3', async function() {
    var fs = require('fs');
    var m = JSON.parse(fs.readFileSync(path.join(__dirname, '../../manifest.json'), 'utf8'));
    expect(m.manifest_version).toBe(3);
    expect(m.name).toBeTruthy();
    expect(m.version).toBeTruthy();
    expect(m.content_scripts).toBeTruthy();
    expect(m.content_scripts[0].js).toContain('content.js');
    expect(m.content_scripts[0].js).toContain('overlay.js');
  });

  test('all source files exist', async function() {
    var fs = require('fs');
    var root = path.join(__dirname, '../..');
    var files = ['background.js', 'content.js', 'overlay.js', 'overlay.css', 'manifest.json'];
    files.forEach(function(f) {
      expect(fs.existsSync(path.join(root, f))).toBe(true);
    });
  });

  test('all SVG icons exist', async function() {
    var fs = require('fs');
    var svgDir = path.join(__dirname, '../../icons/svg');
    var icons = ['close', 'sun', 'moon', 'download', 'refresh', 'chevron-left', 'check', 'chevron-right', 'expand', 'alert-circle'];
    icons.forEach(function(name) {
      expect(fs.existsSync(path.join(svgDir, name + '.svg'))).toBe(true);
    });
  });

  test('CSS has all required classes', async function() {
    var fs = require('fs');
    var css = fs.readFileSync(path.join(__dirname, '../../overlay.css'), 'utf8');
    var required = ['.pdl-gallery', '.pdl-card', '.pdl-selected', '.pdl-lightbox', '.pdl-toast', '.pdl-placeholder'];
    required.forEach(function(cls) {
      expect(css).toContain(cls);
    });
  });

  test('JS files use browser polyfill', async function() {
    var fs = require('fs');
    var root = path.join(__dirname, '../..');
    ['background.js', 'content.js', 'overlay.js'].forEach(function(f) {
      var code = fs.readFileSync(path.join(root, f), 'utf8');
      expect(code).toContain("typeof browser !== 'undefined' ? browser : chrome");
    });
  });
});

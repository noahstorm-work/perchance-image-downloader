var fs = require('fs');
var path = require('path');
var terser = require('terser');

var files = ['shared.js', 'background.js', 'content.js', 'overlay.js'];
var outDir = 'dist';

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

async function build() {
  console.log('Building...\n');
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var code = fs.readFileSync(file, 'utf8');
    var result = await terser.minify(code, {
      ecma: 5,
      compress: { drop_console: true },
      mangle: true,
      output: { comments: false }
    });
    if (result.error) {
      console.error('  ERROR ' + file + ': ' + result.error.message);
      process.exit(1);
    }
    fs.writeFileSync(path.join(outDir, file), result.code);
    var ratio = ((1 - result.code.length / code.length) * 100).toFixed(1);
    console.log('  ' + file + ': ' + code.length + ' -> ' + result.code.length + ' bytes (' + ratio + '% smaller)');
  }

  fs.copyFileSync('manifest.json', path.join(outDir, 'manifest.json'));
  fs.copyFileSync('overlay.css', path.join(outDir, 'overlay.css'));

  var iconDir = path.join(outDir, 'icons');
  if (!fs.existsSync(iconDir)) fs.mkdirSync(iconDir);

  fs.readdirSync('icons').forEach(function(f) {
    if (f.endsWith('.png')) fs.copyFileSync(path.join('icons', f), path.join(iconDir, f));
  });

  console.log('\nBuild complete: ' + outDir + '/');
}

build().catch(function(e) { console.error(e); process.exit(1); });

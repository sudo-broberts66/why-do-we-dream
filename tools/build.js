#!/usr/bin/env node
/* Bundles index.html + css + js into single self-contained files:
     dist/why-we-dream.html   full standalone document
     dist/fragment.html       head-less fragment (title, styles, markup, scripts) for hosts that supply their own <html> shell */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let html = read('index.html');
const missing = [];
html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, p) => '<style>\n' + read(p) + '\n</style>');
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, p) => {
  if (!fs.existsSync(path.join(root, p))) { missing.push(p); return ''; }
  return '<script>\n' + read(p).replace(/<\/script/gi, '<\\/script') + '\n</script>';
});
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/why-we-dream.html'), html);
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset[^>]*>\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '');
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
fs.writeFileSync(path.join(root, 'dist/fragment.html'), head.trim() + '\n' + body.trim() + '\n');
console.log('dist/why-we-dream.html', (html.length / 1024).toFixed(0) + ' KB');
if (missing.length) console.log('missing (skipped):', missing.join(', '));

/* SPDX-License-Identifier: GPL-3.0-or-later
   Copyright (C) 2026 Felix Spindler <f-spindler@pm.me> */
// Builds dist/event-timer-standalone.html – one self-contained file that runs
// without the server (engine in the browser, state in localStorage).
//   node scripts/build-standalone.js
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const web = path.join(root, 'web');
const version = (fs.readFileSync(path.join(root, 'Cargo.toml'), 'utf8').match(/^version\s*=\s*"([^"]+)"/m) || [])[1] || 'dev';
let html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');

const inline = (re, fn) => { html = html.replace(re, (...m) => fn(...m)); };
const safeScript = s => s.replace(/<\/script/gi, '<\\/script');

// Fonts become data URLs so the file needs nothing besides itself.
const dataUrl = (file, mime) => `data:${mime};base64,` + fs.readFileSync(path.join(web, file)).toString('base64');
const inlineFonts = css => css.replace(/url\("\.\.\/fonts\/([^"]+)"\)/g, (_, f) => `url("${dataUrl('fonts/' + f, 'font/woff2')}")`);
html = html.replace(/<link rel="preload"[^>]*>\n?/g, '');
inline(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => `<style>\n${inlineFonts(fs.readFileSync(path.join(web, href.replace(/^\//, '')), 'utf8'))}\n</style>`);
inline(/<script src="([^"]+)"><\/script>/g, (_, src) => `<script>\n${safeScript(fs.readFileSync(path.join(web, src.replace(/^\//, '')), 'utf8'))}\n</script>`);
const svgIcon = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(web, 'icon.svg')).toString('base64');
const pngIcon = 'data:image/png;base64,' + fs.readFileSync(path.join(web, 'icon-180.png')).toString('base64');
// Brand SVGs, looked up by ETUI.logo() instead of /brand/*.
const assets = {};
for (const f of fs.readdirSync(path.join(web, 'brand'))) assets[f] = dataUrl('brand/' + f, 'image/svg+xml');
html = html
  .replace('href="/icon.svg"', `href="${svgIcon}"`)
  .replace('href="/icon-180.png"', `href="${pngIcon}"`)
  .replace(/<link rel="manifest"[^>]*>\n?/, '')
  .replace('<title>Event Timer</title>', '<title>Event Timer</title>\n<script>window.ET_STANDALONE = true; window.ET_VERSION = ' + JSON.stringify(version) + '; window.ET_ASSETS = ' + JSON.stringify(assets) + ';</script>');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'event-timer-standalone.html');
fs.writeFileSync(out, html);
console.log(`${out} (${(html.length / 1024).toFixed(0)} KB, v${version})`);

// Variant for hosts that wrap the page in their own document skeleton
// (no doctype/html/head/body, title first, safe-area aware top bar).
if (process.argv.includes('--embed')) {
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
    .replace(/<meta charset[^>]*>\n?/, '').replace(/<meta name="viewport"[^>]*>\n?/, '');
  const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
  const title = head.match(/<title>[^<]*<\/title>/)[0];
  const embed = title + '\n' + head.replace(title, '') + '<style>.topbar{top:env(safe-area-inset-top,0px)}</style>\n' + body;
  const eout = path.join(root, 'dist', 'event-timer-embed.html');
  fs.writeFileSync(eout, embed);
  console.log(`${eout} (${(embed.length / 1024).toFixed(0)} KB)`);
}

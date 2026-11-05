/* SPDX-License-Identifier: GPL-3.0-or-later
   Copyright (C) 2026 Felix Spindler <f-spindler@pm.me> */
// Regenerates every app icon from the fs mark (web/brand/fs-icon-transparent.svg).
// Developer tool, only needed when the mark changes; the results are committed.
//   node scripts/make-icons.js        (needs Playwright with Chromium)
// Writes: web/icon.svg, web/icon-180.png, web/icon-512.png,
//         packaging/icon/event-timer{.svg,-square.svg,-macos.svg,.png,.ico}, AppIcon.icns
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mark = fs.readFileSync(path.join(root, 'web/brand/fs-icon-transparent.svg'), 'utf8');
// The mark's drawing (everything inside <svg>, without its <title>) – reused unchanged, never redrawn.
const inner = mark.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title>[^<]*<\/title>/, '');
const DARK = '#181c21'; // --bg (dark theme)

// Dark full-bleed tile (iOS home screen fills transparency with black anyway)
const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${DARK}"/>`
  + `<g transform="translate(12 12) scale(.76)">${inner}</g></svg>\n`;
// macOS tile: 824/1024 rounded square with the usual margin, mark inside
const macos = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect x="100" y="100" width="824" height="824" rx="185" fill="${DARK}"/>`
  + `<g transform="translate(212 212) scale(6)">${inner}</g></svg>\n`;

const out = (rel, data) => { fs.writeFileSync(path.join(root, rel), data); console.log(rel); };
out('web/icon.svg', mark);
out('packaging/icon/event-timer.svg', mark);
out('packaging/icon/event-timer-square.svg', square);
out('packaging/icon/event-timer-macos.svg', macos);

// ICO and ICNS both accept PNG payloads, so they are assembled here without extra tools.
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(([size, buf], i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(buf.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += buf.length;
  });
  return Buffer.concat([head, ...pngs.map(p => p[1])]);
}
function icns(entries) {
  const chunks = entries.map(([type, buf]) => {
    const h = Buffer.alloc(8); h.write(type, 0, 'ascii'); h.writeUInt32BE(buf.length + 8, 4);
    return Buffer.concat([h, buf]);
  });
  const total = 8 + chunks.reduce((n, c) => n + c.length, 0);
  const h = Buffer.alloc(8); h.write('icns', 0, 'ascii'); h.writeUInt32BE(total, 4);
  return Buffer.concat([h, ...chunks]);
}

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const render = async (svg, size) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style>`
      + `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`);
    await page.waitForFunction(() => document.images[0].complete);
    return page.screenshot({ omitBackground: true, type: 'png' });
  };
  out('web/icon-180.png', await render(square, 180));
  out('web/icon-512.png', await render(mark, 512));
  out('packaging/icon/event-timer.png', await render(mark, 512));
  const icoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  const icoPngs = [];
  for (const s of icoSizes) icoPngs.push([s, await render(mark, s)]);
  out('packaging/icon/event-timer.ico', ico(icoPngs));
  const icnsTypes = [['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024]];
  const icnsPngs = [];
  for (const [type, s] of icnsTypes) icnsPngs.push([type, await render(macos, s)]);
  out('packaging/icon/AppIcon.icns', icns(icnsPngs));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

// Regenerates the app icons in public/icons from the "AV" mark used on the loading screen.
// Run from dashboard-app: NODE_PATH=$(npm root -g) node scripts/make-icons.mjs
// Playwright is not a dependency of this app; the script uses whichever copy the machine has.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const { chromium } = createRequire(import.meta.url)("playwright");
const out = new URL("../public/icons/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const GREEN = "#1f6b4f";
// rounded: a rounded square on a transparent corner (launcher and tab icon).
// full: colour to the edge, mark inside the safe zone (maskable icon and the iOS icon, which is never transparent).
const page = (size, full) => `<html><body style="margin:0;width:${size}px;height:${size}px;background:${full ? GREEN : "transparent"};display:grid;place-items:center">
<div style="width:100%;height:100%;display:grid;place-items:center;background:${GREEN};border-radius:${full ? 0 : size * 0.2}px;color:#fff;
font:700 ${size * (full ? 0.36 : 0.44)}px/1 'DM Sans',system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;letter-spacing:-0.02em">AV</div></body></html>`;

const browser = await chromium.launch();
for (const [name, size, full] of [["icon-192.png", 192, false], ["icon-512.png", 512, false], ["icon-maskable-512.png", 512, true], ["apple-touch-icon.png", 180, true]]) {
  const p = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await p.setContent(page(size, full));
  await p.screenshot({ path: out + name, omitBackground: !full });
  await p.close();
}
await browser.close();

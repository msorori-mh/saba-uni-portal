#!/usr/bin/env node
/**
 * Copies the committed college branding (launcher icons, adaptive foreground,
 * splash screens) from `resources/android/` into the generated `android/`
 * project. Capacitor regenerates `android/` in CI, so this must run after
 * `cap add android` / `cap sync android`.
 *
 * Source assets are derived from the portal's official icon (public/icon-512.png)
 * over the brand background #061F33 — no new visual identity is invented.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "resources", "android");
const DEST = path.join(ROOT, "android", "app", "src", "main", "res");

if (!fs.existsSync(SRC)) {
  console.error("[android-branding] resources/android not found");
  process.exit(1);
}
if (!fs.existsSync(DEST)) {
  console.error("[android-branding] android/ not found — run `cap add android` first.");
  process.exit(1);
}

let copied = 0;
for (const dir of fs.readdirSync(SRC)) {
  const from = path.join(SRC, dir);
  const to = path.join(DEST, dir);
  if (!fs.statSync(from).isDirectory()) continue;
  fs.mkdirSync(to, { recursive: true });
  for (const file of fs.readdirSync(from)) {
    fs.copyFileSync(path.join(from, file), path.join(to, file));
    copied += 1;
  }
}

// Adaptive icon background must match the brand colour.
const colorsFile = path.join(DEST, "values", "ic_launcher_background.xml");
fs.writeFileSync(
  colorsFile,
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#061F33</color>\n</resources>\n`,
);
const legacyBg = path.join(DEST, "drawable", "ic_launcher_background.xml");
if (fs.existsSync(legacyBg)) fs.rmSync(legacyBg);

console.log(`[android-branding] copied ${copied} branding assets into android/app/src/main/res`);

#!/usr/bin/env node
/* ============================================================================
   TRAILER-FÅNGST – körs på en maskin med riktig GPU (din laptop), inte i CI.

   Skriptet startar spelet, styr kameran och UI:t automatiskt och sparar varje
   bildruta som PNG. Rörelsen mäts i STEG per bildruta, inte i realtid – så
   resultatet blir lika mjukt oavsett om din maskin kör 25 eller 60 fps. En
   långsam maskin ger alltså inte hackig video, bara längre fångsttid.

   Två sorters tagningar:
     • "city" – fotograferar BARA <canvas>-elementet → ren 3D-stad utan UI.
     • "ui"   – fotograferar hela sidan i 1:1 → knivskarp panel-text.
   (Inga CSS-trick som döljer gränssnittet – den vägen visade sig opålitlig.)

   Se store/generators/CAPTURE.md för körinstruktioner.
   Rutorna hamnar i  capture/<shot>/f00000.png  och matas sedan till
   store/generators/render_trailer.py som klipper ihop trailern med musiken.
   ========================================================================== */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ── Inställningar (kan överstyras med miljövariabler) ──────────────────────
const URL_BASE = process.env.GAME_URL || 'http://127.0.0.1:4173';
const COMPANY = process.env.COMPANY || 'Meridian Estates';
const OUT = process.env.OUT_DIR || path.join(process.cwd(), 'capture');
const W = 1920, H = 1080;
const BOOT_WAIT = Number(process.env.BOOT_WAIT || 9000); // ms tills staden är byggd

const url = `${URL_BASE}/?dev&co=${encodeURIComponent(COMPANY)}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Grov rimlighetskoll: en helt tom/enfärgad ruta betyder att något är fel. */
function looksBlank(file) {
  try { return fs.statSync(file).size < 12000; } catch { return true; }
}

let page, canvas;

/** Fånga en sekvens. kind: 'city' (bara canvas) eller 'ui' (hela sidan). */
async function capture(name, frames, kind, stepFn) {
  const dir = path.join(OUT, name);
  fs.mkdirSync(dir, { recursive: true });
  process.stdout.write(`\n▶ ${name.padEnd(14)} ${String(frames).padStart(3)} rutor  `);
  const t0 = Date.now();

  for (let i = 0; i < frames; i++) {
    if (stepFn) await stepFn(i);
    if (kind === 'ui' && i % 10 === 0) await dismissModals();
    const file = path.join(dir, `f${String(i).padStart(5, '0')}.png`);
    if (kind === 'city') await canvas.screenshot({ path: file });
    else await page.screenshot({ path: file, animations: 'disabled' });

    if (i === 0 && looksBlank(file)) {
      throw new Error(
        `Första rutan i "${name}" ser tom ut (${file}).\n` +
        `  Öka väntetiden:  BOOT_WAIT=20000 node store/generators/capture-trailer.cjs`
      );
    }
    if (i % 15 === 0) process.stdout.write('.');
  }
  const s = (Date.now() - t0) / 1000;
  console.log(` klart – ${s.toFixed(0)}s (${(s / frames).toFixed(2)}s/ruta)`);
}

/** Beslutsmodaler dyker upp när klockan rullar och lägger sig över bilden.
 *  Skjut upp dem innan varje ruta så tagningarna inte blockeras. */
async function dismissModals() {
  const postpone = page.locator('button', { hasText: 'Postpone the decision' }).first();
  if (await postpone.count()) { await postpone.click({ force: true }).catch(() => {}); return; }
  // Nyhetsmodal och liknande stängs med Escape.
  const modalish = page.locator('text=/Breaking|NEWS|Chapter/i').first();
  if (await modalish.count()) await page.keyboard.press('Escape').catch(() => {});
}

/** Klicka en knapp vars text/aria-label/title innehåller `text`. */
async function click(text, required = false) {
  const byText = page.locator('button', { hasText: text }).first();
  if (await byText.count()) { await byText.click({ force: true }).catch(() => {}); return true; }
  const byAttr = page.locator(`button[aria-label*="${text}"], button[title*="${text}"]`).first();
  if (await byAttr.count()) { await byAttr.click({ force: true }).catch(() => {}); return true; }
  if (required) throw new Error(`Hittade ingen knapp: "${text}"`);
  console.warn(`\n  (varning: hittade ingen knapp "${text}" – hoppar över)`);
  return false;
}

/* MapControls: vänsterdrag = panorera, hjul = zoom. Vi håller musknappen
   nere under en tagning och flyttar en liten bit per ruta. */
const pan = { x: W / 2, y: H / 2 };
async function dragStart() { pan.x = W / 2; pan.y = H / 2; await page.mouse.move(pan.x, pan.y); await page.mouse.down(); }
async function dragBy(dx, dy) { pan.x += dx; pan.y += dy; await page.mouse.move(pan.x, pan.y); }
const dragEnd = () => page.mouse.up();

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`Spel:   ${url}`);
  console.log(`Utdata: ${OUT}`);

  const browser = await chromium.launch({ headless: false, args: ['--hide-scrollbars'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page = await ctx.newPage();

  // Grafik på High + FPS-mätaren av, sedan omladdning så det slår igenom.
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await page.evaluate(() => {
    localStorage.setItem('fastighetsimperium:graphics', JSON.stringify('high'));
    localStorage.setItem('fastighetsimperium:showFps', JSON.stringify(false));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  console.log(`Väntar ${(BOOT_WAIT / 1000).toFixed(0)}s på att staden ska byggas …`);
  await sleep(BOOT_WAIT);

  canvas = page.locator('canvas').first();
  if (!(await canvas.count())) throw new Error('Ingen <canvas> hittades – startade spelet verkligen?');

  /* ══ S1 · Cold open – nära, knappt märkbar drift ══════════════════════ */
  await page.mouse.move(W / 2, H / 2);
  for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, -110); await sleep(45); }
  await sleep(1200);
  await dragStart();
  await capture('s1-coldopen', 90, 'city', () => dragBy(-0.9, -0.32));
  await dragEnd();

  /* ══ S2 · HJÄLTEN – utzoomning till hela staden ═══════════════════════ */
  await capture('s2-reveal', 150, 'city', async i => {
    if (i % 2 === 0) await page.mouse.wheel(0, 78);
  });

  /* ══ S3 · Långsamt svep över skylinen ═════════════════════════════════ */
  await dragStart();
  await capture('s3-drift', 120, 'city', () => dragBy(-1.6, 0.15));
  await dragEnd();

  /* ══ S4 · Overlay-växlingar (UI i 1:1) ════════════════════════════════ */
  await capture('s4-overlays', 120, 'ui', async i => {
    if (i === 25) await click('Vacancy');
    if (i === 55) await click('Condition');
    if (i === 85) await click('Yield');
  });
  await click('Map');
  await sleep(500);

  /* ══ S5 · Portfölj ════════════════════════════════════════════════════ */
  await click('Portfolio', true);
  await sleep(1400);
  await capture('s5-portfolio', 90, 'ui', async i => { if (i > 20) await page.mouse.wheel(0, 9); });
  await page.keyboard.press('Escape'); await sleep(700);

  /* ══ S6 · Ekonomi ═════════════════════════════════════════════════════ */
  await click('Finance', true);
  await sleep(1400);
  await capture('s6-finance', 75, 'ui');
  await page.keyboard.press('Escape'); await sleep(700);

  /* ══ S7 · Distrikt & rivaler ══════════════════════════════════════════ */
  await click('Districts', true);
  await sleep(1400);
  await capture('s7-districts', 90, 'ui', async i => { if (i > 25) await page.mouse.wheel(0, 8); });
  await page.keyboard.press('Escape'); await sleep(700);

  /* ══ S8 · Bolagsresan ═════════════════════════════════════════════════ */
  await click('Company', true);
  await sleep(1400);
  await capture('s8-company', 90, 'ui', async i => { if (i > 25) await page.mouse.wheel(0, 8); });
  await page.keyboard.press('Escape'); await sleep(700);

  /* ══ S9 · Tiden rullar – klockan och siffrorna lever ══════════════════ */
  await click('Play');
  await click('8×');
  await sleep(800);
  await capture('s9-timerun', 150, 'ui');

  /* ══ S10 · Slutbild – långsam drift över staden ═══════════════════════ */
  await dragStart();
  await capture('s10-outro', 120, 'city', () => dragBy(1.1, 0.2));
  await dragEnd();

  console.log(`\n✔ Klart. Rutorna ligger i ${OUT}`);
  console.log('  Zippa mappen (eller gör mp4 enligt CAPTURE.md) och skicka tillbaka den.');
  await browser.close();
})().catch(e => { console.error('\nFEL:', e.message); process.exit(1); });

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');
const { env, normalizeGameKey, getGameLabel } = require('../config');
const FONT_DIRS = [
  path.join(__dirname, '..', '..', 'assets', 'fonts'),
  path.join(__dirname, '..', 'assets', 'fonts'),
  path.join(process.cwd(), 'assets', 'fonts')
];
const FONT_REGISTRY = [
  { file: 'Inter-ExtraLight.ttf', family: 'Inter Light' },
  { file: 'Inter-Light.ttf',      family: 'Inter Light' },
  { file: 'Inter-Regular.ttf',    family: 'Inter' },
  { file: 'Inter-Medium.ttf',     family: 'Inter Medium' },
  { file: 'Inter-SemiBold.ttf',   family: 'Inter SemiBold' },
  { file: 'Inter-Bold.ttf',       family: 'Inter Bold' },
  { file: 'Inter-ExtraBold.ttf',  family: 'Inter ExtraBold' },
  { file: 'Inter-Black.ttf',      family: 'Inter Black' }
];
function pickFontFamily(weight) {
  const w = Math.min(900, Math.max(100, Number(weight) || 400));
  if (w <= 300) return 'Inter Light';
  if (w <= 400) return 'Inter';
  if (w <= 500) return 'Inter Medium';
  if (w <= 600) return 'Inter SemiBold';
  if (w <= 700) return 'Inter Bold';
  if (w <= 800) return 'Inter ExtraBold';
  return 'Inter Black';
}
function initFontsSync() {
  console.log("[Fonts] Registering fonts...");
  const dirs = [
    path.join(process.cwd(), 'assets', 'fonts'),
    path.join(__dirname, '..', '..', 'assets', 'fonts'),
    '/var/task/assets/fonts'
  ];

  let count = 0;
  for (const { file, family } of FONT_REGISTRY) {
    for (const dir of dirs) {
      const p = path.join(dir, file);
      if (fs.existsSync(p)) {
        try {
          GlobalFonts.registerFromPath(p, family);
          count++;
          break;
        } catch (err) {
          console.error(`[Fonts] Failed to register ${family}:`, err.message);
        }
      }
    }
  }
  console.log(`[Fonts] Successfully registered ${count} fonts.`);
}
initFontsSync();

function font(weight, size) {
  const family = pickFontFamily(weight);
  return `${size}px "${family}", "Inter", sans-serif`;
}
async function loadRemoteImage(url) {
  if (!url) return null;
  try { return await loadImage(url); } catch { return null; }
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}
function fillRoundRect(ctx, x, y, w, h, r, fill) {
  ctx.save(); roundRect(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); ctx.restore();
}
function strokeRoundRect(ctx, x, y, w, h, r, stroke, lw = 1) {
  ctx.save(); roundRect(ctx, x, y, w, h, r); ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); ctx.restore();
}
function clipRoundRect(ctx, x, y, w, h, r) {
  roundRect(ctx, x, y, w, h, r); ctx.clip();
}
function hex2rgba(hex, a) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}
function wrapText(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = []; let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
    else { line = test; }
  }
  if (line) lines.push(line);
  return lines;
}
function formatDateStamp() {
  return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function drawDotGrid(ctx, W, H, color = 'rgba(255,255,255,0.04)', gap = 28) {
  ctx.save();
  for (let x = gap; x < W; x += gap) {
    for (let y = gap; y < H; y += gap) {
      const dist = Math.sqrt((x - W/2) ** 2 + (y - H/2) ** 2) / Math.max(W, H);
      const a = Math.max(0.01, 0.06 - dist * 0.05);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath(); ctx.arc(x, y, 1.0 + (1 - dist) * 0.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}
function drawHexGrid(ctx, W, H) {
  ctx.save();
  const r = 42, a = Math.PI / 3;
  for (let y = 0; y < H + r * 2; y += r * 1.5) {
    for (let x = 0; x < W + r * 2; x += r * Math.sqrt(3)) {
      const cx = x + (Math.round(y / (r * 1.5)) % 2) * r * Math.sqrt(3) / 2;
      const dist = Math.sqrt((cx - W/2) ** 2 + (y - H/2) ** 2) / Math.max(W, H);
      ctx.strokeStyle = `rgba(255,255,255,${Math.max(0.008, 0.04 - dist * 0.035)})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) ctx.lineTo(cx + r * Math.cos(a * i - Math.PI / 6), y + r * Math.sin(a * i - Math.PI / 6));
      ctx.closePath(); ctx.stroke();
    }
  }
  ctx.restore();
}
function drawGlowOrb(ctx, x, y, radius, color, alpha = 0.22) {
  for (let layer = 0; layer < 3; layer++) {
    const r = radius * (1 + layer * 0.3);
    const a = alpha * (1 - layer * 0.3);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `${color}${Math.round(a * 255).toString(16).padStart(2,'0')}`);
    g.addColorStop(0.4, `${color}${Math.round(a * 0.4 * 255).toString(16).padStart(2,'0')}`);
    g.addColorStop(1, 'transparent');
    ctx.save(); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
  }
}
function drawLightStreaks(ctx, W, H, color, count = 6) {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const sx = Math.random() * W;
    const sy = Math.random() * H * 0.5;
    const len = 200 + Math.random() * 400;
    const angle = -0.3 + Math.random() * 0.6;
    const g = ctx.createLinearGradient(sx, sy, sx + Math.cos(angle) * len, sy + Math.sin(angle) * len);
    g.addColorStop(0, 'transparent');
    g.addColorStop(0.5, `${color}${Math.round(0.06 * 255).toString(16).padStart(2,'0')}`);
    g.addColorStop(1, 'transparent');
    ctx.strokeStyle = g;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(angle) * len, sy + Math.sin(angle) * len);
    ctx.stroke();
  }
  ctx.restore();
}
function drawParticles(ctx, W, H, color, count = 40) {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const px = Math.random() * W;
    const py = Math.random() * H;
    const size = 0.5 + Math.random() * 2.5;
    const a = 0.05 + Math.random() * 0.2;
    const g = ctx.createRadialGradient(px, py, 0, px, py, size * 3);
    g.addColorStop(0, `${color}${Math.round(a * 255).toString(16).padStart(2,'0')}`);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(px - size * 3, py - size * 3, size * 6, size * 6);
    ctx.fillStyle = `rgba(255,255,255,${a * 0.8})`;
    ctx.beginPath(); ctx.arc(px, py, size * 0.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function drawAvatar(ctx, img, cx, cy, radius, ringColorA, ringColorB, glowColor) {
  // Outer bloom
  const bloom = ctx.createRadialGradient(cx, cy, radius, cx, cy, radius + 80);
  bloom.addColorStop(0, `${glowColor}30`); bloom.addColorStop(1, 'transparent');
  ctx.save(); ctx.fillStyle = bloom; ctx.fillRect(cx - radius - 80, cy - radius - 80, (radius + 80) * 2, (radius + 80) * 2); ctx.restore();
  // Orbit rings
  ctx.save();
  for (const [extra, alpha] of [[60, 0.06], [44, 0.08], [28, 0.12]]) {
    const orbitG = ctx.createLinearGradient(cx - radius - extra, cy, cx + radius + extra, cy);
    orbitG.addColorStop(0, `${ringColorA}${Math.round(alpha * 255).toString(16).padStart(2,'0')}`);
    orbitG.addColorStop(0.5, 'transparent');
    orbitG.addColorStop(1, `${ringColorB}${Math.round(alpha * 255).toString(16).padStart(2,'0')}`);
    ctx.strokeStyle = orbitG; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(cx, cy, radius + extra, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
  // Avatar image
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
  if (img) ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
  else { ctx.fillStyle = '#0d1117'; ctx.fill(); }
  ctx.restore();
  // Main gradient ring with glow
  ctx.save();
  ctx.shadowColor = glowColor; ctx.shadowBlur = 36;
  const ring = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  ring.addColorStop(0, ringColorA); ring.addColorStop(0.5, ringColorB); ring.addColorStop(1, ringColorA);
  ctx.strokeStyle = ring; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  // Second thinner inner ring
  ctx.save();
  ctx.strokeStyle = `${ringColorB}40`; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, radius + 8, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  // Specular highlight arc
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, radius - 3, -Math.PI * 0.8, -Math.PI * 0.25); ctx.stroke();
  ctx.restore();
  // Bottom reflection arc
  ctx.save();
  ctx.strokeStyle = `${ringColorA}20`; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, radius - 3, Math.PI * 0.2, Math.PI * 0.75); ctx.stroke();
  ctx.restore();
}
function drawStar(ctx, cx, cy, radius, filled, colA, colB) {
  const pts = 5, innerR = radius * 0.42;
  ctx.beginPath();
  for (let i = 0; i < pts * 2; i++) {
    const r = i % 2 === 0 ? radius : innerR;
    const angle = (Math.PI * i / pts) - Math.PI / 2;
    ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
  }
  ctx.closePath();
  if (filled) {
    const g = ctx.createLinearGradient(cx, cy - radius, cx, cy + radius);
    g.addColorStop(0, colA); g.addColorStop(1, colB);
    // Double glow for bloom effect
    ctx.save(); ctx.shadowColor = colB; ctx.shadowBlur = 28; ctx.fillStyle = g; ctx.fill(); ctx.restore();
    ctx.save(); ctx.shadowColor = colA; ctx.shadowBlur = 12; ctx.fillStyle = g; ctx.fill(); ctx.restore();
    // Inner highlight
    ctx.save();
    ctx.globalAlpha = 0.3;
    const innerG = ctx.createRadialGradient(cx, cy - radius * 0.3, 0, cx, cy, radius);
    innerG.addColorStop(0, 'rgba(255,255,255,0.6)'); innerG.addColorStop(1, 'transparent');
    ctx.fillStyle = innerG; ctx.fill();
    ctx.restore();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.stroke();
  }
}
function drawGrain(ctx, W, H, amount = 3000, alpha = 0.05) {
  ctx.save(); ctx.globalAlpha = alpha;
  for (let i = 0; i < amount; i++) {
    const v = Math.random() > 0.5 ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)';
    ctx.fillStyle = v;
    const s = Math.random() * 1.2 + 0.2;
    ctx.fillRect(Math.random() * W, Math.random() * H, s, s);
  }
  ctx.restore();
}
function drawPremiumBackground(ctx, W, H, t) {
  // Deep gradient base
  const bg = ctx.createLinearGradient(0, 0, W * 0.3, H);
  bg.addColorStop(0, '#020308'); bg.addColorStop(0.3, t.dark);
  bg.addColorStop(0.6, '#030510'); bg.addColorStop(1, '#010204');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // Subtle radial vignette
  const vig = ctx.createRadialGradient(W * 0.5, H * 0.45, W * 0.15, W * 0.5, H * 0.5, W * 0.85);
  vig.addColorStop(0, `${t.mid}60`); vig.addColorStop(1, 'transparent');
  ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
  // Scanlines
  for (let y = 0; y < H; y += 3) {
    ctx.fillStyle = 'rgba(0,0,0,0.03)'; ctx.fillRect(0, y, W, 1);
  }
  drawHexGrid(ctx, W, H);
  drawDotGrid(ctx, W, H, 'rgba(255,255,255,0.02)', 34);
  drawGrain(ctx, W, H, 5000, 0.025);
  // Multi-layered glow orbs
  drawGlowOrb(ctx, W * 0.15, H * 0.2, 650, t.A, 0.2);
  drawGlowOrb(ctx, W * 0.85, H * 0.8, 750, t.B, 0.15);
  drawGlowOrb(ctx, W * 0.5, H * 0.45, 900, '#ffffff', 0.02);
  drawGlowOrb(ctx, W * 0.7, H * 0.12, 450, t.glow, 0.14);
  drawGlowOrb(ctx, W * 0.3, H * 0.85, 350, t.B, 0.08);
  drawLightStreaks(ctx, W, H, t.A, 5);
  drawParticles(ctx, W, H, t.A, 35);
  drawParticles(ctx, W, H, t.B, 20);
}
const THEMES = {
  ALS:     { A: '#ff7b4a', B: '#ffb37a', dark: '#12080a', mid: '#2d1510', glow: '#ff6030' },
  AG:      { A: '#2affa0', B: '#6effd0', dark: '#030f0d', mid: '#0b2d26', glow: '#00e080' },
  AC:      { A: '#38b6ff', B: '#8dd8ff', dark: '#030c15', mid: '#0b2035', glow: '#2090ff' },
  UTD:     { A: '#ffd444', B: '#ffe898', dark: '#141005', mid: '#332b0e', glow: '#e8b800' },
  AV:      { A: '#c084ff', B: '#e2c0ff', dark: '#0d0615', mid: '#231040', glow: '#9b40ff' },
  BL:      { A: '#d4af37', B: '#f5e08a', dark: '#0e0a04', mid: '#2a200a', glow: '#c09020' },
  SP:      { A: '#3bd1ff', B: '#9ff3ff', dark: '#031019', mid: '#0b2840', glow: '#16bfff' },
  ARX:     { A: '#ff5d8f', B: '#ffb3cc', dark: '#17060c', mid: '#3b1120', glow: '#ff3d73' },
  ASTD:    { A: '#ff9f43', B: '#ffd29a', dark: '#160c05', mid: '#392010', glow: '#ff7a00' },
  APX:     { A: '#52f0ff', B: '#b3fbff', dark: '#041316', mid: '#0f3137', glow: '#27d9f3' },
  AOL:     { A: '#b57cff', B: '#e1c4ff', dark: '#0f0818', mid: '#2c1843', glow: '#a855f7' },
  DEFAULT: { A: '#6c8eff', B: '#b6caff', dark: '#060b18', mid: '#121e3c', glow: '#4060ff' }
};
function getTheme(key) { return THEMES[String(key).toUpperCase()] || THEMES.DEFAULT; }
async function loadGameEmoji(gameKey) {
  const map = {
    ALS: env.emojis.serviceAls,
    AG:  env.emojis.serviceAg,
    AC:  env.emojis.serviceAc,
    UTD: env.emojis.serviceUtd,
    AV:  env.emojis.serviceAv,
    BL:  env.emojis.serviceBl,
    SP:  env.emojis.serviceSp,
    ARX: env.emojis.serviceArx,
    ASTD: env.emojis.serviceAstd,
    APX: env.emojis.serviceApx,
    AOL: env.emojis.serviceAol
  };
  const emoji = map[normalizeGameKey(gameKey, String(gameKey).toUpperCase())];
  const id = emoji && (typeof emoji === 'string' ? emoji : emoji.id);
  if (!id) return null;
  return loadRemoteImage(`https://cdn.discordapp.com/emojis/${id}.png?size=128&quality=lossless`);
}
async function buildVouchCard(data) {
  const W = 1920, H = 1080;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const gameKey = normalizeGameKey(data.gameKey, String(data.gameKey || '').toUpperCase());
  const gameLabel = getGameLabel(data.gameLabel || gameKey, gameKey);
  const t = getTheme(gameKey);
  drawPremiumBackground(ctx, W, H, t);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 100; ctx.shadowOffsetY = 50;
  fillRoundRect(ctx, 30, 24, W - 60, H - 48, 40, 'rgba(6,8,16,0.88)');
  ctx.restore();
  fillRoundRect(ctx, 30, 24, W - 60, H - 48, 40, 'rgba(255,255,255,0.015)');
  const logo = await loadRemoteImage('https://hyperionsapplication.xyz/logo.png');
  if (logo) {
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.drawImage(logo, W - 450, 60, 380, 380);
    ctx.restore();
  }
  const shellGrad = ctx.createLinearGradient(30, 24, W - 30, H - 24);
  shellGrad.addColorStop(0,    `${t.A}55`);
  shellGrad.addColorStop(0.25, 'rgba(255,255,255,0.15)');
  shellGrad.addColorStop(0.5,  `${t.B}44`);
  shellGrad.addColorStop(0.75, 'rgba(255,255,255,0.08)');
  shellGrad.addColorStop(1,    `${t.A}33`);
  strokeRoundRect(ctx, 30, 24, W - 60, H - 48, 40, shellGrad, 2);
  strokeRoundRect(ctx, 32, 26, W - 64, H - 52, 38, 'rgba(255,255,255,0.03)', 1);
  ctx.save();
  roundRect(ctx, 30, 24, W - 60, H - 48, 40); ctx.clip();
  const shine = ctx.createLinearGradient(60, 40, 1000, 600);
  shine.addColorStop(0,    'rgba(255,255,255,0.14)');
  shine.addColorStop(0.12, 'rgba(255,255,255,0.06)');
  shine.addColorStop(0.25, 'transparent');
  ctx.fillStyle = shine; ctx.fillRect(30, 24, 1000, 550);
  const bottomAmbient = ctx.createLinearGradient(0, H - 200, 0, H);
  bottomAmbient.addColorStop(0, 'transparent'); bottomAmbient.addColorStop(1, `${t.A}08`);
  ctx.fillStyle = bottomAmbient; ctx.fillRect(30, H - 200, W - 60, 180);
  const headerBar = ctx.createLinearGradient(60, 0, W * 0.6, 0);
  headerBar.addColorStop(0, t.A); headerBar.addColorStop(0.7, `${t.B}66`); headerBar.addColorStop(1, 'transparent');
  ctx.fillStyle = headerBar; ctx.fillRect(60, 54, 800, 3);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'white';
  ctx.font = font(900, 68);
  const hyperionsW = ctx.measureText('HYPERIONS').width;
  ctx.save();
  ctx.shadowColor = 'rgba(255,255,255,0.15)'; ctx.shadowBlur = 30;
  ctx.fillText('HYPERIONS', 62, 110);
  ctx.restore();
  const titleGrad = ctx.createLinearGradient(62, 80, 780, 80);
  titleGrad.addColorStop(0, t.A); titleGrad.addColorStop(1, t.B);
  ctx.fillStyle = titleGrad;
  ctx.font = font(200, 68);
  ctx.save();
  ctx.shadowColor = t.glow; ctx.shadowBlur = 20;
  ctx.fillText('VOUCH', 62 + hyperionsW + 28, 110);
  ctx.restore();
  const sepLine = ctx.createLinearGradient(62, 0, 1000, 0);
  sepLine.addColorStop(0, t.A); sepLine.addColorStop(0.4, t.B); sepLine.addColorStop(0.7, `${t.B}44`); sepLine.addColorStop(1, 'transparent');
  ctx.fillStyle = sepLine; ctx.fillRect(62, 128, 940, 2);
  ctx.fillStyle = sepLine; ctx.globalAlpha = 0.3; ctx.fillRect(62, 131, 940, 1); ctx.globalAlpha = 1;
  ctx.restore();
  const PAD = 24;
  const COL_LEFT_W   = 380;
  const COL_RIGHT_W  = 420;
  const COL_MID_W    = W - 60 * 2 - COL_LEFT_W - COL_RIGHT_W - PAD * 4;
  const PANEL_Y      = 218;
  const PANEL_H      = H - 48 - PANEL_Y - 50;
  const leftX   = 60;
  const midX    = leftX + COL_LEFT_W + PAD;
  const rightX  = midX + COL_MID_W + PAD;
  const PANEL_RADIUS = 28;
  for (const [px, pw] of [[leftX, COL_LEFT_W], [midX, COL_MID_W], [rightX, COL_RIGHT_W]]) {
    // Panel glass background
    fillRoundRect(ctx, px, PANEL_Y, pw, PANEL_H, PANEL_RADIUS, 'rgba(255,255,255,0.02)');
    fillRoundRect(ctx, px, PANEL_Y, pw, PANEL_H, PANEL_RADIUS, 'rgba(8,12,24,0.35)');
    ctx.save();
    roundRect(ctx, px, PANEL_Y, pw, PANEL_H, PANEL_RADIUS); ctx.clip();
    // Top tint gradient
    const panelTint = ctx.createLinearGradient(px, PANEL_Y, px, PANEL_Y + 120);
    panelTint.addColorStop(0, `${t.A}20`); panelTint.addColorStop(1, 'transparent');
    ctx.fillStyle = panelTint; ctx.fillRect(px, PANEL_Y, pw, 120);
    // Bottom subtle glow
    const panelBottom = ctx.createLinearGradient(px, PANEL_Y + PANEL_H - 80, px, PANEL_Y + PANEL_H);
    panelBottom.addColorStop(0, 'transparent'); panelBottom.addColorStop(1, `${t.B}0a`);
    ctx.fillStyle = panelBottom; ctx.fillRect(px, PANEL_Y + PANEL_H - 80, pw, 80);
    ctx.restore();
    // Gradient border
    const panelBorder = ctx.createLinearGradient(px, PANEL_Y, px + pw, PANEL_Y + PANEL_H);
    panelBorder.addColorStop(0, `${t.A}30`); panelBorder.addColorStop(0.5, 'rgba(255,255,255,0.08)'); panelBorder.addColorStop(1, `${t.B}20`);
    strokeRoundRect(ctx, px, PANEL_Y, pw, PANEL_H, PANEL_RADIUS, panelBorder, 1.2);
    // Accent bar with glow
    ctx.save();
    ctx.shadowColor = t.glow; ctx.shadowBlur = 12;
    roundRect(ctx, px, PANEL_Y, 4, PANEL_H, PANEL_RADIUS); ctx.clip();
    const accentBar = ctx.createLinearGradient(0, PANEL_Y, 0, PANEL_Y + PANEL_H);
    accentBar.addColorStop(0, t.A); accentBar.addColorStop(0.5, t.B); accentBar.addColorStop(1, 'transparent');
    ctx.fillStyle = accentBar; ctx.fillRect(px, PANEL_Y, 4, PANEL_H);
    ctx.restore();
  }
  const hcx = leftX + COL_LEFT_W / 2;
  const helperAvatar = await loadRemoteImage(data.helperAvatarUrl);
  const clientAvatar = await loadRemoteImage(data.clientAvatarUrl);
  const serviceImg   = await loadGameEmoji(gameKey);
  drawAvatar(ctx, helperAvatar, hcx, PANEL_Y + 140, 88, t.A, t.B, t.glow);
  ctx.save();
  ctx.shadowColor = t.glow; ctx.shadowBlur = 20;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'white';
  let nameFontSize = 38;
  ctx.font = font(800, nameFontSize);
  const maxNameW = COL_LEFT_W - 60;
  while (ctx.measureText(data.helperTag).width > maxNameW && nameFontSize > 22) {
    nameFontSize -= 2;
    ctx.font = font(800, nameFontSize);
  }
  ctx.fillText(data.helperTag, hcx, PANEL_Y + 295);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = font(500, 17);
  ctx.fillText(`${String(gameKey || 'HELPER').toUpperCase()} HELPER`, hcx, PANEL_Y + 325);
  const gameTag = String(gameLabel).toUpperCase();
  ctx.font = font(700, 18);
  const textWidth = ctx.measureText(gameTag).width;
  const contentW = (serviceImg ? 36 + 16 : 0) + textWidth;
  const badgeW = Math.max(200, contentW + 50);
  const badgeH = 58;
  const badgeX = hcx - badgeW / 2;
  const badgeY = PANEL_Y + 355;
  fillRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, 20, `${t.A}15`);
  strokeRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, 20, `${t.A}88`, 1.5);
  const contentStartX = hcx - contentW / 2;
  if (serviceImg) {
    ctx.drawImage(serviceImg, contentStartX, badgeY + 11, 36, 36);
    ctx.fillStyle = 'white';
    ctx.textAlign = 'left';
    ctx.fillText(gameTag, contentStartX + 52, badgeY + 35);
  } else {
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.fillText(gameTag, hcx, badgeY + 35);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(leftX + 30, PANEL_Y + 410, COL_LEFT_W - 60, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = font(600, 14);
  ctx.fillText('THIS SESSION', hcx, PANEL_Y + 448);
  const starY = PANEL_Y + 485, starGap = 60, starR = 24;
  const starsStartX = hcx - (4 * starGap) / 2;
  for (let i = 0; i < 5; i++) {
    drawStar(ctx, starsStartX + i * starGap, starY, starR, i < data.rating, t.A, t.B);
  }
  ctx.save();
  const ratingGrad = ctx.createLinearGradient(hcx - 60, 0, hcx + 60, 0);
  ratingGrad.addColorStop(0, t.A); ratingGrad.addColorStop(1, t.B);
  ctx.shadowColor = t.glow; ctx.shadowBlur = 30;
  ctx.fillStyle = ratingGrad; ctx.font = font(900, 72);
  ctx.fillText(`${Number(data.rating || 0).toFixed(1)}`, hcx, PANEL_Y + 570);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = font(400, 18);
  ctx.fillText('/ 5.0 PERFECT SCORE', hcx, PANEL_Y + 615);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(leftX + 30, PANEL_Y + 635, COL_LEFT_W - 60, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.font = font(500, 14);
  ctx.fillText(`ID ${data.helperId}`, hcx, PANEL_Y + PANEL_H - 30);
  ctx.textAlign = 'left';
  const midLabelGrad = ctx.createLinearGradient(midX + 30, 0, midX + 300, 0);
  midLabelGrad.addColorStop(0, t.A); midLabelGrad.addColorStop(1, t.B);
  ctx.fillStyle = midLabelGrad; ctx.font = font(700, 15);
  ctx.fillText('CLIENT TESTIMONIAL', midX + 30, PANEL_Y + 52);
  ctx.fillStyle = `${t.A}12`; ctx.font = font(900, 200);
  ctx.fillText('"', midX + 18, PANEL_Y + 200);
  ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.font = font(500, 32);
  const wrapped = wrapText(ctx, data.message, COL_MID_W - 80);
  const lineH = 50;
  const msgY = PANEL_Y + 145;
  for (let i = 0; i < Math.min(wrapped.length, 8); i++) {
    ctx.fillText(wrapped[i], midX + 46, msgY + i * lineH);
  }
  const stripH = 92, stripY = PANEL_Y + PANEL_H - 120;
  const stripW = COL_MID_W - 60;
  fillRoundRect(ctx, midX + 30, stripY, stripW, stripH, 22, 'rgba(255,255,255,0.035)');
  strokeRoundRect(ctx, midX + 30, stripY, stripW, stripH, 22, 'rgba(255,255,255,0.1)', 1);
  if (clientAvatar) {
    ctx.save();
    ctx.beginPath(); ctx.arc(midX + 74 + 10, stripY + 46, 30, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(clientAvatar, midX + 44 + 10, stripY + 16, 60, 60);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = `${t.B}88`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(midX + 74 + 10, stripY + 46, 32, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = 'white'; ctx.font = font(700, 26);
  ctx.fillText(data.clientTag, midX + 130, stripY + 40);
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = font(400, 15);
  ctx.fillText('Verified Feedback · ' + formatDateStamp(), midX + 130, stripY + 65);
  if (data.rating === 5) {
    const sealCx = midX + COL_MID_W - 140;
    const sealCy = PANEL_Y + 130;
    ctx.save();
    ctx.translate(sealCx, sealCy);
    const sealG = ctx.createRadialGradient(0, 0, 8, 0, 0, 48);
    sealG.addColorStop(0, 'rgba(255,248,190,0.98)');
    sealG.addColorStop(1, 'rgba(255,190,0,0.15)');
    ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 30;
    ctx.beginPath(); ctx.arc(0, 0, 48, 0, Math.PI * 2);
    ctx.fillStyle = sealG; ctx.fill();
    ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2; ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#3a2500'; ctx.textAlign = 'center'; ctx.font = font(900, 22);
    ctx.fillText('5.0', 0, -2);
    ctx.font = font(700, 10);
    ctx.fillText('PERFECT', 0, 14);
    ctx.restore();
  }
  if (serviceImg) {
    const iconX = midX + COL_MID_W - 88;
    const iconY = PANEL_Y + 18;
    fillRoundRect(ctx, iconX, iconY, 70, 70, 18, `${t.A}20`);
    strokeRoundRect(ctx, iconX, iconY, 70, 70, 18, `${t.A}66`, 1.5);
    ctx.drawImage(serviceImg, iconX + 15, iconY + 15, 40, 40);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = midLabelGrad; ctx.font = font(700, 15);
  ctx.fillText('CARRY STATS', rightX + 28, PANEL_Y + 52);
  const statCards = [
    { label: 'TOTAL VOUCHES',  value: String(data.stats.total),                   sub: 'Lifetime sessions',             color: t.A },
    { label: 'AVG RATING',     value: `${data.stats.average.toFixed(1)} / 5`,     sub: 'Average score',                 color: t.B },
    { label: '5-STAR RATE',    value: `${Math.round(data.stats.fiveStarRate)}%`,    sub: 'Perfect score rate',            color: '#3effa0' },
    { label: 'TOP SERVICE',    value: String(data.stats.topGame || gameLabel || gameKey || '—'),  sub: 'Primary game',           color: '#ffffff' }
  ];
  const cardH = (PANEL_H - 90) / 4 - 10;
  for (let i = 0; i < statCards.length; i++) {
    const sc = statCards[i];
    const cy2 = PANEL_Y + 70 + i * (cardH + 10);
    const cx2 = rightX + 18;
    const cw  = COL_RIGHT_W - 36;
    fillRoundRect(ctx, cx2, cy2, cw, cardH, 20, 'rgba(255,255,255,0.03)');
    strokeRoundRect(ctx, cx2, cy2, cw, cardH, 20, `${sc.color}30`, 1);
    ctx.save();
    roundRect(ctx, cx2, cy2, 5, cardH, 3); ctx.clip();
    const stripe = ctx.createLinearGradient(0, cy2, 0, cy2 + cardH);
    stripe.addColorStop(0, sc.color); stripe.addColorStop(1, `${sc.color}44`);
    ctx.fillStyle = stripe; ctx.fillRect(cx2, cy2, 5, cardH);
    ctx.restore();
    ctx.save();
    roundRect(ctx, cx2, cy2, cw, cardH, 20); ctx.clip();
    const cardShine = ctx.createLinearGradient(cx2, cy2, cx2, cy2 + 40);
    cardShine.addColorStop(0, `${sc.color}12`); cardShine.addColorStop(1, 'transparent');
    ctx.fillStyle = cardShine; ctx.fillRect(cx2, cy2, cw, 40);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = font(600, 14);
    ctx.fillText(sc.label, cx2 + 24, cy2 + 36);
    ctx.save();
    ctx.shadowColor = sc.color; ctx.shadowBlur = 12;
    ctx.fillStyle = sc.color;
    ctx.font = font(900, sc.value.length > 12 ? 26 : 36);
    ctx.fillText(sc.value, cx2 + 24, cy2 + cardH - 48);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.font = font(400, 14);
    ctx.fillText(sc.sub, cx2 + 24, cy2 + cardH - 22);
  }
  ctx.save();
  roundRect(ctx, 30, 24, W - 60, H - 48, 40); ctx.clip();
  const bottomBar = ctx.createLinearGradient(0, H - 72, 0, H - 24);
  bottomBar.addColorStop(0, 'transparent'); bottomBar.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = bottomBar; ctx.fillRect(30, H - 74, W - 60, 50);
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = font(500, 15);
  ctx.fillText(`Issued ${formatDateStamp()}  ·  Helper ${data.helperId}  ·  hyperionsapplication.xyz`, 60, H - 40);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.font = font(500, 15);
  ctx.fillText('HYPERIONS SERVICE', W - 60, H - 40);
  return { buffer: canvas.toBuffer('image/png') };
}
async function buildHelperProfileCard(data) {
  const W = 1500, H = 1000;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const t = getTheme(data.topGame || 'default');
  drawPremiumBackground(ctx, W, H, t);
  const P_MARGIN = 40;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 80; ctx.shadowOffsetY = 30;
  fillRoundRect(ctx, P_MARGIN, P_MARGIN, W - P_MARGIN * 2, H - P_MARGIN * 2, 38, 'rgba(6,9,18,0.55)');
  ctx.restore();
  fillRoundRect(ctx, P_MARGIN, P_MARGIN, W - P_MARGIN * 2, H - P_MARGIN * 2, 38, 'rgba(255,255,255,0.01)');
  strokeRoundRect(ctx, P_MARGIN, P_MARGIN, W - P_MARGIN * 2, H - P_MARGIN * 2, 38, 'rgba(255,255,255,0.06)', 1.5);

  const logo = await loadRemoteImage('https://hyperionsapplication.xyz/logo.png');
  if (logo) {
    ctx.save();
    ctx.globalAlpha = 0.05;

    ctx.drawImage(logo, W - 520, H - 480, 420, 420);
    ctx.restore();
  }

  ctx.save();
  roundRect(ctx, P_MARGIN, P_MARGIN, W - P_MARGIN * 2, 8, 38); ctx.clip();
  const topBar = ctx.createLinearGradient(P_MARGIN, 0, W - P_MARGIN, 0);
  topBar.addColorStop(0, t.A); topBar.addColorStop(1, t.B);
  ctx.fillStyle = topBar; ctx.fillRect(P_MARGIN, P_MARGIN, W - P_MARGIN * 2, 8);
  ctx.restore();

  ctx.fillStyle = 'white';
  ctx.font = font(900, 56);
  const w1 = ctx.measureText('HELPER').width;
  ctx.fillText('HELPER', P_MARGIN + 60, 185);
  ctx.fillStyle = t.B;
  ctx.font = font(200, 56);
  ctx.fillText('PROFILE', P_MARGIN + 60 + w1 + 18, 185);

  const L_WIDTH = 450;
  const R_X = P_MARGIN + 60 + L_WIDTH + 40;
  const cx = P_MARGIN + 60 + L_WIDTH / 2;

  fillRoundRect(ctx, P_MARGIN + 60, 240, L_WIDTH, 654, 24, 'rgba(255,255,255,0.02)');
  strokeRoundRect(ctx, P_MARGIN + 60, 240, L_WIDTH, 654, 24, 'rgba(255,255,255,0.05)', 1);

  const avatar = await loadRemoteImage(data.avatarUrl);
  drawAvatar(ctx, avatar, cx, 460, 120, t.A, t.B, t.glow);

  ctx.textAlign = 'center';
  ctx.save();
  ctx.shadowColor = t.glow; ctx.shadowBlur = 24;
  ctx.fillStyle = 'white'; ctx.font = font(900, 42);
  ctx.fillText(data.helperTag, cx, 660);
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = font(600, 16);
  ctx.fillText(data.topGame ? `${String(data.topGame).toUpperCase()} HELPER` : 'HELPER', cx, 700);

  const rkTxt = String(data.rankLabel || 'HELPER').toUpperCase();
  ctx.font = font(800, 18);
  const rW = ctx.measureText(rkTxt).width + 60;
  fillRoundRect(ctx, cx - rW/2, 740, rW, 44, 22, `${t.A}25`);
  strokeRoundRect(ctx, cx - rW/2, 740, rW, 44, 22, `${t.A}88`, 1.5);
  ctx.fillStyle = t.B; ctx.fillText(rkTxt, cx, 768);

  const gap = 24;
  const bW = (W - R_X - P_MARGIN - 60 - gap) / 2;
  const bH = 150;
  const topY = 240;

  const drawMetricBox = (x, y, w, h, title, val, sub, col, useGlow) => {
    fillRoundRect(ctx, x, y, w, h, 20, 'rgba(255,255,255,0.03)');
    strokeRoundRect(ctx, x, y, w, h, 20, `${col}33`, 1.5);

    ctx.save();
    roundRect(ctx, x, y, 6, h, 4); ctx.clip();
    const lGrad = ctx.createLinearGradient(0, y, 0, y + h);
    lGrad.addColorStop(0, col); lGrad.addColorStop(1, `${col}55`);
    ctx.fillStyle = lGrad; ctx.fillRect(x, y, 6, h);
    ctx.restore();

    ctx.save();
    roundRect(ctx, x, y, w, h, 20); ctx.clip();
    const aura = ctx.createLinearGradient(x, y, x, y + 80);
    aura.addColorStop(0, `${col}15`); aura.addColorStop(1, 'transparent');
    ctx.fillStyle = aura; ctx.fillRect(x, y, w, 80);
    ctx.restore();

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = font(700, 15);
    ctx.fillText(title, x + 30, y + 42);

    if (useGlow) {
      ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 24;
    }
    ctx.fillStyle = 'white';
    ctx.font = font(900, 56);
    ctx.fillText(val, x + 30, y + 105);
    if (useGlow) ctx.restore();

    ctx.fillStyle = col; ctx.font = font(600, 15);
    ctx.fillText(sub, x + 30, y + 135);
  };

  drawMetricBox(R_X, topY, bW, bH, 'CARRY VOUCHES', String(data.total), 'LIFETIME VERIFIED VOUCHES', t.A, true);
  drawMetricBox(R_X + bW + gap, topY, bW, bH, 'HELPER RANK', `#${data.rank || '—'}`, 'GLOBAL STANDING', t.B, true);

  const ratingVal = (Number(data.average) || 0).toFixed(2);
  const rateVal = `${(Number(data.fiveStarRate) || 0).toFixed(1)}%`;
  drawMetricBox(R_X, topY + bH + gap, bW, bH, 'AVERAGE SCORE', `${ratingVal} / 5`, 'OVERALL RATING', '#ffd700', false);
  drawMetricBox(R_X + bW + gap, topY + bH + gap, bW, bH, '5-STAR RATE', rateVal, 'PERFECT SCORE PERCENTAGE', '#3effa0', false);

  const starY = topY + bH + gap + 40;
  const starXEnd = R_X + bW - 15;
  for (let s = 4; s >= 0; s--) {
    drawStar(ctx, starXEnd - (4-s) * 32, starY, 11, s < Math.round(data.average || 0), '#ffd700', '#ffa500');
  }

  const weeklyV = String(data.weeklyVouches || 0);
  const monthlyV = String(data.monthlyVouches || 0);
  const row3Y = topY + (bH + gap) * 2;
  drawMetricBox(R_X, row3Y, bW, bH, 'WEEKLY VOUCHES', weeklyV, 'VOUCHES THIS WEEK', '#6c8eff', false);
  drawMetricBox(R_X + bW + gap, row3Y, bW, bH, 'MONTHLY VOUCHES', monthlyV, 'VOUCHES THIS MONTH', '#ff8c00', false);

  const fullY = topY + (bH + gap) * 3;
  const fullW = bW * 2 + gap;
  fillRoundRect(ctx, R_X, fullY, fullW, 132, 20, 'rgba(255,255,255,0.025)');
  strokeRoundRect(ctx, R_X, fullY, fullW, 132, 20, `${t.A}40`, 1.5);

  ctx.save();
  roundRect(ctx, R_X, fullY, 6, 132, 4); ctx.clip();
  ctx.fillStyle = t.A; ctx.fillRect(R_X, fullY, 6, 132);
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = font(700, 15);
  ctx.fillText('PRIMARY SPECIALIZATION', R_X + 30, fullY + 40);

  ctx.save();
  ctx.shadowColor = t.glow; ctx.shadowBlur = 20;
  ctx.fillStyle = 'white'; ctx.font = font(900, 48);
  ctx.fillText(String(data.topGame || 'GENERALIST').toUpperCase(), R_X + 30, fullY + 98);
  ctx.restore();

  ctx.textAlign = 'left'; ctx.font = font(500, 15);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillText(`DATABASE VALID AS OF ${formatDateStamp()}`, P_MARGIN + 60, H - P_MARGIN - 20);

  ctx.textAlign = 'right';
  ctx.fillText('HYPERIONS CARRY NETWORK', W - P_MARGIN - 60, H - P_MARGIN - 20);

  return { buffer: canvas.toBuffer('image/png') };
}
async function buildLeaderboardCard(data) {
  const entries = (data.entries || []).slice(0, 15);
  const entriesCount = entries.length;
  const W = 1600;
  const L = 80;

  const HERO_Y = 220;
  const HERO_H = 320;
  const SPACING = 80;
  const HEADER_Y = HERO_Y + HERO_H + SPACING;
  const ROW_H = 82;
  const listEntries = entries.slice(1);
  const listCount = listEntries.length;

  const H = Math.max(1000, HEADER_Y + (listCount * ROW_H) + 180);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const t = { A: '#bb86fc', B: '#e0bcff', dark: '#05020a', mid: '#0d0619', glow: '#6a30c2' };

  const logoImg = await loadRemoteImage('https://hyperionsapplication.xyz/logo.png').catch(() => null);

  drawPremiumBackground(ctx, W, H, t);

  if (logoImg) {
    ctx.save(); ctx.globalAlpha = 0.05;
    ctx.drawImage(logoImg, W - 300, 40, 250, 250);
    ctx.restore();
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = 'white';
  ctx.font = font(900, 84);
  const tfTitle = (data.title || "ALL-TIME").toUpperCase();
  const title = `${tfTitle} LEADERBOARD`;
  ctx.fillText(title, W / 2, 130);

  const lineGr = ctx.createLinearGradient(120, 185, W - 120, 185);
  lineGr.addColorStop(0, 'transparent'); lineGr.addColorStop(0.5, t.A); lineGr.addColorStop(1, 'transparent');
  ctx.fillStyle = lineGr; ctx.fillRect(120, 185, W - 240, 2);

  const cols = { rank: L + 40, helper: L + 140, vouches: L + 680, avg: L + 920, stars: L + 1160 };

  if (entriesCount > 0) {
    const hero = entries[0];
    const hX = L;
    const hW = W - L * 2;

    const hG = ctx.createLinearGradient(hX, HERO_Y, hX + hW, HERO_Y);
    hG.addColorStop(0, 'rgba(255, 223, 0, 0.12)');
    hG.addColorStop(1, 'rgba(255, 223, 0, 0.03)');
    fillRoundRect(ctx, hX, HERO_Y, hW, HERO_H, 40, hG);
    strokeRoundRect(ctx, hX, HERO_Y, hW, HERO_H, 40, 'rgba(255, 223, 0, 0.4)', 4);

    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255, 223, 0, 0.08)';
    ctx.font = font(900, 180);
    ctx.fillText("#1", hX + hW - 40, HERO_Y + HERO_H - 40);
    ctx.restore();

    const hAvatarImg = hero.avatarImg;
    const hAvatarX = hX + 180;
    const hAvatarY = HERO_Y + HERO_H / 2;
    if (hAvatarImg) {
       drawAvatar(ctx, hAvatarImg, hAvatarX, hAvatarY, 110, '#ffdf00', '#ffd700', '#ffdf00');
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffdf00';
    ctx.font = font(900, 32);
    ctx.fillText("SERVER CHAMPION", hX + 340, HERO_Y + 100);

    ctx.fillStyle = 'white';
    ctx.font = font(900, 82);
    ctx.fillText(hero.helperTag || 'Unknown', hX + 340, HERO_Y + 185);

    const heroStatsX = hX + 340;
    const heroStatsY = HERO_Y + 250;

    fillRoundRect(ctx, heroStatsX, heroStatsY, 240, 50, 12, 'rgba(255,255,255,0.08)');
    ctx.fillStyle = '#ffdf00';
    ctx.font = font(900, 34);
    const vouchStr = String(hero.total || 0);
    const vouchW = ctx.measureText(vouchStr).width;
    ctx.fillText(vouchStr, heroStatsX + 20, heroStatsY + 37);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = font(600, 16);

    ctx.fillText("TOTAL VOUCHES", heroStatsX + 26 + vouchW, heroStatsY + 37);

    fillRoundRect(ctx, heroStatsX + 260, heroStatsY, 150, 50, 12, 'rgba(255,255,255,0.08)');
    ctx.fillStyle = 'white';
    ctx.font = font(900, 34);
    const rText = (hero.average || 0).toFixed(2);
    const rW = ctx.measureText(rText).width;
    ctx.fillText(rText, heroStatsX + 275, heroStatsY + 37);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = font(600, 16);
    ctx.fillText("RATING", heroStatsX + 281 + rW, heroStatsY + 37);

    ctx.fillStyle = '#ffdf00';
    ctx.font = font(800, 24);
    ctx.textAlign = 'right';
    ctx.fillText(hero.rankLabel || 'PRO HELPER', hX + hW - 50, HERO_Y + 60);
  }

  const MEDAL_COLORS = [{ c: '#ffdf00', g: '#ffe959' }, { c: '#c0c0c0', g: '#e0e0e0' }, { c: '#cd7f32', g: '#e69a53' }];

  fillRoundRect(ctx, L, HEADER_Y - 28, W - L * 2, 44, 8, 'rgba(255,255,255,0.05)');

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.70)';
  ctx.font = font(800, 20);
  ctx.fillText("RANK", cols.rank, HEADER_Y);
  ctx.textAlign = 'left';
  ctx.fillText("OPERATOR / HELPER", cols.helper + 75, HEADER_Y);
  ctx.textAlign = 'center';
  ctx.fillText("VOUCHES", cols.vouches, HEADER_Y);
  ctx.fillText("AVG. RATING", cols.avg, HEADER_Y);
  ctx.fillText("5-STAR RATE", cols.stars, HEADER_Y);

  const sepGr = ctx.createLinearGradient(L, 0, W - L, 0);
  sepGr.addColorStop(0, 'transparent');
  sepGr.addColorStop(0.2, `${t.A}88`);
  sepGr.addColorStop(0.8, `${t.B}88`);
  sepGr.addColorStop(1, 'transparent');
  ctx.fillStyle = sepGr;
  ctx.fillRect(L, HEADER_Y + 10, W - L * 2, 2);

  const rowStartY = HEADER_Y + 30;

  for (let i = 0; i < listEntries.length; i++) {
    const e = listEntries[i];
    const actualRank = i + 2;
    const ry = rowStartY + i * ROW_H;
    const isTop = (actualRank <= 3);
    const rH = ROW_H - 12;

    fillRoundRect(ctx, L, ry, W - L * 2, rH, 18, isTop ? `rgba(255,255,255,0.06)` : `rgba(255,255,255,0.02)`);
    if (isTop) strokeRoundRect(ctx, L, ry, W - L * 2, rH, 18, `${MEDAL_COLORS[actualRank - 1].c}33`, 2);

    ctx.textAlign = 'left';
    ctx.fillStyle = isTop ? MEDAL_COLORS[actualRank - 1].c : 'rgba(255,255,255,0.5)';
    ctx.font = font(isTop ? 900 : 700, isTop ? 30 : 22);

    const rankFontSize = isTop ? 30 : 22;
    ctx.fillText(`#${actualRank}`, isTop ? cols.rank - 15 : cols.rank - 5, ry + rH / 2 + rankFontSize / 3);

    const avatar = e.avatarImg;
    if (avatar) {
      const aR = 28, ax = cols.helper, ay = ry + rH / 2;
      ctx.save(); ctx.beginPath(); ctx.arc(ax + aR, ay, aR, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(avatar, ax, ay - aR, aR * 2, aR * 2); ctx.restore();
    }

    const nameFontSize = 26;
    ctx.fillStyle = isTop ? 'white' : '#ffffffcc';
    ctx.font = font(800, nameFontSize);

    ctx.fillText(e.helperTag || 'Unknown', cols.helper + 75, ry + rH / 2 + nameFontSize / 3);

    const vouchFontSize = 30;
    ctx.textAlign = 'center';
    ctx.fillStyle = isTop ? MEDAL_COLORS[actualRank - 1].c : 'white';
    ctx.font = font(900, vouchFontSize);
    ctx.fillText(String(e.total || 0), cols.vouches, ry + rH / 2 + vouchFontSize / 3);

    const ratingFontSize = 24;
    ctx.fillStyle = '#ffffff99';
    ctx.font = font(700, ratingFontSize);
    ctx.fillText((e.average || 0).toFixed(2), cols.avg, ry + rH / 2 + ratingFontSize / 3);

    const starRateFontSize = 22;
    ctx.fillStyle = (e.fiveStarRate >= 90) ? '#3effa0' : '#ffffff66';
    ctx.font = font(600, starRateFontSize);
    ctx.fillText(`${(e.fiveStarRate || 0).toFixed(1)}%`, cols.stars, ry + rH / 2 + starRateFontSize / 3);
  }

  ctx.textAlign = 'center'; ctx.font = font(400, 14); ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillText(`HYPERIONS BOT · SYSTEM STATUS · ${formatDateStamp()}`, W / 2, H - 40);

  return { buffer: canvas.toBuffer('image/png') };
}
async function buildBotStatusCard(data) {
  const W = 1200, H = 800;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const t = getTheme('default');
  drawPremiumBackground(ctx, W, H, t);
  const M = 40;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 80; ctx.shadowOffsetY = 30;
  fillRoundRect(ctx, M, M, W - M * 2, H - M * 2, 32, 'rgba(6,9,18,0.6)');
  ctx.restore();
  fillRoundRect(ctx, M, M, W - M * 2, H - M * 2, 32, 'rgba(255,255,255,0.01)');
  const shellBorder = ctx.createLinearGradient(M, M, W - M, H - M);
  shellBorder.addColorStop(0, `${t.A}40`); shellBorder.addColorStop(0.5, 'rgba(255,255,255,0.06)'); shellBorder.addColorStop(1, `${t.B}30`);
  strokeRoundRect(ctx, M, M, W - M * 2, H - M * 2, 32, shellBorder, 1.5);
  const logo = await loadRemoteImage('https://hyperionsapplication.xyz/logo.png');
  if (logo) {
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.drawImage(logo, W - 350, 60, 280, 280);
    ctx.restore();
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = font(700, 14);
  ctx.letterSpacing = '5px';
  ctx.fillText('HYPERIONS · SYSTEM STATUS MONITOR', M + 50, M + 60);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = 'white';
  ctx.font = font(900, 52);
  ctx.fillText('SYSTEM', M + 50, M + 120);
  ctx.fillStyle = t.A;
  ctx.font = font(200, 52);
  ctx.fillText('OPERATIONAL', M + 50 + ctx.measureText('SYSTEM ').width, M + 120);
  const lineG = ctx.createLinearGradient(M + 50, 0, W - M - 50, 0);
  lineG.addColorStop(0, t.A); lineG.addColorStop(0.5, t.B); lineG.addColorStop(1, 'transparent');
  ctx.fillStyle = lineG; ctx.fillRect(M + 50, M + 140, W - (M + 50) * 2, 2);
  const gridX = M + 50, gridY = M + 180, bW = 340, bH = 140, gap = 24;
  const drawStat = (x, y, w, h, label, val, sub, col) => {
    fillRoundRect(ctx, x, y, w, h, 20, 'rgba(255,255,255,0.03)');
    strokeRoundRect(ctx, x, y, w, h, 20, 'rgba(255,255,255,0.06)', 1);
    ctx.save(); roundRect(ctx, x, y, 6, h, 3); ctx.clip();
    ctx.fillStyle = col; ctx.fillRect(x, y, 6, h); ctx.restore();
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = font(700, 14);
    ctx.fillText(label, x + 25, y + 38);
    ctx.fillStyle = 'white';
    ctx.font = font(900, 48);
    ctx.fillText(val, x + 25, y + 95);
    ctx.fillStyle = col;
    ctx.font = font(600, 14);
    ctx.fillText(sub, x + 25, y + 122);
  };
  drawStat(gridX,           gridY,          bW, bH, 'TOTAL TICKETS', String(data.totalTickets || 0), 'LIFETIME PROCESSED', t.A);
  drawStat(gridX + bW + gap, gridY,          bW, bH, 'OPEN SESSIONS', String(data.openTickets || 0), 'CURRENTLY ACTIVE', '#3effa0');
  drawStat(gridX + (bW + gap) * 2, gridY,    bW, bH, 'TOTAL VOUCHES', String(data.totalVouches || 0), 'VERIFIED FEEDBACK', t.B);
  drawStat(gridX,           gridY + bH + gap, bW, bH, 'UPTIME', data.uptime || '0h 0m', 'CONTINUOUS ONLINE', '#ffd700');
  drawStat(gridX + bW + gap, gridY + bH + gap, bW, bH, 'LATENCY', `${data.ping || 0}MS`, 'HEARTBEAT DELAY', '#ff6b6b');
  drawStat(gridX + (bW + gap) * 2, gridY + bH + gap, bW, bH, 'SERVERS', '1', 'CONNECTED GUILDS', '#6c4dff');
  const fullW = W - (M + 50) * 2;
  const fullY = gridY + (bH + gap) * 2;
  fillRoundRect(ctx, gridX, fullY, fullW, 200, 24, 'rgba(255,255,255,0.02)');
  strokeRoundRect(ctx, gridX, fullY, fullW, 200, 24, 'rgba(255,255,255,0.05)', 1.5);
  ctx.save(); roundRect(ctx, gridX, fullY, 6, 200, 4); ctx.clip();
  ctx.fillStyle = t.A; ctx.fillRect(gridX, fullY, 6, 200); ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = font(700, 14);
  ctx.fillText('INFRASTRUCTURE & NODES', gridX + 30, fullY + 40);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = font(500, 18);
  const infoLines = [
    `• ENVIRONMENT: ${process.env.NODE_ENV || 'PRODUCTION'}`,
    `• DATABASE: SUPABASE (CONNECTED)`,
    `• COMPUTE: NORTHFLANK WORKER (ACTIVE)`,
    `• REGION: EUROPE-WEST (FRA)`,
    `• MEMORY: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB / ${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`
  ];
  infoLines.forEach((text, i) => ctx.fillText(text, gridX + 30, fullY + 75 + i * 26));
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.font = font(400, 13);
  ctx.fillText(`HYPERIONS MONITORING AGENT v2.4.0  |  TIMESTAMP: ${new Date().toISOString()}`, W / 2, H - 65);
  return { buffer: canvas.toBuffer('image/png') };
}
async function buildLeaderboardCardWithAvatars(data) {
  const entries = await Promise.all((data.entries || []).map(async e => ({
    ...e, avatarImg: await loadRemoteImage(e.avatarUrl).catch(() => null)
  })));
  return buildLeaderboardCard({ ...data, entries });
}
module.exports = {
  buildVouchCard,
  buildHelperProfileCard,
  buildLeaderboardCard: buildLeaderboardCardWithAvatars,
  buildBotStatusCard
};

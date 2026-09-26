// 1080x1920 story cards drawn on a canvas, shared with the Web Share API
// (file), with a download fallback. Never posted automatically.
import { CATEGORIES, USER_TYPES } from '../config.js';
import { qrDataUrl } from './device.js';

const W = 1080;
const H = 1920;
const C = { bg: '#F4F2EC', dark: '#16231C', green: '#1E5A3F', greenLight: '#BFE3CB', tile: '#2A3A31', muted: '#C9D3CD', orange: '#E07A2E', card: '#FFFFFF', track: '#ECEAE2' };

function load(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function cover(ctx, img, x, y, w, h, blur) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 36);
  ctx.clip();
  if (!img) {
    ctx.fillStyle = C.tile;
    ctx.fillRect(x, y, w, h);
  } else {
    const s = Math.max(w / img.width, h / img.height);
    if (blur) ctx.filter = 'blur(28px)';
    ctx.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s);
    ctx.filter = 'none';
  }
  ctx.restore();
}

function text(ctx, str, x, y, { size = 48, weight = 700, color = '#fff', font = 'Figtree', max = W - 160, lh = 1.2 } = {}) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "${font}", system-ui, sans-serif`;
  const words = String(str).split(/\s+/);
  let line = '';
  let yy = y;
  words.forEach((w) => {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > max && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += size * lh;
    } else line = test;
  });
  if (line) ctx.fillText(line, x, yy);
  return yy + size * lh;
}

// data: { template, name, points, lifetimePoints, nextPhase, userType, category, actionTitle, beforeUrl, afterUrl, impact, kg, link }
export async function drawStory(canvas, data, { blur = false, showName = true } = {}) {
  await document.fonts?.ready;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.dark;
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = C.green;
  ctx.beginPath();
  ctx.roundRect(80, 90, 96, 96, 26);
  ctx.fill();
  text(ctx, 'G', 108, 160, { size: 64, weight: 800, font: 'Bricolage Grotesque' });
  text(ctx, 'GreenELB', 200, 158, { size: 56, weight: 800, font: 'Bricolage Grotesque' });
  let y = 300;
  if (showName && data.name) y = text(ctx, data.name, 80, y, { size: 44, weight: 600, color: C.greenLight });

  if (data.template === 'before_after') {
    y = text(ctx, 'Before and after', 80, y + 30, { size: 88, weight: 800, font: 'Bricolage Grotesque', lh: 1.05 });
    const [b, a] = await Promise.all([load(data.beforeUrl), load(data.afterUrl)]);
    cover(ctx, b, 80, y + 20, W - 160, 520, blur);
    cover(ctx, a, 80, y + 580, W - 160, 520, blur);
    text(ctx, 'BEFORE', 120, y + 90, { size: 36, weight: 800 });
    text(ctx, 'AFTER', 120, y + 650, { size: 36, weight: 800 });
    y += 1150;
    text(ctx, data.actionTitle || '', 80, y, { size: 44, weight: 700, color: C.muted });
  } else if (data.template === 'type') {
    const t = USER_TYPES[data.userType];
    y = text(ctx, 'My changemaker type', 80, y + 40, { size: 48, weight: 600, color: C.muted });
    y = text(ctx, t?.name || '', 80, y + 40, { size: 140, weight: 800, font: 'Bricolage Grotesque', lh: 1 });
    y = text(ctx, data.userTypeLine || t?.line || '', 80, y + 40, { size: 56, weight: 500, lh: 1.3 });
  } else if (data.template === 'datacard') {
    y = text(ctx, 'My data card', 80, y + 40, { size: 88, weight: 800, font: 'Bricolage Grotesque' });
    ctx.fillStyle = C.tile;
    ctx.beginPath();
    ctx.roundRect(80, y + 20, W - 160, 560, 36);
    ctx.fill();
    text(ctx, data.impact || '', 130, y + 140, { size: 64, weight: 700, max: W - 260, lh: 1.25 });
    text(ctx, data.actionTitle || '', 130, y + 480, { size: 40, weight: 500, color: C.muted, max: W - 260 });
    y += 640;
  } else {
    y = text(ctx, 'Green Points', 80, y + 40, { size: 48, weight: 600, color: C.muted });
    y = text(ctx, `+${data.points}`, 80, y + 130, { size: 260, weight: 800, font: 'Bricolage Grotesque', color: C.greenLight, lh: 1 });
    y = text(ctx, data.actionTitle || '', 80, y + 20, { size: 56, weight: 700 });
    if (data.nextPhase) {
      y = text(ctx, `${data.lifetimePoints} / ${data.nextPhase.points} to ${data.nextPhase.title}`, 80, y + 40, { size: 40, weight: 500, color: C.muted });
      ctx.fillStyle = C.tile;
      ctx.beginPath(); ctx.roundRect(80, y, W - 160, 28, 14); ctx.fill();
      ctx.fillStyle = C.greenLight;
      ctx.beginPath(); ctx.roundRect(80, y, (W - 160) * Math.min(1, data.lifetimePoints / data.nextPhase.points), 28, 14); ctx.fill();
    }
  }

  // Footer: QR to the next open action with the referral code
  if (data.link) {
    const qr = await load(qrDataUrl(data.link, 360));
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.roundRect(80, H - 420, 320, 320, 28); ctx.fill();
    if (qr) ctx.drawImage(qr, 100, H - 400, 280, 280);
    text(ctx, 'Scan to join the next action in Elbasan', 440, H - 300, { size: 44, weight: 700, max: W - 520 });
    if (data.category) text(ctx, CATEGORIES[data.category]?.label || '', 440, H - 150, { size: 36, weight: 600, color: C.greenLight });
  }
  return canvas;
}

export async function shareCanvas(canvas, { title = 'GreenELB', text: msg = '', url = '' } = {}) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const file = new File([blob], 'greenelb-story.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text: [msg, url].filter(Boolean).join(' ') });
      return 'shared';
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'greenelb-story.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'downloaded';
}

export const whatsappUrl = (msg, url) => `https://wa.me/?text=${encodeURIComponent(`${msg} ${url}`)}`;
export const facebookUrl = (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
export const shareLink = (path, { ref, src }) => {
  const u = new URL(path, location.origin);
  if (ref) u.searchParams.set('ref', ref);
  if (src) u.searchParams.set('src', src);
  return u.toString();
};

// Device features: location, in-app camera, QR show/scan.
import { CITY } from '../config.js';
import { html, icon } from './ui.js';

// ---------- location ----------
// Demo mode (set by the server) can pretend the phone is at the spot, because
// the hackathon venue is not in Elbasan. Real mode always uses the GPS.
const DEMO_KEY = 'greenelb-demo-here';
export const demoHere = {
  get on() { try { return localStorage.getItem(DEMO_KEY) === '1'; } catch { return false; } },
  set on(v) { try { localStorage.setItem(DEMO_KEY, v ? '1' : '0'); } catch { /* ignore */ } },
};

export function getLocation({ target = null, demo = false } = {}) {
  if (demo && demoHere.on) {
    const t = target || CITY;
    const j = () => (Math.random() - 0.5) * 0.0003;
    return Promise.resolve({ lat: t.lat + j(), lng: t.lng + j(), demo: true });
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This device has no location service.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (err) => reject(new Error(err.code === 1 ? 'Location is blocked. Allow location for GreenELB in your browser settings.' : 'Could not get your location. Try again outside.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  });
}

// ---------- average hash for duplicate checks ----------
function ahash(source) {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 8;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, 8, 8);
  const d = ctx.getImageData(0, 0, 8, 8).data;
  const g = [];
  for (let i = 0; i < 64; i++) g.push(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
  const mean = g.reduce((a, b) => a + b, 0) / 64;
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += ((g[i] > mean) << 3 | (g[i + 1] > mean) << 2 | (g[i + 2] > mean) << 1 | (g[i + 3] > mean)).toString(16);
  return hex;
}

// ---------- in-app camera (no gallery uploads) ----------
export function takePhoto({ title = 'Take a photo', hint = '', target = null, demo = false } = {}) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', title);
    el.innerHTML = html`
      <div class="bar"><strong>${title}</strong><button class="iconbtn" type="button" data-close aria-label="Close camera">${icon('x', 24)}</button></div>
      <video playsinline autoplay muted></video>
      <p class="small" data-msg style="padding:0 20px;color:#C9D3CD">${hint}</p>
      <div class="controls"><button class="shutter" type="button" data-shoot aria-label="Take photo" disabled></button></div>`.toString();
    document.body.appendChild(el);
    const video = el.querySelector('video');
    const shoot = el.querySelector('[data-shoot]');
    const msg = el.querySelector('[data-msg]');
    let stream = null;
    const loc = getLocation({ target, demo }).catch((e) => e);

    const close = (result) => {
      stream?.getTracks().forEach((t) => t.stop());
      el.remove();
      resolve(result);
    };
    el.querySelector('[data-close]').onclick = () => close(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      msg.textContent = 'This browser cannot open the camera. Use Chrome or Safari on your phone.';
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false })
      .then((s) => {
        stream = s;
        video.srcObject = s;
        shoot.disabled = false;
      })
      .catch(() => { msg.textContent = 'Camera access is blocked. Allow the camera for GreenELB in your browser settings and try again.'; });

    shoot.onclick = async () => {
      shoot.disabled = true;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w) { shoot.disabled = false; return; }
      const scale = Math.min(1, 1280 / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      const takenAt = new Date().toISOString();
      msg.textContent = 'Getting your location…';
      const where = await loc;
      if (where instanceof Error) {
        msg.textContent = where.message;
        shoot.disabled = false;
        return;
      }
      close({ dataUrl: canvas.toDataURL('image/jpeg', 0.82), lat: where.lat, lng: where.lng, takenAt, source: 'camera', ahash: ahash(canvas) });
    };
  });
}

// ---------- QR ----------
export function renderQr(container, text) {
  container.innerHTML = '';
  // qrcodejs (cdnjs) exposes a global QRCode constructor.
  // eslint-disable-next-line no-new
  new window.QRCode(container, { text, width: 480, height: 480, colorDark: '#16231C', colorLight: '#FFFFFF', correctLevel: window.QRCode.CorrectLevel.M });
}

export function qrDataUrl(text, size = 360) {
  const holder = document.createElement('div');
  // eslint-disable-next-line no-new
  new window.QRCode(holder, { text, width: size, height: size, colorDark: '#16231C', colorLight: '#FFFFFF', correctLevel: window.QRCode.CorrectLevel.M });
  return holder.querySelector('canvas')?.toDataURL('image/png') || null;
}

export function scanQr({ title = 'Scan the leader’s QR code' } = {}) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = html`<div class="bar"><strong>${title}</strong><button class="iconbtn" type="button" data-close aria-label="Close scanner">${icon('x', 24)}</button></div>
      <div id="qr-reader"></div><p class="small" data-msg style="padding:12px 20px calc(20px + env(safe-area-inset-bottom,0px));color:#C9D3CD">Point your camera at the QR code on the leader's phone.</p>`.toString();
    document.body.appendChild(el);
    const msg = el.querySelector('[data-msg]');
    const scanner = new window.Html5Qrcode('qr-reader');
    let done = false;
    const close = async (value) => {
      if (done) return;
      done = true;
      try { await scanner.stop(); } catch { /* not started */ }
      el.remove();
      resolve(value);
    };
    el.querySelector('[data-close]').onclick = () => close(null);
    scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, (text) => close(text), () => {})
      .catch(() => { msg.textContent = 'Camera access is blocked. Allow the camera for GreenELB and try again.'; });
  });
}

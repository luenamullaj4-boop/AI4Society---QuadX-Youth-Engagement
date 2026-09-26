// Leaflet (global L from cdnjs) with OpenStreetMap tiles.
import { CITY } from '../config.js';

export function makeMap(el, { center = CITY, zoom = CITY.zoom, interactive = true } = {}) {
  const map = window.L.map(el, { zoomControl: interactive, dragging: interactive, scrollWheelZoom: false, attributionControl: true })
    .setView([center.lat, center.lng], zoom);
  window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  return map;
}

export function pinClass(h) {
  if (h.status === 'cleaned') return 'cleaned';
  if (h.status === 'needs_confirmation') return 'pending';
  return h.source === 'youth' ? 'youth' : 'muni';
}

export function hotspotMarker(h) {
  const cls = pinClass(h);
  const size = cls === 'cleaned' ? 14 : 20;
  return window.L.marker([h.lat, h.lng], {
    title: h.title,
    alt: h.title,
    keyboard: true,
    icon: window.L.divIcon({ className: '', html: `<div class="pin ${cls}"></div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
  });
}

export const LEGEND = [
  ['muni', 'Municipality hotspot'],
  ['youth', 'Reported by youth, verified'],
  ['pending', 'Needs confirmation'],
  ['cleaned', 'Cleaned'],
];

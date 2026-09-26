import { HttpError } from './http.js';

export function text(value, field, { min = 1, max = 200, optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return '';
    throw new HttpError(400, `${field} is required.`);
  }
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be text.`);
  const t = value.trim();
  if (t.length < min) throw new HttpError(400, `${field} must be at least ${min} characters.`);
  if (t.length > max) throw new HttpError(400, `${field} must be at most ${max} characters.`);
  return t;
}

export function int(value, field, min, max, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${field} must be a whole number from ${min} to ${max}.`);
  return n;
}

export function num(value, field, min, max, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${field} must be a number from ${min} to ${max}.`);
  return Math.round(n * 10) / 10;
}

export function oneOf(value, field, allowed) {
  const keys = Array.isArray(allowed) ? allowed : Object.keys(allowed);
  if (typeof value !== 'string' || !keys.includes(value)) throw new HttpError(400, `${field} must be one of: ${keys.join(', ')}.`);
  return value;
}

export function someOf(value, field, allowed, { min = 1, max = 99 } = {}) {
  const keys = Array.isArray(allowed) ? allowed : Object.keys(allowed);
  if (!Array.isArray(value)) throw new HttpError(400, `${field} must be a list.`);
  const clean = [...new Set(value)].filter((v) => keys.includes(v));
  if (clean.length < min) throw new HttpError(400, `Pick at least ${min} ${field.toLowerCase()}.`);
  return clean.slice(0, max);
}

export function bool(value) {
  return value === true;
}

export function point(body, field = 'Location') {
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new HttpError(400, `${field} is missing. Allow location access and try again.`);
  }
  return { lat, lng };
}

export function futureDate(value, field) {
  const t = Date.parse(value);
  if (!Number.isFinite(t)) throw new HttpError(400, `${field} is not a valid date.`);
  if (t < Date.now() - 60 * 60 * 1000) throw new HttpError(400, `${field} must be in the future.`);
  return new Date(t).toISOString();
}

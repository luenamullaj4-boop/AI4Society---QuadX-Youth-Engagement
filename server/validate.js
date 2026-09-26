import { AGE_GROUPS, CATS, MAP_HEIGHT, MAP_WIDTH, URG, unitByName } from '../public/js/config.js';

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

function text(value, field, { min = 1, max, optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return '';
    throw new ValidationError(`${field} is required.`);
  }
  if (typeof value !== 'string') throw new ValidationError(`${field} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length < min) throw new ValidationError(`${field} must be at least ${min} characters.`);
  if (trimmed.length > max) throw new ValidationError(`${field} must be at most ${max} characters.`);
  return trimmed;
}

function int(value, field, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ValidationError(`${field} must be a whole number between ${min} and ${max}.`);
  }
  return n;
}

function oneOf(value, field, allowed) {
  if (!Object.hasOwn(allowed, value)) {
    throw new ValidationError(`${field} must be one of: ${Object.keys(allowed).join(', ')}.`);
  }
  return value;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSignup(body) {
  const name = text(body.name, 'Name', { max: 60 });
  const email = text(body.email, 'Email', { min: 5, max: 120 }).toLowerCase();
  if (!EMAIL.test(email)) throw new ValidationError('Email does not look like an email address.');
  const ageGroup = oneOf(body.ageGroup, 'Age group', AGE_GROUPS);
  const parentConsent = body.parentConsent === true;
  if (ageGroup === '15-17' && !parentConsent) {
    throw new ValidationError('Volunteers aged 15–17 need a parent or guardian to agree first.');
  }
  return { name, email, ageGroup, parentConsent };
}

export function validateReport(body) {
  const unit = text(body.unit, 'Unit', { max: 40 });
  if (!unitByName(unit)) throw new ValidationError('Unit must be one of the 14 administrative units.');
  const cat = oneOf(body.cat, 'Category', CATS);
  const desc = text(body.desc, 'Description', { min: 10, max: 600 });
  const name = text(body.name, 'Name', { max: 60, optional: true });
  return { unit, cat, desc, name };
}

export function validateApproval(body, report) {
  const unit = unitByName(report.unit);
  return {
    title: text(body.title, 'Title', { min: 3, max: 100 }),
    when: text(body.when, 'When', { min: 3, max: 80 }),
    meet: text(body.meet, 'Meeting point', { min: 3, max: 120 }),
    bring: text(body.bring, 'What to bring', { max: 200, optional: true }),
    desc: text(body.desc ?? report.desc, 'Description', { min: 10, max: 600 }),
    need: int(body.need, 'Volunteers needed', 1, 500),
    urg: oneOf(body.urg, 'Urgency', URG),
    x: body.x === undefined ? unit.x : int(body.x, 'x', 0, MAP_WIDTH),
    y: body.y === undefined ? unit.y + 20 : int(body.y, 'y', 0, MAP_HEIGHT),
  };
}

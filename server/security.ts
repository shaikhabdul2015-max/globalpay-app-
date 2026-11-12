import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { isValidCurrencyCode } from './currencies.ts';
import { logAuditEvent } from './auditLogger.ts';
import type { CurrencyCode } from './types.ts';

const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  return process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16
    ? process.env.SESSION_SECRET
    : EPHEMERAL_FALLBACK_SECRET;
}

export interface SessionClaims {
  sub: string;
  persona: string;
  name: string;
  iat: number;
  exp: number;
  jti: string;
}

export interface AuthenticatedRequest extends Request {
  auth?: SessionClaims;
  requestId?: string;
}

export function signSessionToken(payload: { userId: string; persona: string; name: string }, ttlSeconds = 3600 * 12): string {
  const now = Math.floor(Date.now() / 1000);
  const claims: SessionClaims = {
    sub: payload.userId,
    persona: payload.persona,
    name: payload.name,
    iat: now,
    exp: now + ttlSeconds,
    jti: crypto.randomUUID(),
  };

  const encodedHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(signingInput)
    .digest('base64url');

  return `${signingInput}.${signature}`;
}

export function verifySessionToken(token: string): SessionClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, providedSig] = parts;
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const expectedSig = crypto
      .createHmac('sha256', getSessionSecret())
      .update(signingInput)
      .digest('base64url');

    const providedBuf = Buffer.from(providedSig);
    const expectedBuf = Buffer.from(expectedSig);
    if (providedBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) return null;

    const claims = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SessionClaims;
    const now = Math.floor(Date.now() / 1000);
    if (!claims.sub || typeof claims.exp !== 'number' || claims.exp <= now) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}

export function attachRequestContext(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const requestId = req.header('x-request-id') || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.header('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logAuditEvent({
      requestId: req.requestId || 'unknown',
      userId: 'anonymous',
      action: `AUTH_CHECK:${req.path}`,
      status: 'denied',
      details: { reason: 'missing_bearer_token' },
      ip: req.ip,
    });
    res.status(401).json({ error: 'Authentication required. Please refresh your GlobalPay session.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const claims = verifySessionToken(token);
  if (!claims) {
    logAuditEvent({
      requestId: req.requestId || 'unknown',
      userId: 'anonymous',
      action: `AUTH_CHECK:${req.path}`,
      status: 'denied',
      details: { reason: 'invalid_or_expired_token' },
      ip: req.ip,
    });
    res.status(401).json({ error: 'Session expired or invalid. Re-authenticating session.' });
    return;
  }

  req.auth = claims;
  next();
}

export function createRateLimiter(options: { windowMs: number; maxRequests: number; keyPrefix: string }) {
  const hits = new Map<string, number[]>();

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const subject = req.auth?.sub || req.ip || 'unknown';
    const key = `${options.keyPrefix}:${subject}`;
    const windowStart = now - options.windowMs;

    const existing = (hits.get(key) || []).filter((ts) => ts > windowStart);
    if (existing.length >= options.maxRequests) {
      const oldestInWindow = existing[0] || now;
      const retryAfterSec = Math.max(1, Math.ceil((oldestInWindow + options.windowMs - now) / 1000));
      res.setHeader('Retry-After', retryAfterSec.toString());
      res.setHeader('X-RateLimit-Limit', options.maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', '0');

      logAuditEvent({
        requestId: req.requestId || 'unknown',
        userId: req.auth?.sub || 'anonymous',
        action: `RATE_LIMIT:${options.keyPrefix}`,
        status: 'denied',
        details: { retryAfterSec },
        ip: req.ip,
      });

      res.status(429).json({
        error: `Too many requests. Please wait ${retryAfterSec}s before trying again.`,
      });
      return;
    }

    existing.push(now);
    hits.set(key, existing);
    res.setHeader('X-RateLimit-Limit', options.maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, options.maxRequests - existing.length).toString());
    next();
  };
}

interface IdempotencyRecord {
  payloadHash: string;
  statusCode: number;
  body: unknown;
  createdAt: number;
}

const idempotencyStore = new Map<string, IdempotencyRecord>();
const IDEMPOTENCY_TTL_MS = 1000 * 60 * 60 * 24;

export function hashPayload(body: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(body ?? {})).digest('hex');
}

export function checkIdempotency(
  userId: string,
  idempotencyKey: string | undefined,
  body: unknown
):
  | { state: 'missing' }
  | { state: 'conflict' }
  | { state: 'replay'; statusCode: number; body: unknown }
  | { state: 'new'; key: string; payloadHash: string } {
  if (!idempotencyKey || idempotencyKey.trim().length < 8 || idempotencyKey.length > 128) {
    return { state: 'missing' };
  }

  const normalizedKey = `${userId}:${idempotencyKey.trim()}`;
  const payloadHash = hashPayload(body);
  const existing = idempotencyStore.get(normalizedKey);

  if (existing) {
    if (Date.now() - existing.createdAt > IDEMPOTENCY_TTL_MS) {
      idempotencyStore.delete(normalizedKey);
    } else if (existing.payloadHash !== payloadHash) {
      return { state: 'conflict' };
    } else {
      return { state: 'replay', statusCode: existing.statusCode, body: existing.body };
    }
  }

  return { state: 'new', key: normalizedKey, payloadHash };
}

export function saveIdempotencyResult(key: string, payloadHash: string, statusCode: number, body: unknown): void {
  idempotencyStore.set(key, {
    payloadHash,
    statusCode,
    body,
    createdAt: Date.now(),
  });
}

export function validatePositiveAmount(value: unknown, maxAmount = 1_000_000): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > maxAmount) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

export function validateCurrencyCode(code: unknown): CurrencyCode | null {
  if (typeof code !== 'string') return null;
  const upper = code.trim().toUpperCase();
  return isValidCurrencyCode(upper) ? upper : null;
}

export function sanitizeText(value: unknown, maxLen = 500): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLen);
}

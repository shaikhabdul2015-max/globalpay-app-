import crypto from 'node:crypto';
import type { AuditLogEntry } from './types.ts';

const MAX_AUDIT_ENTRIES = 500;
const auditBuffer: AuditLogEntry[] = [];

const REDACTED_KEYS = new Set(['pin', 'pinCode', 'password', 'token', 'apiKey', 'authorization']);

function redactSensitive(input: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (REDACTED_KEYS.has(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = redactSensitive(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function logAuditEvent(params: {
  requestId: string;
  userId: string;
  action: string;
  status: 'allowed' | 'denied' | 'success' | 'error';
  details?: Record<string, unknown>;
  ip?: string;
}): AuditLogEntry {
  const entry: AuditLogEntry = {
    id: `AUD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    timestamp: new Date().toISOString(),
    requestId: params.requestId,
    userId: params.userId,
    action: params.action,
    status: params.status,
    details: redactSensitive(params.details ?? {}),
    ip: params.ip ?? 'unknown',
  };

  auditBuffer.unshift(entry);
  if (auditBuffer.length > MAX_AUDIT_ENTRIES) {
    auditBuffer.pop();
  }

  if (process.env.NODE_ENV !== 'test') {
    console.info(JSON.stringify({ type: 'GLOBALPAY_AUDIT', ...entry }));
  }

  return entry;
}

export function getAuditLogsForUser(userId: string, limit = 50): AuditLogEntry[] {
  return auditBuffer.filter((e) => e.userId === userId).slice(0, Math.min(limit, 200));
}

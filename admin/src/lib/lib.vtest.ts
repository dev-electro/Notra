import { describe, expect, it } from 'vitest';
import { fmtNum, SUPPRESSED, timeAgo } from './format';
import { isMasked, maskAny, maskEmail, maskPhone } from './mask';
import { ACTIONS, can, rank, ROLES, type Action } from './roles';

describe('masking helpers (same rules as the server)', () => {
  it('masks an Indian mobile as +91 98•••••210', () => {
    expect(maskPhone('+919876543210')).toBe('+91 98•••••210');
    expect(maskPhone('+91 98765 43210')).toBe('+91 98•••••210');
    expect(maskPhone('')).toBe('');
  });
  it('masks an e-mail as g•••@gmail.com', () => {
    expect(maskEmail('gaurav@gmail.com')).toBe('g•••@gmail.com');
    expect(maskEmail('a@b.in')).toBe('a•••@b.in');
    expect(maskEmail(null)).toBe('');
  });
  it('maskAny picks the right style and never returns the original', () => {
    expect(maskAny('9876543210')).toBe('+91 98•••••210');
    expect(maskAny('someone@example.org')).toBe('s•••@example.org');
    for (const v of ['9876543210', 'someone@example.org', '+14155550123']) expect(maskAny(v)).not.toBe(v);
    expect(isMasked(maskAny('9876543210'))).toBe(true);
    expect(isMasked('9876543210')).toBe(false);
  });
});

describe('role gating matrix', () => {
  const expected: Record<Action, 'viewer' | 'support' | 'admin' | 'owner'> = { ...ACTIONS };
  it('ranks roles viewer < support < admin < owner', () => {
    expect(ROLES.map(rank)).toEqual([1, 2, 3, 4]);
    expect(rank(null)).toBe(0);
  });
  it('every action needs exactly its minimum role', () => {
    for (const [action, min] of Object.entries(expected) as [Action, (typeof ROLES)[number]][]) {
      for (const role of ROLES) expect(can(role, action), `${role} ${action}`).toBe(rank(role) >= rank(min));
      expect(can(null, action)).toBe(false);
    }
  });
  it('encodes the documented rules', () => {
    expect(can('viewer', 'view_users')).toBe(true);
    expect(can('viewer', 'suspend_user')).toBe(false);
    expect(can('support', 'suspend_user')).toBe(true);
    expect(can('support', 'unmask_user')).toBe(false);
    expect(can('admin', 'unmask_user')).toBe(true);
    expect(can('admin', 'delete_user')).toBe(true);
    expect(can('support', 'delete_user')).toBe(false);
    expect(can('admin', 'manage_staff')).toBe(false);
    expect(can('owner', 'manage_staff')).toBe(true);
    expect(can('viewer', 'view_consented_data')).toBe(false);
  });
});

describe('formatting', () => {
  it('shows suppressed small groups as <5 and missing values as a dash', () => {
    expect(fmtNum(SUPPRESSED)).toBe('<5');
    expect(fmtNum(null)).toBe('–');
    expect(fmtNum(1234567)).toBe('12,34,567');
  });
  it('timeAgo', () => {
    const now = Date.parse('2026-01-02T00:00:00Z');
    expect(timeAgo('2026-01-01T23:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-01-01T22:00:00Z', now)).toBe('2 h ago');
    expect(timeAgo(null, now)).toBe('never');
  });
});

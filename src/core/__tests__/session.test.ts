import { EventSession, readBack, newId } from '..';

describe('EventSession', () => {
  const mk = () => {
    let i = 0;
    return new EventSession('ev1', 'lekhak', { now: () => '2026-01-01T00:00:00Z', idGen: () => `id${++i}` });
  };
  it('starts empty', () => {
    expect(mk().totals()).toEqual({ cashPaise: 0, inKindValuePaise: 0, totalPaise: 0, giverCount: 0, entryCount: 0 });
  });
  it('adds AAYA entries tied to the event', () => {
    const s = mk();
    const e = s.add({ otherHouseholdId: 'h1', cashPaise: 50100 });
    expect(e).toMatchObject({ id: 'id1', eventId: 'ev1', direction: 'AAYA', recordedBy: 'lekhak', paymentMode: 'CASH', inKindValuePaise: 0 });
  });
  it('tracks running cash, in-kind and giver count', () => {
    const s = mk();
    s.add({ otherHouseholdId: 'h1', cashPaise: 50100 });
    s.add({ otherHouseholdId: 'h2', cashPaise: 0, inKindItem: '10 किलो गेहूं', inKindValuePaise: 30000 });
    s.add({ otherHouseholdId: 'h1', cashPaise: 10100 });
    expect(s.totals()).toEqual({ cashPaise: 60200, inKindValuePaise: 30000, totalPaise: 90200, giverCount: 2, entryCount: 3 });
  });
  it('undo removes the last entry and updates totals', () => {
    const s = mk();
    s.add({ otherHouseholdId: 'h1', cashPaise: 100 });
    s.add({ otherHouseholdId: 'h2', cashPaise: 200 });
    expect(s.undo()?.otherHouseholdId).toBe('h2');
    expect(s.totals().giverCount).toBe(1);
    expect(s.totals().cashPaise).toBe(100);
  });
  it('undo on empty is a no-op', () => expect(mk().undo()).toBeUndefined());
  it('clamps negative amounts', () => {
    const s = mk();
    expect(s.add({ otherHouseholdId: 'h1', cashPaise: -5 }).cashPaise).toBe(0);
  });
});

describe('newId', () => {
  it('returns unique uuid-shaped ids', () => {
    const a = newId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(newId()).not.toBe(a);
  });
});

describe('readBack', () => {
  const h = { headName: 'सुरेश' };
  it('AAYA', () => expect(readBack({ direction: 'AAYA', cashPaise: 50100 }, h)).toBe('सुरेश ने 501 रुपये दिए। सही है?'));
  it('GAYA', () => expect(readBack({ direction: 'GAYA', cashPaise: 50100 }, h)).toBe('आपने सुरेश को 501 रुपये दिए। सही है?'));
  it('in-kind with cash', () =>
    expect(readBack({ direction: 'AAYA', cashPaise: 50100, inKindItem: '10 किलो गेहूं' }, h)).toBe(
      'सुरेश ने 501 रुपये और 10 किलो गेहूं दिए। सही है?',
    ));
  it('in-kind only', () =>
    expect(readBack({ direction: 'GAYA', cashPaise: 0, inKindItem: '10 किलो गेहूं' }, h)).toBe(
      'आपने सुरेश को 10 किलो गेहूं दिए। सही है?',
    ));
  it('groups large amounts the Indian way', () =>
    expect(readBack({ direction: 'AAYA', cashPaise: 10000100 }, h)).toContain('1,00,001 रुपये'));
});

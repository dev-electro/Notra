import { readBack, newId } from '..';

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

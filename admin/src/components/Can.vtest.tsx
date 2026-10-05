import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Can } from '../lib/auth';
import { ROLES } from '../lib/roles';
import { ConfirmDialog } from './ui';

afterEach(cleanup);

describe('<Can> role gating', () => {
  it('shows an action only to roles that may do it', () => {
    const visible: Record<string, string[]> = {};
    for (const role of ROLES) {
      render(
        <Can action="suspend_user" role={role} fallback={<span>no</span>}>
          <button>Suspend</button>
        </Can>,
      );
      visible[role] = screen.queryAllByRole('button').map((b) => b.textContent ?? '');
      cleanup();
    }
    expect(visible).toEqual({ viewer: [], support: ['Suspend'], admin: ['Suspend'], owner: ['Suspend'] });
  });

  it('renders the fallback for a role that cannot', () => {
    render(<Can action="manage_staff" role="admin" fallback={<span>owners only</span>}><button>Manage</button></Can>);
    expect(screen.getByText('owners only')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders nothing for a signed-out visitor (no role)', () => {
    const { container } = render(<Can action="view_users" role={null}><p>secret</p></Can>);
    expect(container.textContent).toBe('');
  });
});

describe('<ConfirmDialog>', () => {
  it('keeps the confirm button disabled until the reason is long enough', () => {
    render(<ConfirmDialog open title="Delete?" needReason typeToConfirm="delete abc12345" onCancel={() => undefined} onConfirm={async () => undefined} />);
    const btn = screen.getByRole('button', { name: 'Confirm', hidden: true }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

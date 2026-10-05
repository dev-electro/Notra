import type { Cell } from './format';

export interface Report {
  report: string;
  title: string;
  from: string;
  to: string;
  note?: string;
  columns: { key: string; label: string }[];
  rows: Record<string, Cell>[];
}

export interface Paged<T> { items: T[]; page: number; page_size: number; total: number }

export interface UserSummary {
  id: string;
  signup_method: 'google' | 'phone';
  sign_in_methods: string[];
  phone_masked: string | null;
  email_masked: string | null;
  name_masked: string | null;
  status: 'active' | 'suspended';
  created_at: string;
  last_active_at: string | null;
  app_version: string | null;
  platform: string | null;
}

export interface UserDetail extends UserSummary {
  last_sync_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  devices: { platform: string; app_version: string | null; os_version: string | null; first_seen: string; last_seen: string; last_sync_at: string | null }[];
  counts: { households: number; events: number; entries: number; ledgers: number; sync_errors_7d: number; sync_requests_7d: number; tickets: number; active_sessions: number };
  support_access: { active: boolean; expires_at: string | null };
}

export interface Ticket {
  id: string;
  user_id: string | null;
  channel: string;
  category: 'grievance' | 'bug' | 'feedback' | 'deletion' | 'other';
  subject: string;
  body?: string;
  contact_masked: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assignee: string | null;
  created_at: string;
  updated_at: string;
  due_at: string | null;
  resolved_at: string | null;
  resolution: string | null;
  overdue: boolean;
  notes?: { id: string; admin_label: string; kind: 'note' | 'reply'; body: string; at: string }[];
}

export interface Overview {
  today: string;
  totals: { users: number; suspended: number; new_7d: Cell; new_30d: Cell };
  active: { dau: Cell; wau: Cell; mau: Cell };
  events_this_month: Cell;
  sync_today: { requests: Cell; errors: Cell; error_rate_pct: number | null };
  otp_today: { sends: number; sms_cost_paise: number };
  tickets: { open: number; overdue: number; open_grievances: number };
  errors_24h: number;
}

export type ConfigKey = 'maintenance' | 'min_supported_version' | 'latest_version' | 'force_update_message_hi' | 'announcement' | 'ads' | 'features';
export interface ConfigEntry { key: ConfigKey; value: unknown; default: unknown; is_default: boolean; updated_by: string | null; updated_at: string | null }

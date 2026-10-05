/** रिश्ते discovery over the app's api client (needs a signed-in account). Errors are HttpError / SignedOutError / SuspendedError; see errorText. */
import { HttpError, SignedOutError, SuspendedError } from '@/sync/http';
import { api } from '@/sync/runtime';
import {
  errorMessageHi, searchQuery, toProfileBody, type MyInterest, type PublicProfile, type ReportReason, type SearchFilters, type ServerProfile, type ShareDraft,
} from './logic';

const P = '/v1/rishtey';
const auth = { auth: true } as const;

export interface MyProfileState {
  profile: ServerProfile | null;
  phone_verified: boolean;
}
export type InterestRow = { id: string; status: 'sent' | 'accepted' | 'declined'; created_at: string; profile: PublicProfile };

export const getMyProfile = () => api.request<MyProfileState>('GET', `${P}/profile`, auth);
export const saveMyProfile = (d: ShareDraft) => api.request<{ profile: ServerProfile }>('PUT', `${P}/profile`, { ...auth, body: toProfileBody(d) }).then((r) => r.profile);
export const publishMyProfile = () => api.request<{ profile: ServerProfile }>('POST', `${P}/profile/publish`, { ...auth, body: { consent: true } }).then((r) => r.profile);
export const hideMyProfile = () => api.request<{ profile: ServerProfile }>('POST', `${P}/profile/hide`, { ...auth, body: {} }).then((r) => r.profile);
export const deleteMyProfile = () => api.request('DELETE', `${P}/profile`, auth);

export const searchProfiles = (f: SearchFilters, offset = 0) =>
  api.request<{ items: PublicProfile[]; next_offset: number | null }>('GET', `${P}/search?${searchQuery(f, offset)}`, auth);
export const getPublicProfile = (id: string) => api.request<{ profile: PublicProfile }>('GET', `${P}/profiles/${encodeURIComponent(id)}`, auth).then((r) => r.profile);

export const sendInterest = (profileId: string) => api.request<{ status: 'sent' | 'accepted' }>('POST', `${P}/interests`, { ...auth, body: { profile_id: profileId } }).then((r) => r.status);
export const listInterests = (box: 'received' | 'sent') => api.request<{ items: InterestRow[] }>('GET', `${P}/interests?box=${box}`, auth).then((r) => r.items);
export const answerInterest = (id: string, accept: boolean) => api.request('POST', `${P}/interests/${encodeURIComponent(id)}/${accept ? 'accept' : 'decline'}`, { ...auth, body: {} });
export const getContact = (profileId: string) => api.request<{ first_name: string; contact: string }>('GET', `${P}/contact/${encodeURIComponent(profileId)}`, auth);

export const reportProfile = (profileId: string, reason: ReportReason) => api.request('POST', `${P}/report`, { ...auth, body: { profile_id: profileId, reason } });
export const blockProfile = (profileId: string) => api.request('POST', `${P}/block`, { ...auth, body: { profile_id: profileId } });

/** Plain Hindi for any failure. */
export function errorText(e: unknown): string {
  if (e instanceof SuspendedError) return e.messageHi;
  if (e instanceof SignedOutError) return errorMessageHi(401, null);
  if (e instanceof HttpError) return errorMessageHi(e.status, e.message.replace(/^\d+ /, ''));
  return errorMessageHi(null, null);
}

export type { MyInterest };

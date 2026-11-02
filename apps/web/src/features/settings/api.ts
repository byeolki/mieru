import { z } from 'zod';
import {
  meSchema,
  sessionResponseSchema,
  sessionSummarySchema,
  type UpdateMeBody,
} from '@mieru/shared';
import { apiRequest } from '../../lib/api-client.js';
import { applySession, clearSession, updateCurrentUser } from '../../lib/auth-store.js';

const noContent = z.undefined();

export async function updateProfileRequest(body: UpdateMeBody) {
  const user = await apiRequest('/api/me', meSchema, { method: 'PATCH', body });
  updateCurrentUser(user);
  return user;
}

export async function changePasswordRequest(currentPassword: string, newPassword: string) {
  const session = await apiRequest('/api/me/password', sessionResponseSchema, {
    method: 'PUT',
    body: { currentPassword, newPassword },
  });
  applySession(session);
}

export function changeEmailRequest(currentPassword: string, newEmail: string) {
  return apiRequest('/api/me/email', noContent, {
    method: 'PUT',
    body: { currentPassword, newEmail },
  });
}

export function listSessionsRequest() {
  return apiRequest('/api/me/sessions', z.array(sessionSummarySchema));
}

export function revokeSessionRequest(familyId: string) {
  return apiRequest(`/api/me/sessions/${familyId}`, noContent, { method: 'DELETE' });
}

export async function logoutAllRequest() {
  await apiRequest('/api/auth/logout-all', noContent, { method: 'POST' });
  clearSession();
}

export async function deleteAccountRequest(password: string, confirmUsername: string) {
  await apiRequest('/api/me', noContent, { method: 'DELETE', body: { password, confirmUsername } });
  clearSession();
}

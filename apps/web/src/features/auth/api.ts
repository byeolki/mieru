import { sessionResponseSchema, type LoginBody, type SignupBody } from '@mieru/shared';
import { apiRequest } from '../../lib/api-client.js';
import { applySession } from '../../lib/auth-store.js';

/** Creates the account; the caller applies the session once the welcome step is done. */
export function signUpRequest(body: SignupBody) {
  return apiRequest('/api/auth/signup', sessionResponseSchema, { method: 'POST', body });
}

export async function logInRequest(body: LoginBody) {
  const session = await apiRequest('/api/auth/login', sessionResponseSchema, {
    method: 'POST',
    body,
  });
  applySession(session);
  return session;
}

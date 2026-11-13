import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{2,29}$/;

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(320));
export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);
export const usernameSchema = z.string().trim().toLowerCase().regex(USERNAME_PATTERN);

export const signupBodySchema = z.object({ email: emailSchema, password: passwordSchema });
export type SignupBody = z.infer<typeof signupBodySchema>;

export const loginBodySchema = z.object({
  email: emailSchema,
  // Login only checks length bounds so older passwords keep working if the policy changes.
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const meSchema = z.object({
  id: z.string(),
  email: z.string(),
  username: z.string(),
  displayName: z.string(),
  bio: z.string().nullable(),
  avatarKey: z.string().nullable(),
  role: z.enum(['user', 'admin']),
  createdAt: z.string(),
});
export type Me = z.infer<typeof meSchema>;

export const sessionResponseSchema = z.object({ accessToken: z.string(), user: meSchema });
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const updateMeBodySchema = z
  .object({
    username: usernameSchema.optional(),
    displayName: z.string().trim().min(1).max(100).optional(),
    bio: z.string().trim().max(300).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update');
export type UpdateMeBody = z.infer<typeof updateMeBodySchema>;

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});

export const changeEmailBodySchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newEmail: emailSchema,
});

export const deleteAccountBodySchema = z.object({
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  confirmUsername: z.string().trim().toLowerCase(),
});

export const sessionSummarySchema = z.object({
  familyId: z.string(),
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
  current: z.boolean(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

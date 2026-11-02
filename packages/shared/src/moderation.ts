import { z } from 'zod';

export const REPORT_REASONS = [
  'malware',
  'copyright',
  'illegal',
  'spam',
  'abuse',
  'other',
] as const;
export const reportReasonSchema = z.enum(REPORT_REASONS);
export type ReportReason = z.infer<typeof reportReasonSchema>;

export const reportStatusSchema = z.enum(['open', 'dismissed', 'actioned']);
export type ReportStatus = z.infer<typeof reportStatusSchema>;

export const createReportBodySchema = z.object({
  reason: reportReasonSchema,
  details: z.string().trim().max(2000).optional(),
  issueNumber: z.number().int().positive().optional(),
});
export type CreateReportBody = z.infer<typeof createReportBodySchema>;

export const adminReportSchema = z.object({
  id: z.string(),
  reason: reportReasonSchema,
  details: z.string().nullable(),
  status: reportStatusSchema,
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
  reporterUsername: z.string().nullable(),
  resolverUsername: z.string().nullable(),
  model: z.object({
    id: z.string(),
    name: z.string(),
    ownerUsername: z.string(),
    takenDown: z.boolean(),
  }),
  issue: z.object({ number: z.number(), title: z.string(), deleted: z.boolean() }).nullable(),
});
export type AdminReport = z.infer<typeof adminReportSchema>;

export const adminReportListResponseSchema = z.object({ items: z.array(adminReportSchema) });

export const resolveReportBodySchema = z.object({
  action: z.enum(['dismiss', 'takedown', 'delete_issue']),
  reason: z.string().trim().min(1).max(500).optional(),
});
export type ResolveReportBody = z.infer<typeof resolveReportBodySchema>;

export const takedownBodySchema = z.object({ reason: z.string().trim().min(1).max(500) });

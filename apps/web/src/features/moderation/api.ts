import { z } from 'zod';
import {
  adminReportListResponseSchema,
  type CreateReportBody,
  type ReportReason,
  type ReportStatus,
  type ResolveReportBody,
} from '@mieru/shared';
import { apiRequest } from '../../lib/api-client.js';

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  malware: '악성 파일',
  copyright: '저작권 침해',
  illegal: '불법 콘텐츠',
  spam: '스팸·광고',
  abuse: '괴롭힘·혐오',
  other: '기타',
};

export const moderationKeys = {
  reports: (status: ReportStatus) => ['admin', 'reports', status] as const,
};

export const reportModel = (modelId: string, body: CreateReportBody) =>
  apiRequest(`/api/models/${modelId}/reports`, z.undefined(), { method: 'POST', body });

export const listReports = (status: ReportStatus) =>
  apiRequest(`/api/admin/reports?status=${status}`, adminReportListResponseSchema);

export const resolveReport = (reportId: string, body: ResolveReportBody) =>
  apiRequest(`/api/admin/reports/${reportId}/resolve`, z.undefined(), { method: 'POST', body });

export const takedownModel = (modelId: string, reason: string) =>
  apiRequest(`/api/admin/models/${modelId}/takedown`, z.undefined(), {
    method: 'POST',
    body: { reason },
  });

export const restoreModel = (modelId: string) =>
  apiRequest(`/api/admin/models/${modelId}/restore`, z.undefined(), { method: 'POST' });

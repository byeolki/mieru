import * as Tabs from '@radix-ui/react-tabs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { AdminReport, ReportStatus, ResolveReportBody } from '@mieru/shared';
import { Badge } from '../../components/Badge.js';
import { Alert } from '../../design/ui/Alert.js';
import { Button } from '../../design/ui/Button.js';
import { Dialog } from '../../design/ui/Dialog.js';
import { Spinner } from '../../design/ui/Spinner.js';
import { errorMessage } from '../../lib/error-message.js';
import { formatRelative } from '../../lib/format.js';
import { AppShell } from '../shell/AppShell.js';
import { REPORT_REASON_LABELS, listReports, moderationKeys, resolveReport } from './api.js';

const STATUS_TABS: { value: ReportStatus; label: string }[] = [
  { value: 'open', label: '처리 대기' },
  { value: 'actioned', label: '조치함' },
  { value: 'dismissed', label: '무시함' },
];
const TAB =
  'relative px-1 pb-3 text-sm font-medium text-slate data-[state=active]:text-sumi data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary';
const REASON_MAX = 500;

function TakedownDialog({
  report,
  onConfirm,
  onClose,
  isPending,
}: {
  report: AdminReport;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`${report.model.name} 내리기`}
      description="소유자에게 보이는 사유를 적어주세요. 이 저장소의 다른 신고도 함께 조치한 것으로 처리돼요."
    >
      <form
        className="mt-5 grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm(reason.trim());
        }}
      >
        <label className="grid gap-1.5 text-sm font-medium">
          사유
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={REASON_MAX}
            rows={3}
            required
            className="resize-y rounded-(--radius-control) border border-fog bg-surface px-3 py-2 font-normal focus:border-primary focus:outline-none"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" variant="danger" disabled={!reason.trim()} isLoading={isPending}>
            내리기
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ReportRow({ report }: { report: AdminReport }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isTakingDown, setIsTakingDown] = useState(false);
  const resolve = useMutation({
    mutationFn: (body: ResolveReportBody) => resolveReport(report.id, body),
    onSuccess: () => {
      setIsTakingDown(false);
      return queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] });
    },
  });
  const repoPath = `/m/${report.model.id}`;
  return (
    <li className="grid gap-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="lilac">{REPORT_REASON_LABELS[report.reason]}</Badge>
        <Link to={repoPath} className="font-semibold hover:text-primary">
          <span className="font-normal text-slate">{report.model.ownerUsername} / </span>
          {report.model.name}
        </Link>
        {report.model.takenDown && <Badge>내려감</Badge>}
        <span className="tabular ml-auto text-xs text-slate">
          {report.reporterUsername ?? '익명'} · {formatRelative(report.createdAt)}
        </span>
      </div>
      {report.issue && (
        <Link
          to={`${repoPath}/issues/${String(report.issue.number)}`}
          className="text-sm hover:text-primary"
        >
          이슈 #{report.issue.number} {report.issue.title}
          {report.issue.deleted && <span className="text-slate"> (삭제됨)</span>}
        </Link>
      )}
      {report.details && (
        <p className="rounded-(--radius-control) bg-paper px-3 py-2 text-sm leading-6 whitespace-pre-wrap">
          {report.details}
        </p>
      )}
      {report.status === 'open' ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate({ action: 'dismiss' })}
          >
            무시
          </Button>
          {report.issue && !report.issue.deleted && (
            <Button
              size="sm"
              variant="secondary"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ action: 'delete_issue' })}
            >
              이슈 삭제
            </Button>
          )}
          {!report.model.takenDown && (
            <Button
              size="sm"
              variant="danger"
              disabled={resolve.isPending}
              onClick={() => setIsTakingDown(true)}
            >
              저장소 내리기
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate">
          {report.resolverUsername ?? '운영자'}님이{' '}
          {report.resolvedAt ? formatRelative(report.resolvedAt) : ''} 처리
        </p>
      )}
      {resolve.isError && <Alert>{errorMessage(resolve.error, t)}</Alert>}
      {isTakingDown && (
        <TakedownDialog
          report={report}
          isPending={resolve.isPending}
          onClose={() => setIsTakingDown(false)}
          onConfirm={(reason) => resolve.mutate({ action: 'takedown', reason })}
        />
      )}
    </li>
  );
}

function ReportList({ status }: { status: ReportStatus }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: moderationKeys.reports(status),
    queryFn: () => listReports(status),
  });
  if (query.isPending) return <Spinner className="size-5 text-lilac" />;
  if (query.isError) return <Alert>{errorMessage(query.error, t)}</Alert>;
  if (query.data.items.length === 0) {
    return (
      <p className="rounded-(--radius-panel) border border-dashed border-lilac px-6 py-12 text-center text-sm text-slate">
        {status === 'open' ? '처리할 신고가 없어요.' : '아직 없어요.'}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-fog overflow-hidden rounded-(--radius-panel) border border-fog bg-surface shadow-(--shadow-soft)">
      {query.data.items.map((report) => (
        <ReportRow key={report.id} report={report} />
      ))}
    </ul>
  );
}

export function AdminReportsPage() {
  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-bold tracking-tight">신고 관리</h1>
      <Tabs.Root defaultValue="open">
        <Tabs.List className="mb-6 flex gap-6 border-b border-fog" aria-label="신고 상태">
          {STATUS_TABS.map((tab) => (
            <Tabs.Trigger key={tab.value} value={tab.value} className={TAB}>
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {STATUS_TABS.map((tab) => (
          <Tabs.Content key={tab.value} value={tab.value}>
            <ReportList status={tab.value} />
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </AppShell>
  );
}

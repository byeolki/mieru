import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { REPORT_REASONS, type ReportReason } from '@mieru/shared';
import { Alert } from '../../design/ui/Alert.js';
import { Button } from '../../design/ui/Button.js';
import { Dialog } from '../../design/ui/Dialog.js';
import { errorMessage } from '../../lib/error-message.js';
import { REPORT_REASON_LABELS, reportModel } from './api.js';

const DETAILS_MAX = 2000;

interface ReportDialogProps {
  modelId: string;
  /** Reports this issue instead of the whole repository. */
  issueNumber?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReportDialog({ modelId, issueNumber, open, onOpenChange }: ReportDialogProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const send = useMutation({
    mutationFn: (chosen: ReportReason) =>
      reportModel(modelId, { reason: chosen, details: details.trim() || undefined, issueNumber }),
  });
  const target = issueNumber === undefined ? '이 저장소' : `이슈 #${String(issueNumber)}`;

  if (send.isSuccess) {
    return (
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title="신고를 접수했어요"
        description="운영자가 확인한 뒤 조치할게요. 알려주셔서 고마워요."
      >
        <div className="mt-6 flex justify-end">
          <Button onClick={() => onOpenChange(false)}>닫기</Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${target} 신고하기`}
      description="운영 정책에 맞지 않는 내용이라면 알려주세요. 신고한 사람은 공개되지 않아요."
    >
      <form
        className="mt-5 grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (reason) send.mutate(reason);
        }}
      >
        <fieldset>
          <legend className="mb-2 text-sm font-medium">사유</legend>
          <div className="grid grid-cols-2 gap-2">
            {REPORT_REASONS.map((value) => (
              <label
                key={value}
                className={clsx(
                  'cursor-pointer rounded-(--radius-control) border px-3 py-2.5 text-sm transition-colors',
                  reason === value
                    ? 'border-primary bg-haze ring-4 ring-primary/10'
                    : 'border-fog hover:border-lilac',
                )}
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={value}
                  checked={reason === value}
                  onChange={() => setReason(value)}
                  className="sr-only"
                />
                {REPORT_REASON_LABELS[value]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="grid gap-1.5 text-sm font-medium">
          자세한 내용 <span className="font-normal text-slate">(선택)</span>
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            maxLength={DETAILS_MAX}
            rows={4}
            className="resize-y rounded-(--radius-control) border border-fog bg-surface px-3 py-2 font-normal focus:border-primary focus:outline-none"
          />
        </label>
        {send.isError && <Alert>{errorMessage(send.error, t)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="submit" variant="danger" disabled={!reason} isLoading={send.isPending}>
            신고하기
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

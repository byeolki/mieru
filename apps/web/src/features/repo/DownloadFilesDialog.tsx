import { Download } from 'lucide-react';
import { Dialog } from '../../design/ui/Dialog.js';
import { formatBytes } from '../../lib/format.js';
import type { DownloadableFile } from '../models/api.js';

/**
 * Lists a model whose weights live in external data files. Each file downloads on its own; the
 * browser would block a burst of automatic downloads, and the user needs them in one folder.
 */
export function DownloadFilesDialog({
  modelFileName,
  files,
  onClose,
}: {
  modelFileName: string;
  files: readonly DownloadableFile[];
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="파일 받기"
      description="이 모델은 가중치가 별도 파일에 있어요. 모두 받아서 같은 폴더에 두면 그대로 불러올 수 있어요."
    >
      <ul className="mt-5 grid gap-2">
        {files.map((file) => (
          <li key={file.url}>
            <a
              href={file.url}
              rel="noopener"
              className="flex items-center gap-3 rounded-(--radius-control) border border-fog px-4 py-3 text-sm hover:border-lilac hover:bg-haze"
            >
              <Download className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate font-mono">
                {file.name ?? modelFileName}
              </span>
              {file.sizeBytes !== null && (
                <span className="tabular shrink-0 text-xs text-slate">
                  {formatBytes(file.sizeBytes)}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

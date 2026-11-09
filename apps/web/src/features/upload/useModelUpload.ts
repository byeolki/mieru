import { useCallback, useRef, useState } from 'react';
import { Upload as TusUpload } from 'tus-js-client';
import { apiErrorSchema } from '@mieru/shared';
import { getAccessToken, refreshSession } from '../../lib/auth-store.js';

const CHUNK_BYTES = 50 * 1024 * 1024;
const RETRY_DELAYS_MS = [0, 1000, 3000, 5000, 10_000];

export type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading' | 'paused'; sent: number; total: number; currentFile: string }
  | { phase: 'done'; uploadId: string; dataUploadIds: string[]; total: number }
  | { phase: 'error'; code: string; message: string };

function errorFrom(error: unknown): { code: string; message: string } {
  const response = (error as { originalResponse?: { getBody: () => string } | null })
    .originalResponse;
  if (response) {
    try {
      const parsed = apiErrorSchema.safeParse(JSON.parse(response.getBody()));
      if (parsed.success)
        return { code: parsed.data.error.code, message: parsed.data.error.message };
    } catch {
      return { code: 'unknown', message: response.getBody() };
    }
  }
  return { code: 'network', message: error instanceof Error ? error.message : String(error) };
}

interface QueuedFile {
  file: File;
  role: 'model' | 'external_data';
}

/**
 * Resumable upload of a model file and its external data files through tus, one file after
 * another: 50 MiB chunks (under Cloudflare's 100 MB body cap), automatic retries, pause/resume,
 * and a token refresh when the access token expires mid-upload.
 */
export function useModelUpload({ targetModelId }: { targetModelId?: string } = {}) {
  const [state, setState] = useState<UploadState>({ phase: 'idle' });
  const uploadRef = useRef<TusUpload | null>(null);
  // Bumped on every start/reset so callbacks from an abandoned run can't touch the state.
  const runRef = useRef(0);

  const uploadOne = useCallback(
    (item: QueuedFile, run: number, onProgress: (sent: number) => void) =>
      new Promise<string>((resolve, reject) => {
        const metadata: Record<string, string> = { filename: item.file.name };
        // A target makes this upload part of the next version of that repository.
        if (targetModelId) metadata.targetModelId = targetModelId;
        if (item.role === 'external_data') metadata.role = 'external_data';
        const upload = new TusUpload(item.file, {
          endpoint: '/api/uploads',
          chunkSize: CHUNK_BYTES,
          retryDelays: RETRY_DELAYS_MS,
          removeFingerprintOnSuccess: true,
          metadata,
          onBeforeRequest: (request) => {
            const token = getAccessToken();
            if (token) request.setHeader('Authorization', `Bearer ${token}`);
          },
          onShouldRetry: (error) => {
            const status = (
              error as { originalResponse?: { getStatus: () => number } | null }
            ).originalResponse?.getStatus();
            if (status === 401) {
              void refreshSession();
              return true;
            }
            return status === undefined || status >= 500 || status === 409 || status === 423;
          },
          onProgress: (sent) => {
            if (runRef.current === run) onProgress(sent);
          },
          onSuccess: () => resolve(upload.url?.split('/').pop() ?? ''),
          onError: reject,
        });
        uploadRef.current = upload;
        upload.start();
      }),
    [targetModelId],
  );

  /** Uploads `model` first, then each data file; the state reports bytes across all of them. */
  const start = useCallback(
    (model: File, dataFiles: readonly File[] = []) => {
      uploadRef.current?.abort().catch(() => undefined);
      const run = (runRef.current += 1);
      const queue: QueuedFile[] = [
        { file: model, role: 'model' },
        ...dataFiles.map((file) => ({ file, role: 'external_data' as const })),
      ];
      const total = queue.reduce((sum, item) => sum + item.file.size, 0);
      setState({ phase: 'uploading', sent: 0, total, currentFile: model.name });
      void (async () => {
        const ids: string[] = [];
        let finishedBytes = 0;
        try {
          for (const item of queue) {
            const id = await uploadOne(item, run, (sent) => {
              setState((current) =>
                current.phase === 'uploading'
                  ? { ...current, sent: finishedBytes + sent, currentFile: item.file.name }
                  : current,
              );
            });
            if (runRef.current !== run) return;
            ids.push(id);
            finishedBytes += item.file.size;
          }
          const [uploadId = '', ...dataUploadIds] = ids;
          setState({ phase: 'done', uploadId, dataUploadIds, total });
        } catch (error) {
          if (runRef.current === run) setState({ phase: 'error', ...errorFrom(error) });
        }
      })();
    },
    [uploadOne],
  );

  const pause = useCallback(() => {
    const upload = uploadRef.current;
    if (!upload) return;
    void upload.abort();
    setState((current) =>
      current.phase === 'uploading' ? { ...current, phase: 'paused' } : current,
    );
  }, []);

  const resume = useCallback(() => {
    const upload = uploadRef.current;
    if (!upload) return;
    setState((current) =>
      current.phase === 'paused' ? { ...current, phase: 'uploading' } : current,
    );
    upload.start();
  }, []);

  /** Forgets finished uploads without terminating them; the server already took the files. */
  const clear = useCallback(() => {
    runRef.current += 1;
    uploadRef.current = null;
    setState({ phase: 'idle' });
  }, []);

  const reset = useCallback(() => {
    runRef.current += 1;
    void uploadRef.current?.abort(true);
    uploadRef.current = null;
    setState({ phase: 'idle' });
  }, []);

  return { state, start, pause, resume, reset, clear };
}

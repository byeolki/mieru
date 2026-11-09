import { useCallback, useRef, useState } from 'react';
import { Upload as TusUpload } from 'tus-js-client';
import { apiErrorSchema } from '@mieru/shared';
import { getAccessToken, refreshSession } from '../../lib/auth-store.js';

const CHUNK_BYTES = 50 * 1024 * 1024;
const RETRY_DELAYS_MS = [0, 1000, 3000, 5000, 10_000];

export type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading' | 'paused'; sent: number; total: number }
  | { phase: 'done'; uploadId: string; total: number }
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

/**
 * Resumable upload through tus: 50 MiB chunks (under Cloudflare's 100 MB body cap), automatic
 * retries, pause/resume, and a token refresh when the access token expires mid-upload.
 */
export function useTusUpload({ targetModelId }: { targetModelId?: string } = {}) {
  const [state, setState] = useState<UploadState>({ phase: 'idle' });
  const uploadRef = useRef<TusUpload | null>(null);

  const start = useCallback(
    (file: File) => {
      uploadRef.current?.abort().catch(() => undefined);
      const upload = new TusUpload(file, {
        endpoint: '/api/uploads',
        chunkSize: CHUNK_BYTES,
        retryDelays: RETRY_DELAYS_MS,
        removeFingerprintOnSuccess: true,
        // A target makes this upload the next version of that repository.
        metadata: targetModelId ? { filename: file.name, targetModelId } : { filename: file.name },
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
        onProgress: (sent, total) => {
          setState((current) =>
            current.phase === 'paused' ? current : { phase: 'uploading', sent, total },
          );
        },
        onSuccess: () => {
          const uploadId = upload.url?.split('/').pop() ?? '';
          setState({ phase: 'done', uploadId, total: file.size });
        },
        onError: (error) => {
          setState({ phase: 'error', ...errorFrom(error) });
        },
      });
      uploadRef.current = upload;
      setState({ phase: 'uploading', sent: 0, total: file.size });
      upload.start();
    },
    [targetModelId],
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

  /** Forgets a finished upload without terminating it; the server already took the file. */
  const clear = useCallback(() => {
    uploadRef.current = null;
    setState({ phase: 'idle' });
  }, []);

  const reset = useCallback(() => {
    void uploadRef.current?.abort(true);
    uploadRef.current = null;
    setState({ phase: 'idle' });
  }, []);

  return { state, start, pause, resume, reset, clear };
}

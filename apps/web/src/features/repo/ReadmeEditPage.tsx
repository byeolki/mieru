import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import { hasRoleAtLeast, utf8ByteLength, README_MAX_BYTES } from '@mieru/shared';
import { MarkdownEditor } from '../../design/MarkdownEditor.js';
import { Alert } from '../../design/ui/Alert.js';
import { Button } from '../../design/ui/Button.js';
import { Spinner } from '../../design/ui/Spinner.js';
import { ApiError } from '../../lib/api-error.js';
import { errorMessage } from '../../lib/error-message.js';
import { getReadme, modelKeys, saveReadme } from '../models/api.js';
import { useRepo } from './RepoLayout.js';
import { modelPath } from '../../lib/model-path.js';

function templateFor(name: string) {
  return `# ${name}\n\n한 줄로 이 모델을 소개해주세요.\n\n## 용도\n\n## 학습 데이터\n\n## 평가\n\n## 제한 사항\n`;
}

function Editor({ initial, baseUpdatedAt }: { initial: string; baseUpdatedAt: string | null }) {
  const { t } = useTranslation();
  const { model } = useRepo();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [markdown, setMarkdown] = useState(initial || templateFor(model.name));
  const save = useMutation({
    mutationFn: () => saveReadme(model.id, markdown, baseUpdatedAt),
    onSuccess: (saved) => {
      queryClient.setQueryData(modelKeys.readme(model.id), saved);
      void queryClient.invalidateQueries({ queryKey: modelKeys.detail(model.id) });
      void navigate(modelPath(model));
    },
  });
  const isConflict = save.error instanceof ApiError && save.error.code === 'readme_conflict';
  const tooLarge = utf8ByteLength(markdown) > README_MAX_BYTES;
  return (
    <div className="grid gap-4">
      {isConflict && (
        <Alert>
          다른 사람이 그사이 README를 저장했어요. 지금 쓴 내용을 복사해두고 새로고침한 뒤 다시
          반영해주세요.
        </Alert>
      )}
      {save.isError && !isConflict && <Alert>{errorMessage(save.error, t)}</Alert>}
      <MarkdownEditor label="README" value={markdown} onChange={setMarkdown} rows={22} />
      {tooLarge && <p className="text-sm text-danger">README는 256KB까지 쓸 수 있어요.</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => void navigate(modelPath(model))}>
          취소
        </Button>
        <Button isLoading={save.isPending} disabled={tooLarge} onClick={() => save.mutate()}>
          저장
        </Button>
      </div>
    </div>
  );
}

export function ReadmeEditPage() {
  const { model } = useRepo();
  const readme = useQuery({
    queryKey: modelKeys.readme(model.id),
    queryFn: () => getReadme(model.id),
    staleTime: 0,
  });
  if (!hasRoleAtLeast(model.myAccess.role, 'editor'))
    return <Navigate to={modelPath(model)} replace />;
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 md:px-6">
      <h2 className="mb-5 text-lg font-bold">README 편집</h2>
      {readme.isPending ? (
        <Spinner className="size-5 text-lilac" />
      ) : readme.isError ? (
        <p className="text-sm text-danger">README를 불러오지 못했어요.</p>
      ) : (
        <Editor initial={readme.data.markdown} baseUpdatedAt={readme.data.updatedAt} />
      )}
    </div>
  );
}

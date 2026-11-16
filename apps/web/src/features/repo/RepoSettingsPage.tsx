import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import {
  MODEL_DESCRIPTION_MAX,
  MODEL_NAME_MAX,
  hasRoleAtLeast,
  type ModelDetail,
  type UpdateModelBody,
} from '@mieru/shared';
import { Alert } from '../../design/ui/Alert.js';
import { Button } from '../../design/ui/Button.js';
import { ConfirmDialog } from '../../design/ui/ConfirmDialog.js';
import { SettingsPanel } from '../../design/ui/SettingsPanel.js';
import { TextField, inputClasses } from '../../design/ui/TextField.js';
import { errorMessage } from '../../lib/error-message.js';
import { modelPath } from '../../lib/model-path.js';
import { forgetModel } from '../../lib/recent-models.js';
import { exploreKeys } from '../explore/api.js';
import { issueKeys } from '../issues/api.js';
import { deleteModel, modelKeys, updateModel } from '../models/api.js';
import { LICENSE_OPTIONS } from '../models/labels.js';
import { useRepo } from './RepoLayout.js';

/** Fields of `UpdateModelBody` that differ from the saved repository. */
function changedFields(
  model: ModelDetail,
  draft: { name: string; description: string; license: string },
): UpdateModelBody {
  const name = draft.name.trim();
  const description = draft.description.trim();
  return {
    ...(name !== model.name ? { name } : {}),
    ...(description !== (model.description ?? '') ? { description: description || null } : {}),
    ...(draft.license !== (model.license ?? '') ? { license: draft.license || null } : {}),
  };
}

function GeneralForm({ model }: { model: ModelDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const descriptionId = useId();
  const licenseId = useId();
  const [name, setName] = useState(model.name);
  const [description, setDescription] = useState(model.description ?? '');
  const [license, setLicense] = useState(model.license ?? '');
  const changes = changedFields(model, { name, description, license });
  const hasChanges = Object.keys(changes).length > 0;
  // A license set through the API may not be one of the offered choices; keep it selectable.
  const licenseOptions = LICENSE_OPTIONS.some(([value]) => value === (model.license ?? ''))
    ? LICENSE_OPTIONS
    : [...LICENSE_OPTIONS, [model.license ?? '', model.license ?? ''] as const];

  const save = useMutation({
    mutationFn: () => updateModel(model.id, changes),
    onSuccess: (saved) => {
      queryClient.setQueryData(modelKeys.detail(saved.id), saved);
      // A new name gives the repository a new address; seed it so the page doesn't refetch.
      queryClient.setQueryData(modelKeys.resolve(saved.owner.username, saved.slug), {
        id: saved.id,
      });
      void queryClient.invalidateQueries({ queryKey: ['models', 'list'] });
      void queryClient.invalidateQueries({ queryKey: exploreKeys.sections });
      if (saved.slug !== model.slug)
        void navigate(`${modelPath(saved)}/settings`, { replace: true });
    },
  });

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (hasChanges) save.mutate();
      }}
    >
      {save.isError && <Alert>{errorMessage(save.error, t)}</Alert>}
      {save.isSuccess && !hasChanges && (
        <p role="status" className="text-sm text-slate">
          저장했어요.
        </p>
      )}
      <TextField
        label="이름"
        value={name}
        maxLength={MODEL_NAME_MAX}
        onChange={(event) => setName(event.target.value)}
        hint="이름을 바꾸면 저장소 주소도 따라 바뀌어요. 예전 /m/… 링크는 계속 열려요."
        required
      />
      <div>
        <label htmlFor={descriptionId} className="mb-1.5 block text-sm font-medium">
          한 줄 소개 <span className="font-normal text-slate">(선택)</span>
        </label>
        <input
          id={descriptionId}
          className={inputClasses(false)}
          value={description}
          maxLength={MODEL_DESCRIPTION_MAX}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor={licenseId} className="mb-1.5 block text-sm font-medium">
          라이선스 <span className="font-normal text-slate">(선택)</span>
        </label>
        <select
          id={licenseId}
          className={inputClasses(false)}
          value={license}
          onChange={(event) => setLicense(event.target.value)}
        >
          {licenseOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Button type="submit" isLoading={save.isPending} disabled={!hasChanges || !name.trim()}>
          변경 사항 저장
        </Button>
      </div>
    </form>
  );
}

function DeleteRepository({ model }: { model: ModelDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isConfirming, setIsConfirming] = useState(false);
  const [typedName, setTypedName] = useState('');
  const remove = useMutation({
    mutationFn: () => deleteModel(model.id),
    onSuccess: () => {
      void navigate('/dashboard', { replace: true });
      forgetModel(model.id);
      queryClient.removeQueries({ queryKey: modelKeys.detail(model.id) });
      queryClient.removeQueries({ queryKey: modelKeys.resolve(model.owner.username, model.slug) });
      void queryClient.invalidateQueries({ queryKey: ['models', 'list'] });
      void queryClient.invalidateQueries({ queryKey: exploreKeys.sections });
      void queryClient.invalidateQueries({ queryKey: exploreKeys.profile(model.owner.username) });
      void queryClient.invalidateQueries({ queryKey: issueKeys.stars });
      void queryClient.invalidateQueries({ queryKey: issueKeys.activity });
    },
  });
  const close = (open: boolean) => {
    setIsConfirming(open);
    if (!open) setTypedName('');
  };

  return (
    <div className="grid gap-4">
      <p className="text-sm leading-6 text-slate">
        모든 버전과 파일, 이슈와 답글, 스타, 공유 설정이 함께 지워져요. 되돌릴 수 없어요.
      </p>
      <div>
        <Button variant="danger" onClick={() => setIsConfirming(true)}>
          저장소 삭제
        </Button>
      </div>
      <ConfirmDialog
        open={isConfirming}
        onOpenChange={close}
        title="저장소를 삭제할까요?"
        description={
          <>
            <strong className="text-sumi">
              {model.owner.username}/{model.name}
            </strong>
            과 그 안의 버전, 이슈, 스타가 모두 지워지고 되돌릴 수 없어요.
          </>
        }
        confirmLabel="저장소 영구 삭제"
        onConfirm={() => remove.mutate()}
        isPending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error, t) : null}
        isConfirmDisabled={typedName !== model.name}
      >
        <TextField
          label={`확인을 위해 저장소 이름 ${model.name}을 입력하세요`}
          value={typedName}
          onChange={(event) => setTypedName(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </ConfirmDialog>
    </div>
  );
}

/** Repository settings: editors change the basics, only the owner sees the delete section. */
export function RepoSettingsPage() {
  const { model } = useRepo();
  if (!hasRoleAtLeast(model.myAccess.role, 'editor'))
    return <Navigate to={modelPath(model)} replace />;
  return (
    <div className="mx-auto max-w-[1080px] px-4 py-8 md:px-10">
      <SettingsPanel id="general" title="기본 정보" description="목록과 검색에 보이는 정보예요.">
        <GeneralForm key={model.slug} model={model} />
      </SettingsPanel>
      {model.myAccess.role === 'owner' && (
        <SettingsPanel
          id="danger"
          title="위험 구역"
          description="저장소를 지우면 되돌릴 수 없어요."
          tone="danger"
        >
          <DeleteRepository model={model} />
        </SettingsPanel>
      )}
    </div>
  );
}

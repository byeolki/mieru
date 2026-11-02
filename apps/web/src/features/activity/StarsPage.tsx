import { useQuery } from '@tanstack/react-query';
import { Sparkle } from '../../design/Sparkle.js';
import { ButtonLink } from '../../design/ui/Button.js';
import { Spinner } from '../../design/ui/Spinner.js';
import { getMyStars, issueKeys } from '../issues/api.js';
import { ModelRows } from '../models/ModelRows.js';
import { AppShell, PageHeader } from '../shell/AppShell.js';

export function StarsPage() {
  const stars = useQuery({ queryKey: issueKeys.stars, queryFn: getMyStars });
  return (
    <AppShell>
      <PageHeader
        title="내 스타"
        description="스타한 모델이 여기에 모여요. 나중에 다시 보고 싶은 모델에 스타를 달아두세요."
      />
      {stars.isPending ? (
        <Spinner className="size-6 text-lilac" />
      ) : stars.isError ? (
        <p className="text-sm text-danger">목록을 불러오지 못했어요.</p>
      ) : stars.data.items.length === 0 ? (
        <section className="haze-tone rounded-(--radius-sheet) px-8 py-14 text-center">
          <Sparkle className="mx-auto size-7" color="var(--color-mieru-pink)" />
          <p className="mt-3 font-semibold">스타한 모델이 없어요</p>
          <p className="mt-1 text-sm text-slate">
            마음에 드는 모델에 스타를 누르면 여기에 모아둘게요.
          </p>
          <ButtonLink to="/explore" variant="secondary" className="mt-5">
            모델 둘러보기
          </ButtonLink>
        </section>
      ) : (
        <ModelRows items={stars.data.items} showOwner />
      )}
    </AppShell>
  );
}

import { Spinner } from './Spinner.js';

/** Announced loading indicator; the spinner itself is decorative. */
export function Loading({
  label = '불러오는 중',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div role="status" aria-label={label} className={className ?? 'py-10 text-lilac'}>
      <Spinner className="size-5" />
    </div>
  );
}

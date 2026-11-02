import clsx from 'clsx';

const BACKGROUNDS = ['#F2C2D4', '#C8B6D4', '#E7E0F3', '#F9D7EA', '#D9E4F5', '#E3EFE6'];

function pickBackground(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return BACKGROUNDS[hash % BACKGROUNDS.length] ?? '#E7E0F3';
}

/** Generated avatar: first letter of the display name on a pastel derived from the username. */
export function Avatar({
  username,
  displayName,
  size = 32,
  className,
}: {
  username: string;
  displayName: string;
  size?: number;
  className?: string;
}) {
  const initial = Array.from(displayName.trim() || username)[0]?.toUpperCase() ?? '?';
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'inline-grid shrink-0 place-items-center rounded-full font-semibold text-ink',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        backgroundColor: pickBackground(username),
      }}
    >
      {initial}
    </span>
  );
}

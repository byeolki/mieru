import { useState } from 'react';
import clsx from 'clsx';

const BACKGROUNDS = ['#F2C2D4', '#C8B6D4', '#E7E0F3', '#F9D7EA', '#D9E4F5', '#E3EFE6'];

function pickBackground(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return BACKGROUNDS[hash % BACKGROUNDS.length] ?? '#E7E0F3';
}

/**
 * The user's uploaded photo when they have one, otherwise a generated avatar: the first letter
 * of the display name on a pastel derived from the username. A photo that fails to load falls
 * back to the generated one.
 */
export function Avatar({
  username,
  displayName,
  avatarKey = null,
  size = 32,
  className,
}: {
  username: string;
  displayName: string;
  avatarKey?: string | null;
  size?: number;
  className?: string;
}) {
  const [failedKey, setFailedKey] = useState<string | null>(null);
  if (avatarKey && failedKey !== avatarKey) {
    return (
      <img
        src={`/api/avatars/${avatarKey}`}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailedKey(avatarKey)}
        className={clsx('shrink-0 rounded-full bg-haze object-cover', className)}
        style={{ width: size, height: size }}
      />
    );
  }
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

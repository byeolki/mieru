interface SparkleProps {
  className?: string;
  color?: string;
}

/** The four-point star from the logo; also the icon for stars (GitHub-style favorites). */
export function Sparkle({ className = 'size-4', color = 'currentColor' }: SparkleProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 1.5c.55 4.9 2.3 7.9 10.5 10.5-8.2 2.6-9.95 5.6-10.5 10.5C11.45 17.6 9.7 14.6 1.5 12 9.7 9.4 11.45 6.4 12 1.5Z"
        fill={color}
      />
    </svg>
  );
}

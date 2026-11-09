import { useState, type ReactNode } from 'react';

/** Rows shown before a list folds; long input/output lists (LLMs have dozens) push pages away. */
const FOLDED_COUNT = 6;

/**
 * A list that shows its first few items and a button for the rest.
 * @param items Rendered rows, each with its own key.
 */
export function ShowMoreList({ items, className }: { items: ReactNode[]; className?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const hidden = items.length - FOLDED_COUNT;
  return (
    <>
      <ul className={className}>{isOpen || hidden <= 0 ? items : items.slice(0, FOLDED_COUNT)}</ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          className="mt-1.5 text-xs font-medium text-primary hover:underline"
        >
          {isOpen ? '접기' : `${String(hidden)}개 더 보기`}
        </button>
      )}
    </>
  );
}

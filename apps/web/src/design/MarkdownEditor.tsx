import * as Tabs from '@radix-ui/react-tabs';
import clsx from 'clsx';
import { useId } from 'react';
import { inputClasses } from './ui/TextField.js';
import { Markdown } from './Markdown.js';

interface MarkdownEditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  maxLength?: number;
}

const TAB =
  'rounded-md px-2.5 py-1 text-xs font-medium text-slate data-[state=active]:bg-surface data-[state=active]:text-sumi data-[state=active]:shadow-sm';

/** Write/preview editor for READMEs, issues and replies; preview uses the same safe renderer. */
export function MarkdownEditor({
  label,
  value,
  onChange,
  rows = 8,
  placeholder,
  maxLength,
}: MarkdownEditorProps) {
  const id = useId();
  return (
    <Tabs.Root defaultValue="write">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <Tabs.List
          className="flex gap-0.5 rounded-lg bg-haze p-0.5"
          aria-label={`${label} 보기 방식`}
        >
          <Tabs.Trigger value="write" className={TAB}>
            쓰기
          </Tabs.Trigger>
          <Tabs.Trigger value="preview" className={TAB}>
            미리보기
          </Tabs.Trigger>
        </Tabs.List>
      </div>
      <Tabs.Content value="write">
        <textarea
          id={id}
          value={value}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={clsx(inputClasses(false), 'h-auto py-3 font-mono text-sm leading-6')}
        />
        <p className="mt-1 text-xs text-slate">
          Markdown을 쓸 수 있어요. HTML은 그대로 글자로 보여요.
        </p>
      </Tabs.Content>
      <Tabs.Content
        value="preview"
        className="min-h-[120px] rounded-(--radius-control) border border-fog bg-surface px-4 py-3"
      >
        {value.trim() ? (
          <Markdown source={value} className="markdown-body" />
        ) : (
          <p className="text-sm text-slate">미리 볼 내용이 없어요.</p>
        )}
      </Tabs.Content>
    </Tabs.Root>
  );
}

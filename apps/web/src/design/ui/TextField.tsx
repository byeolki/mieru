import clsx from 'clsx';
import { Eye, EyeOff } from 'lucide-react';
import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  trailing?: ReactNode;
}

export const inputClasses = (hasError: boolean) =>
  clsx(
    'h-11 w-full rounded-(--radius-control) border bg-surface px-3.5 text-[0.95rem] text-sumi',
    'placeholder:text-slate/60 transition-[border-color,box-shadow] duration-150',
    'focus:outline-none focus:ring-4',
    hasError
      ? 'border-danger focus:border-danger focus:ring-danger/15'
      : 'border-fog hover:border-lilac focus:border-primary focus:ring-primary/12',
  );

export function TextField({ label, hint, error, trailing, className, ...rest }: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          {...rest}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={clsx(hint && hintId, error && errorId) || undefined}
          className={clsx(inputClasses(Boolean(error)), trailing && 'pr-11')}
        />
        {trailing && (
          <div className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</div>
        )}
      </div>
      {error ? (
        <p id={errorId} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="mt-1.5 text-xs leading-5 text-slate">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function PasswordField(props: Omit<TextFieldProps, 'type' | 'trailing'>) {
  const [isVisible, setIsVisible] = useState(false);
  return (
    <TextField
      {...props}
      type={isVisible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setIsVisible((value) => !value)}
          className="grid size-8 place-items-center rounded-md text-slate hover:bg-haze hover:text-sumi"
          aria-label={isVisible ? '비밀번호 숨기기' : '비밀번호 보기'}
        >
          {isVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      }
    />
  );
}

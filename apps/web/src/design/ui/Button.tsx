import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { Spinner } from './Spinner.js';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-primary text-on-accent hover:bg-primary-hover',
  secondary: 'bg-surface text-sumi border border-fog hover:border-lilac hover:bg-haze/50',
  ghost: 'text-slate hover:text-sumi hover:bg-haze/70',
  danger: 'bg-danger text-on-accent hover:brightness-95',
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
};

export function buttonClasses(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return clsx(
    'inline-flex items-center justify-center rounded-(--radius-control) font-medium whitespace-nowrap',
    'transition-[background-color,border-color,color,filter] duration-150',
    'disabled:pointer-events-none disabled:opacity-50',
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled ?? isLoading}
      aria-busy={isLoading || undefined}
      className={buttonClasses(variant, size, className)}
    >
      {isLoading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

interface ButtonLinkProps extends LinkProps {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      {...rest}
      className={buttonClasses(
        variant,
        size,
        typeof className === 'string' ? className : undefined,
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

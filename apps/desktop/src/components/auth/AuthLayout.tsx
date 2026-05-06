import type { ReactNode } from 'react';
import { CustomTitlebar } from '@/components/titlebar/CustomTitlebar';

interface AuthLayoutProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps): JSX.Element {
  return (
    <div className="flex h-screen flex-col bg-bg-default text-text-primary">
      <CustomTitlebar />
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-[440px] rounded-md bg-bg-darker p-8 shadow-elevated">
          <h1 className="text-center text-[24px] font-bold tracking-tight text-text-primary">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-center text-[14px] text-text-secondary">{subtitle}</p>
          )}
          <div className="mt-6 flex flex-col gap-4">{children}</div>
          {footer && <div className="mt-4 text-center text-[14px]">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

export function AuthInput({
  label,
  id,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  id: string;
  error?: string;
}): JSX.Element {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-2 block text-[12px] font-bold tracking-wide text-text-secondary uppercase">
        {label}
        {props.required && <span className="ml-0.5 text-accent-danger">*</span>}
      </span>
      <input
        id={id}
        {...props}
        className="w-full rounded-[3px] border border-transparent bg-bg-deepest px-2.5 py-2.5 text-[16px] text-text-primary outline-none focus:border-accent-primary"
      />
      {error && <span className="mt-1 block text-[12px] text-accent-danger">{error}</span>}
    </label>
  );
}

interface AuthButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: 'primary' | 'ghost';
}

export function AuthButton({
  loading,
  variant = 'primary',
  className,
  children,
  ...rest
}: AuthButtonProps): JSX.Element {
  const base =
    'flex h-11 w-full items-center justify-center rounded-[3px] text-[15px] font-medium transition-colors disabled:opacity-60';
  const styles =
    variant === 'primary'
      ? 'bg-accent-primary text-white hover:bg-accent-hover'
      : 'bg-transparent text-text-link hover:underline';
  return (
    <button
      type="submit"
      disabled={loading ?? rest.disabled}
      className={[base, styles, className ?? ''].join(' ')}
      {...rest}
    >
      {loading ? 'Загрузка…' : children}
    </button>
  );
}

export function AuthLink({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  return (
    <button
      type="button"
      className="text-[14px] text-text-link hover:underline"
      {...rest}
    >
      {children}
    </button>
  );
}

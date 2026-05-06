import { useState } from 'react';
import { AuthButton, AuthInput, AuthLayout, AuthLink } from '@/components/auth/AuthLayout';
import type { Session } from '@/auth/session';
import { ApiError } from '@/api/client';

interface LoginScreenProps {
  serverUrl: string;
  session: Session;
  onSwitchServer: () => void;
  onGoToRegister: () => void;
}

export function LoginScreen({
  serverUrl,
  session,
  onSwitchServer,
  onGoToRegister,
}: LoginScreenProps): JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await session.login({ username, password });
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="С возвращением!"
      subtitle={
        <span>
          {serverUrl} ·{' '}
          <button
            type="button"
            onClick={onSwitchServer}
            className="text-text-link hover:underline"
          >
            сменить сервер
          </button>
        </span>
      }
      footer={
        <span className="text-text-muted">
          Нет аккаунта? <AuthLink onClick={onGoToRegister}>Создать</AuthLink>
        </span>
      }
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <AuthInput
          label="Имя пользователя"
          id="login-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          required
          autoComplete="username"
          spellCheck={false}
        />
        <AuthInput
          label="Пароль"
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        {error && <p className="text-[13px] text-accent-danger">{error}</p>}
        <AuthButton loading={loading}>Войти</AuthButton>
      </form>
    </AuthLayout>
  );
}

function toMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'invalid_credentials') return 'Неверное имя пользователя или пароль';
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Не удалось войти';
}

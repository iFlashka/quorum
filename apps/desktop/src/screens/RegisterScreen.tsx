import { useState } from 'react';
import { AuthButton, AuthInput, AuthLayout, AuthLink } from '@/components/auth/AuthLayout';
import type { Session } from '@/auth/session';
import { ApiError } from '@/api/client';

interface RegisterScreenProps {
  serverUrl: string;
  session: Session;
  onGoToLogin: () => void;
  onSwitchServer: () => void;
}

export function RegisterScreen({
  serverUrl,
  session,
  onGoToLogin,
  onSwitchServer,
}: RegisterScreenProps): JSX.Element {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await session.register({
        username: username.toLowerCase().trim(),
        password,
        displayName: displayName.trim() || username.trim(),
        inviteCode: inviteCode.trim(),
      });
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Создать аккаунт"
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
          Уже есть аккаунт? <AuthLink onClick={onGoToLogin}>Войти</AuthLink>
        </span>
      }
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <AuthInput
          label="Имя пользователя"
          id="register-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          required
          autoComplete="username"
          spellCheck={false}
          placeholder="латинские буквы, цифры, _"
        />
        <AuthInput
          label="Отображаемое имя"
          id="register-display"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="как тебя видят другие"
          autoComplete="nickname"
        />
        <AuthInput
          label="Пароль"
          id="register-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          minLength={8}
        />
        <AuthInput
          label="Invite-код"
          id="register-invite"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
          required
          spellCheck={false}
          placeholder="DEVCODE"
        />
        {error && <p className="text-[13px] text-accent-danger">{error}</p>}
        <AuthButton loading={loading}>Создать аккаунт</AuthButton>
      </form>
    </AuthLayout>
  );
}

function toMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'invite_invalid':
        return 'Такого invite-кода не существует';
      case 'invite_exhausted':
        return 'Этот invite уже использован полностью';
      case 'invite_expired':
        return 'Срок invite-кода истёк';
      case 'username_taken':
        return 'Это имя пользователя уже занято';
      case 'invalid_body':
        return 'Проверь поля — что-то не прошло валидацию';
      default:
        return err.message;
    }
  }
  if (err instanceof Error) return err.message;
  return 'Не удалось создать аккаунт';
}

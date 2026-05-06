import { useState } from 'react';
import { AuthButton, AuthInput, AuthLayout } from '@/components/auth/AuthLayout';
import { normalizeServerUrl, saveServerConfig } from '@/lib/server-config';

interface OnboardingScreenProps {
  onConnected: (url: string) => void;
}

export function OnboardingScreen({ onConnected }: OnboardingScreenProps): JSX.Element {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    const url = normalizeServerUrl(input);
    if (!url) {
      setError('Введите адрес сервера');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${url}/health`, { method: 'GET' });
      if (!res.ok) throw new Error(`сервер вернул ${res.status}`);
      const body = (await res.json()) as { status?: string };
      if (body.status !== 'ok') throw new Error('сервер не подтвердил health-check');
      await saveServerConfig({ url });
      onConnected(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'не удалось подключиться';
      setError(`Не удалось дотянуться до сервера: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Добро пожаловать в Quorum"
      subtitle="Введите адрес вашего Quorum-сервера, чтобы начать"
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <AuthInput
          label="Адрес сервера"
          id="server-url"
          placeholder="quorum.example.com или http://localhost:4421"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          error={error ?? undefined}
          autoFocus
          required
          autoComplete="url"
          spellCheck={false}
        />
        <AuthButton loading={loading}>Подключиться</AuthButton>
      </form>
    </AuthLayout>
  );
}

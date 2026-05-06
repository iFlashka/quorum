import { useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { CustomTitlebar } from '@/components/titlebar/CustomTitlebar';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { LoginScreen } from '@/screens/LoginScreen';
import { RegisterScreen } from '@/screens/RegisterScreen';
import { AppScreen } from '@/screens/AppScreen';
import { loadServerConfig } from '@/lib/server-config';
import { createAppRuntime } from '@/auth/runtime';
import { useRuntime } from '@/auth/runtime-store';
import { useAuth } from '@/auth/store';
import { attachRealtimeBridge } from '@/realtime/realtime-bridge';

type Stage = 'bootstrapping' | 'onboarding' | 'login' | 'register' | 'authed';

export function App(): JSX.Element {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  );
}

function AppInner(): JSX.Element {
  const [stage, setStage] = useState<Stage>('bootstrapping');
  const runtime = useRuntime((s) => s.runtime);
  const setRuntime = useRuntime((s) => s.setRuntime);
  const status = useAuth((s) => s.status);
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    void (async (): Promise<void> => {
      const cfg = await loadServerConfig().catch(() => null);
      if (!cfg) {
        setStage('onboarding');
        return;
      }
      const rt = createAppRuntime(cfg.url);
      setRuntime(rt);
      await rt.session.bootstrap();
    })();
  }, [setRuntime]);

  // Перевод стадии вслед за auth-статусом и наличием runtime.
  useEffect(() => {
    if (!runtime) {
      if (stage !== 'bootstrapping' && stage !== 'onboarding') {
        setStage('onboarding');
      }
      return;
    }
    if (status === 'authenticated') {
      setStage('authed');
    } else if (status === 'unauthenticated') {
      setStage((s) => (s === 'register' ? 'register' : 'login'));
    }
  }, [runtime, status, stage]);

  // Поднимаем WS когда auth получен; роняем при logout.
  useEffect(() => {
    if (!runtime) return;
    if (status === 'authenticated') {
      runtime.ws.connect();
    } else {
      runtime.ws.disconnect();
    }
  }, [runtime, status]);

  if (stage === 'bootstrapping') {
    return (
      <div className="flex h-screen flex-col bg-bg-default text-text-primary">
        <CustomTitlebar />
        <div className="flex flex-1 items-center justify-center text-text-muted">
          <span className="text-[14px]">Подключаемся…</span>
        </div>
      </div>
    );
  }

  if (stage === 'onboarding') {
    return (
      <OnboardingScreen
        onConnected={(url) => {
          const rt = createAppRuntime(url);
          setRuntime(rt);
          setStage('login');
          void rt.session.bootstrap();
        }}
      />
    );
  }

  if (!runtime) {
    return (
      <div className="flex h-screen flex-col bg-bg-default text-text-primary">
        <CustomTitlebar />
      </div>
    );
  }

  if (stage === 'login') {
    return (
      <LoginScreen
        serverUrl={runtime.serverUrl}
        session={runtime.session}
        onSwitchServer={() => void useRuntime.getState().switchServer()}
        onGoToRegister={() => setStage('register')}
      />
    );
  }

  if (stage === 'register') {
    return (
      <RegisterScreen
        serverUrl={runtime.serverUrl}
        session={runtime.session}
        onGoToLogin={() => setStage('login')}
        onSwitchServer={() => void useRuntime.getState().switchServer()}
      />
    );
  }

  return <AppScreenWithBridge />;
}

/**
 * Привязывает realtime-bridge к QueryClient — `useQueryClient` доступен только
 * внутри `QueryClientProvider`, поэтому отдельный компонент.
 */
function AppScreenWithBridge(): JSX.Element {
  const runtime = useRuntime((s) => s.runtime);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!runtime) return;
    return attachRealtimeBridge(runtime.ws, queryClient);
  }, [runtime, queryClient]);
  return <AppScreen />;
}

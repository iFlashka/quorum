import { useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { CustomTitlebar } from '@/components/titlebar/CustomTitlebar';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { LoginScreen } from '@/screens/LoginScreen';
import { RegisterScreen } from '@/screens/RegisterScreen';
import { AppScreen } from '@/screens/AppScreen';
import { loadServerConfig } from '@/lib/server-config';
import { createAppRuntime } from '@/auth/runtime';
import { useRuntime } from '@/auth/runtime-store';
import { useAuth } from '@/auth/store';
import { attachRealtimeBridge, findChannelName } from '@/realtime/realtime-bridge';
import { useRealtime, useUnreadChannelsCount } from '@/realtime/store';
import { applyBadge } from '@/lib/badge';
import { maybeNotifyMention } from '@/lib/notifications';
import { initNotificationPrefs } from '@/state/notification-prefs';
import { useAutostart } from '@/lib/autostart';
import { Splash } from '@/components/Splash';
import { VoiceOrchestrator } from '@/voice/orchestrator';
import { ChannelVoiceOrchestrator } from '@/voice/channel-orchestrator';
import { lookupParticipantInCache } from '@/voice/lookup';
import { CallOverlay } from '@/components/voice/CallOverlay';
import { VoiceOrchestratorContext } from '@/voice/context';
import { ChannelVoiceContext } from '@/voice/channel-context';
import { useVoicePrefs } from '@/voice/prefs';
import { useSoundPrefs } from '@/state/sound-prefs';
import { soundManager } from '@/audio/sounds';
import { startOutputAudioSync } from '@/voice/audio-output';
import {
  maybePlayMentionSound,
  maybePlayMessageSound,
  subscribeCallSounds,
  subscribeChannelVoiceSounds,
  subscribeVolumeSync,
} from '@/audio/effects';
import { checkForUpdate } from '@/lib/updater';
import { useUpdater } from '@/state/updater-store';
import { UpdaterToast } from '@/components/UpdaterToast';
import { SettingsModal } from '@/components/settings/SettingsModal';

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
      <SettingsModal />
      <Toaster theme="dark" position="bottom-right" closeButton richColors />
      <UpdaterToast />
    </QueryClientProvider>
  );
}

async function runUpdateCheck(): Promise<void> {
  try {
    const result = await checkForUpdate();
    useUpdater.getState().setLastChecked(Date.now());
    useUpdater.getState().setPending(result);
  } catch {
    // Сервер релизов недоступен / ничего нового — silent.
  }
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

    let unlistenMute: (() => void) | undefined;
    void (async (): Promise<void> => {
      // Native-окружение Tauri: восстанавливаем mute-prefs, читаем autostart-state.
      // Каждое — best-effort: если упадёт (web-режим, нет плагина) — игнор.
      unlistenMute = await initNotificationPrefs().catch(() => undefined);
      void useAutostart.getState().refresh();
      void useVoicePrefs.getState().hydrate();
      void useSoundPrefs.getState().hydrate();
      soundManager.preload();
      startOutputAudioSync();
      void runUpdateCheck();

      const cfg = await loadServerConfig().catch(() => null);
      if (!cfg) {
        setStage('onboarding');
        return;
      }
      const rt = createAppRuntime(cfg.url);
      setRuntime(rt);
      await rt.session.bootstrap();
    })();

    // Раз в час подтягиваем — пользователь редко перезапускает клиент.
    const updateInterval = setInterval(() => void runUpdateCheck(), 60 * 60 * 1000);

    return () => {
      unlistenMute?.();
      clearInterval(updateInterval);
    };
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
        <Splash />
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
 * внутри `QueryClientProvider`, поэтому отдельный компонент. Здесь же:
 *   - bridge'у выдаётся mention-notifier с lookup имени канала из cache,
 *   - подписка на unread-счётчик зеркалит его в tray-иконку и заголовок окна,
 *   - voice-orchestrator стартует на runtime и подключает CallOverlay через
 *     React-context.
 */
function AppScreenWithBridge(): JSX.Element {
  const runtime = useRuntime((s) => s.runtime);
  const queryClient = useQueryClient();
  const meId = useAuth((s) => s.user?.id);
  const unreadCount = useUnreadChannelsCount();

  useEffect(() => {
    if (!runtime || !meId) return;
    return attachRealtimeBridge(runtime.ws, queryClient, {
      onMessageCreate: (message) => {
        const channelName = findChannelName(queryClient, message.channelId) ?? 'channel';
        void maybeNotifyMention(
          {
            message,
            channelName,
            authorDisplayName: message.author.displayName || message.author.username,
          },
          meId,
        );
        maybePlayMentionSound(message, meId);
        maybePlayMessageSound(message, meId);
        if (
          message.author.id !== meId &&
          message.mentionedUserIds.includes(meId)
        ) {
          useRealtime.getState().incrementMention(message.channelId);
        }
      },
      onDmMessageCreate: (message) => {
        // System-сообщения (call_*) не делают шум.
        if (message.kind !== 'text') return;
        // Для DM mention считается "любое сообщение от пира" — оно прямо
        // тебе адресовано. Шумим как mention-sound и шлём toast если окно
        // не сфокусировано (через тот же maybeNotifyMention с подменой
        // channelName на peer-имя).
        if (message.author.id === meId) return;
        void maybeNotifyMention(
          {
            // PublicDmMessage совместим по полям с MentionContext.message,
            // но channelId-поля нет — используем dm-channel-id как surrogate.
            message: {
              ...message,
              channelId: message.dmChannelId,
              mentionedUserIds: [meId],
            },
            channelName: message.author.displayName || message.author.username,
            authorDisplayName: message.author.displayName || message.author.username,
          },
          meId,
        );
        maybePlayMentionSound(
          { ...message, channelId: message.dmChannelId, mentionedUserIds: [meId] },
          meId,
        );
      },
    });
  }, [runtime, queryClient, meId]);

  useEffect(() => {
    if (!meId) return;
    const unsubCall = subscribeCallSounds();
    const unsubChannel = subscribeChannelVoiceSounds(() => useAuth.getState().user?.id ?? null);
    const unsubVolume = subscribeVolumeSync();
    return () => {
      unsubCall();
      unsubChannel();
      unsubVolume();
    };
  }, [meId]);

  useEffect(() => {
    void applyBadge(unreadCount);
  }, [unreadCount]);

  // useMemo factory может вызываться дважды в StrictMode dev — оставляем
  // её детерминированной (только конструктор), а start/stop парим
  // через useEffect, чьи cleanup-ы корректно сбалансированы.
  const voiceOrchestrator = useMemo(() => {
    if (!runtime) return null;
    return new VoiceOrchestrator({
      ws: runtime.ws,
      callsApi: runtime.callsApi,
      lookupParticipant: (userId) => lookupParticipantInCache(queryClient, userId),
      getMeId: () => useAuth.getState().user?.id ?? null,
    });
  }, [runtime, queryClient]);

  useEffect(() => {
    if (!voiceOrchestrator) return;
    voiceOrchestrator.start();
    return () => voiceOrchestrator.stop();
  }, [voiceOrchestrator]);

  const channelOrchestrator = useMemo(() => {
    if (!runtime) return null;
    return new ChannelVoiceOrchestrator({
      livekitApi: runtime.livekitApi,
      ws: runtime.ws,
      getMe: () => {
        const u = useAuth.getState().user;
        if (!u) return null;
        return { id: u.id, displayName: u.displayName || u.username };
      },
    });
  }, [runtime]);

  if (!voiceOrchestrator || !channelOrchestrator) return <AppScreen />;
  return (
    <VoiceOrchestratorContext.Provider value={voiceOrchestrator}>
      <ChannelVoiceContext.Provider value={channelOrchestrator}>
        <AppScreen />
        <CallOverlay />
      </ChannelVoiceContext.Provider>
    </VoiceOrchestratorContext.Provider>
  );
}

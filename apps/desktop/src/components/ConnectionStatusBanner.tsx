/**
 * Баннер сверху ChatArea, который виден когда WebSocket не в `open` состоянии.
 *
 * Discord-style: тонкая горизонтальная плашка через всю ширину main-area
 * с иконкой + текстом. Цвет:
 *   - reconnecting / connecting → жёлтый (accent-warning)
 *   - failed → красный (accent-danger)
 *
 * При status=open баннер исчезает (return null).
 */

import { useEffect, useState } from 'react';
import { CloudOff, Loader2, WifiOff } from 'lucide-react';
import { useRuntime } from '@/auth/runtime-store';
import type { ConnectionStatus } from '@/realtime/WebSocketManager';
import { cn } from '@/lib/utils';

export function ConnectionStatusBanner(): JSX.Element | null {
  const ws = useRuntime((s) => s.runtime?.ws);
  const [status, setStatus] = useState<ConnectionStatus>(ws?.getStatus() ?? 'idle');

  useEffect(() => {
    if (!ws) return;
    return ws.onStatusChange(setStatus);
  }, [ws]);

  if (status === 'open' || status === 'idle') return null;

  const visual = describe(status);

  return (
    <div
      role="status"
      className={cn(
        'flex items-center justify-center gap-2 px-4 py-1.5 text-[13px] font-medium',
        visual.bg,
        visual.fg,
      )}
    >
      <visual.Icon size={14} className={visual.iconClass} />
      <span>{visual.text}</span>
    </div>
  );
}

interface Visual {
  text: string;
  Icon: typeof Loader2;
  iconClass?: string;
  bg: string;
  fg: string;
}

function describe(status: ConnectionStatus): Visual {
  switch (status) {
    case 'connecting':
      return {
        text: 'Соединение…',
        Icon: Loader2,
        iconClass: 'animate-spin',
        bg: 'bg-accent-warning/15',
        fg: 'text-accent-warning',
      };
    case 'reconnecting':
      return {
        text: 'Соединение потеряно. Переподключаемся…',
        Icon: WifiOff,
        bg: 'bg-accent-warning/15',
        fg: 'text-accent-warning',
      };
    case 'failed':
      return {
        text: 'Не удалось подключиться к серверу. Проверь интернет.',
        Icon: CloudOff,
        bg: 'bg-accent-danger/15',
        fg: 'text-accent-danger',
      };
    default:
      return {
        text: '',
        Icon: Loader2,
        bg: 'bg-bg-elevated',
        fg: 'text-text-secondary',
      };
  }
}

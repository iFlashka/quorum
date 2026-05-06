/**
 * Discord-style система-сообщение в DM-чате о начале/конце звонка.
 * Без аватара/имени — горизонтальная плашка с phone-иконкой и текстом.
 */

import { Phone, PhoneOff } from 'lucide-react';
import type { PublicDmMessage } from '@quorum/shared';
import { cn } from '@/lib/utils';

interface SystemCallMessageProps {
  message: PublicDmMessage;
}

export function SystemCallMessage({ message }: SystemCallMessageProps): JSX.Element {
  const isStart = message.kind === 'call_started';
  const Icon = isStart ? Phone : PhoneOff;
  const tone = isStart ? 'text-accent-success' : 'text-text-muted';
  const time = formatTimestamp(message.createdAt);

  return (
    <div className="flex items-center gap-3 px-4 py-1 text-[13px] text-text-secondary">
      <Icon size={16} strokeWidth={2} className={cn('shrink-0', tone)} />
      <span className="font-medium text-text-primary">
        {message.author.displayName || message.author.username}
      </span>
      <span className="text-text-muted">{message.content}.</span>
      <span className="num-tabular ml-auto text-[11px] text-text-muted">{time}</span>
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

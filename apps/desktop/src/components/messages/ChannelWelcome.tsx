/**
 * Discord-style блок «начало канала», рендерится в самом верху ленты, когда
 * больше нечего подгружать (`!hasNextPage`). Большая круглая иконка с
 * символом канала + заголовок «Добро пожаловать в #channel» + подпись.
 *
 * Используется и как empty-state — если в канале вообще нет сообщений,
 * MessageList рисует только этот блок.
 */

import { Hash, Volume2 } from 'lucide-react';

interface ChannelWelcomeProps {
  channelName: string;
  channelKind: 'text' | 'voice';
}

export function ChannelWelcome({
  channelName,
  channelKind,
}: ChannelWelcomeProps): JSX.Element {
  const Icon = channelKind === 'voice' ? Volume2 : Hash;
  return (
    <div className="px-4 pt-6 pb-4">
      <div className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-bg-elevated">
        <Icon size={42} strokeWidth={1.5} className="text-text-secondary" />
      </div>
      <h2 className="mt-5 text-[32px] leading-[40px] font-bold tracking-tight text-text-primary">
        Добро пожаловать в #{channelName}!
      </h2>
      <p className="mt-1 text-[16px] text-text-secondary">
        {channelKind === 'voice'
          ? 'Это начало голосового канала.'
          : `Это начало канала #${channelName}.`}
      </p>
    </div>
  );
}

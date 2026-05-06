import { createContext, useContext } from 'react';
import type { ChannelVoiceOrchestrator } from './channel-orchestrator';

export const ChannelVoiceContext = createContext<ChannelVoiceOrchestrator | null>(null);

export function useChannelVoiceOrchestrator(): ChannelVoiceOrchestrator {
  const ctx = useContext(ChannelVoiceContext);
  if (!ctx) {
    throw new Error('useChannelVoiceOrchestrator must be used within ChannelVoiceProvider');
  }
  return ctx;
}

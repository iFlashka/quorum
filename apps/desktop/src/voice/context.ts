import { createContext, useContext } from 'react';
import type { VoiceOrchestrator } from './orchestrator';

export const VoiceOrchestratorContext = createContext<VoiceOrchestrator | null>(null);

export function useVoiceOrchestrator(): VoiceOrchestrator {
  const ctx = useContext(VoiceOrchestratorContext);
  if (!ctx) {
    throw new Error('useVoiceOrchestrator must be used within VoiceOrchestratorProvider');
  }
  return ctx;
}

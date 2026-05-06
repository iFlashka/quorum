/**
 * Управление модалом настроек: открыт ли, какая section активна.
 * Не персистится — состояние UI только в текущей сессии.
 */

import { create } from 'zustand';

export type SettingsSection = 'account' | 'voice' | 'notifications' | 'about';

interface SettingsState {
  open: boolean;
  section: SettingsSection;
  openSettings: (section?: SettingsSection) => void;
  close: () => void;
  setSection: (section: SettingsSection) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  open: false,
  section: 'account',
  openSettings: (section = 'account') => set({ open: true, section }),
  close: () => set({ open: false }),
  setSection: (section) => set({ section }),
}));

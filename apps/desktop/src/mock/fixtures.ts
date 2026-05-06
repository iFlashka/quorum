export interface MockGuild {
  id: string;
  name: string;
  initials: string;
  unread?: boolean;
}

export interface MockChannel {
  id: string;
  name: string;
  kind: 'text' | 'voice';
  unread?: boolean;
  active?: boolean;
}

export interface MockChannelCategory {
  id: string;
  name: string;
  channels: MockChannel[];
}

export interface MockMember {
  id: string;
  name: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  role?: 'owner' | 'admin' | 'member';
  initials: string;
}

export interface MockMessage {
  id: string;
  authorId: string;
  authorName: string;
  authorInitials: string;
  timestamp: string;
  body: string;
}

export const MOCK_GUILDS: MockGuild[] = [
  { id: 'g1', name: 'Quorum', initials: 'Q' },
  { id: 'g2', name: 'Inner Circle', initials: 'IC', unread: true },
  { id: 'g3', name: 'Lab', initials: 'L' },
];

export const MOCK_CATEGORIES: MockChannelCategory[] = [
  {
    id: 'c1',
    name: 'general',
    channels: [
      { id: 'ch1', name: 'welcome', kind: 'text' },
      { id: 'ch2', name: 'general', kind: 'text', active: true },
      { id: 'ch3', name: 'random', kind: 'text', unread: true },
    ],
  },
  {
    id: 'c2',
    name: 'voice',
    channels: [
      { id: 'ch4', name: 'Lounge', kind: 'voice' },
      { id: 'ch5', name: 'AFK', kind: 'voice' },
    ],
  },
];

export const MOCK_MEMBERS: MockMember[] = [
  { id: 'u1', name: 'Аня', status: 'online', role: 'owner', initials: 'А' },
  { id: 'u2', name: 'Borya', status: 'online', role: 'admin', initials: 'B' },
  { id: 'u3', name: 'Даша', status: 'idle', role: 'member', initials: 'Д' },
  { id: 'u4', name: 'Egor', status: 'dnd', role: 'member', initials: 'E' },
  { id: 'u5', name: 'Феликс', status: 'offline', role: 'member', initials: 'Ф' },
];

export const MOCK_CURRENT_USER: MockMember = {
  id: 'me',
  name: 'You',
  status: 'online',
  role: 'owner',
  initials: 'Y',
};

export const MOCK_MESSAGES: MockMessage[] = [
  {
    id: 'm1',
    authorId: 'u1',
    authorName: 'Аня',
    authorInitials: 'А',
    timestamp: '14:02',
    body: 'Привет! Это статичный shell — настоящие сообщения появятся в фазе 2.',
  },
  {
    id: 'm2',
    authorId: 'u2',
    authorName: 'Borya',
    authorInitials: 'B',
    timestamp: '14:05',
    body: 'Главное чтобы было похоже на Discord — выглядит ок.',
  },
  {
    id: 'm3',
    authorId: 'u3',
    authorName: 'Даша',
    authorInitials: 'Д',
    timestamp: '14:08',
    body: 'А когда голосовые каналы будут?',
  },
  {
    id: 'm4',
    authorId: 'u2',
    authorName: 'Borya',
    authorInitials: 'B',
    timestamp: '14:09',
    body: 'Фаза 5. Сначала auth и текстовый чат.',
  },
];

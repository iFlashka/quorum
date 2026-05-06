import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Options as NotificationOptions } from '@tauri-apps/plugin-notification';
import type { PublicMessage } from '@quorum/shared';

type Permission = 'granted' | 'denied' | 'default';

// Стабим Tauri-зависимости ДО импорта SUT, чтобы плагины не пытались сделать invoke.
type SendNotificationFn = (opts: NotificationOptions) => void;
type IsPermissionGrantedFn = () => Promise<boolean>;
type RequestPermissionFn = () => Promise<Permission>;

const sendNotification = vi.fn<SendNotificationFn>();
const isPermissionGranted = vi.fn<IsPermissionGrantedFn>(() => Promise.resolve(true));
const requestPermission = vi.fn<RequestPermissionFn>(() => Promise.resolve('granted'));

vi.mock('@tauri-apps/plugin-notification', () => ({
  sendNotification: (opts: NotificationOptions) => sendNotification(opts),
  isPermissionGranted: () => isPermissionGranted(),
  requestPermission: () => requestPermission(),
}));

const isVisible = vi.fn<() => Promise<boolean>>(() => Promise.resolve(false));
const isFocused = vi.fn<() => Promise<boolean>>(() => Promise.resolve(false));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ isVisible, isFocused }),
}));

import { _resetPermissionCache, maybeNotifyMention } from './notifications';
import { useNotificationPrefs } from '@/state/notification-prefs';

const ME_ID = '00000000-0000-0000-0000-00000000aaaa';
const OTHER_ID = '00000000-0000-0000-0000-00000000bbbb';

function makeMessage(overrides: Partial<PublicMessage> = {}): PublicMessage {
  return {
    id: 'msg-1',
    channelId: 'ch-1',
    author: {
      id: OTHER_ID,
      username: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
    },
    content: 'hi',
    createdAt: new Date().toISOString(),
    editedAt: null,
    replyToMessageId: null,
    replyToPreview: null,
    mentionedUserIds: [],
    attachments: [],
    reactions: [],
    ...overrides,
  };
}

function lastNotificationOptions(): NotificationOptions {
  const call = sendNotification.mock.calls[0];
  if (!call) throw new Error('expected sendNotification to have been called');
  return call[0];
}

describe('maybeNotifyMention', () => {
  beforeEach(() => {
    sendNotification.mockClear();
    isPermissionGranted.mockResolvedValue(true);
    requestPermission.mockResolvedValue('granted');
    isVisible.mockResolvedValue(false);
    isFocused.mockResolvedValue(false);
    useNotificationPrefs.setState({ muted: false, ready: true });
    _resetPermissionCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const ctx = (msg: PublicMessage): {
    message: PublicMessage;
    channelName: string;
    authorDisplayName: string;
  } => ({
    message: msg,
    channelName: 'general',
    authorDisplayName: 'Alice',
  });

  it('mention при свёрнутом окне — шлёт нотификацию', async () => {
    await maybeNotifyMention(
      ctx(makeMessage({ mentionedUserIds: [ME_ID], content: `hello <@${ME_ID}>!` })),
      ME_ID,
    );
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(lastNotificationOptions().title).toContain('Alice');
    expect(lastNotificationOptions().body).toContain('hello');
  });

  it('не шлёт когда сообщение от меня самого', async () => {
    await maybeNotifyMention(
      ctx(makeMessage({ author: { ...makeMessage().author, id: ME_ID } })),
      ME_ID,
    );
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('не шлёт когда не упомянули', async () => {
    await maybeNotifyMention(ctx(makeMessage({ mentionedUserIds: [] })), ME_ID);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('не шлёт когда muted', async () => {
    useNotificationPrefs.setState({ muted: true, ready: true });
    await maybeNotifyMention(
      ctx(makeMessage({ mentionedUserIds: [ME_ID] })),
      ME_ID,
    );
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('не шлёт когда окно сфокусировано', async () => {
    isVisible.mockResolvedValue(true);
    isFocused.mockResolvedValue(true);
    await maybeNotifyMention(
      ctx(makeMessage({ mentionedUserIds: [ME_ID] })),
      ME_ID,
    );
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('не шлёт если permission denied', async () => {
    isPermissionGranted.mockResolvedValue(false);
    requestPermission.mockResolvedValue('denied');
    await maybeNotifyMention(
      ctx(makeMessage({ mentionedUserIds: [ME_ID] })),
      ME_ID,
    );
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('preview — UUID-mentions сворачиваются в @… и текст обрезается до лимита', async () => {
    const long = 'x'.repeat(200);
    await maybeNotifyMention(
      ctx(
        makeMessage({
          mentionedUserIds: [ME_ID],
          content: `hi <@${ME_ID}> ${long}`,
        }),
      ),
      ME_ID,
    );
    const body = lastNotificationOptions().body ?? '';
    expect(body).toContain('@…');
    expect(body).not.toContain(ME_ID);
    expect(body.length).toBeLessThanOrEqual(140);
    expect(body.endsWith('…')).toBe(true);
  });
});

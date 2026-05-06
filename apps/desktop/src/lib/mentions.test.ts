import { describe, expect, it } from 'vitest';
import type { PublicMember } from '@quorum/shared';
import { serializeMentions } from './mentions';

const ALICE_ID = '11111111-1111-1111-1111-111111111111';
const BOB_ID = '22222222-2222-2222-2222-222222222222';

const members: PublicMember[] = [
  member('alice', ALICE_ID),
  member('bob_dev', BOB_ID),
];

describe('serializeMentions', () => {
  it('одиночный @username → <@uuid>', () => {
    expect(serializeMentions('hi @alice', members)).toBe(`hi <@${ALICE_ID}>`);
  });

  it('username с подчёркиванием тоже работает', () => {
    expect(serializeMentions('@bob_dev hey', members)).toBe(`<@${BOB_ID}> hey`);
  });

  it('case-insensitive по username', () => {
    expect(serializeMentions('@Alice hello', members)).toBe(`<@${ALICE_ID}> hello`);
  });

  it('несколько mentions в одной строке', () => {
    expect(serializeMentions('@alice and @bob_dev', members)).toBe(
      `<@${ALICE_ID}> and <@${BOB_ID}>`,
    );
  });

  it('@-без-разделителя в середине слова не матчится (email-подобное)', () => {
    expect(serializeMentions('me@alice.com', members)).toBe('me@alice.com');
  });

  it('неизвестный username — остаётся как есть', () => {
    expect(serializeMentions('hi @charlie', members)).toBe('hi @charlie');
  });

  it('пустой content — возвращается без изменений', () => {
    expect(serializeMentions('', members)).toBe('');
  });

  it('членов нет → ничего не подменяется', () => {
    expect(serializeMentions('hi @alice', [])).toBe('hi @alice');
  });
});

function member(username: string, userId: string): PublicMember {
  return {
    id: `m-${username}`,
    userId,
    guildId: 'g-1',
    username,
    displayName: username,
    avatarUrl: null,
    role: 'member',
    nickname: null,
    status: 'online',
    joinedAt: new Date().toISOString(),
  };
}

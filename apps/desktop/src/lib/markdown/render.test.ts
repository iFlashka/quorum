import { describe, expect, it } from 'vitest';
import type { PublicMember } from '@quorum/shared';
import { renderMarkdown } from './render';

describe('renderMarkdown', () => {
  it('обычный markdown → bold/italic html', () => {
    const html = renderMarkdown('hello **world** and *italics*');
    expect(html).toContain('<strong>world</strong>');
    expect(html).toContain('<em>italics</em>');
  });

  it('XSS — script-тег вырезается DOMPurify-ом', () => {
    const html = renderMarkdown('hi <script>alert(1)</script> there');
    expect(html).not.toContain('<script>');
    expect(html).not.toMatch(/alert\(1\)/);
  });

  it('on*-атрибуты вырезаются', () => {
    const html = renderMarkdown('<a href="https://x" onclick="x()">click</a>');
    expect(html).not.toContain('onclick');
  });

  it('javascript: ссылки блокируются', () => {
    const html = renderMarkdown('[click](javascript:alert(1))');
    expect(html).not.toMatch(/javascript:/i);
  });

  it('<@uuid> с известным юзером → span с @username', () => {
    const userById = new Map<string, PublicMember>([
      [
        '11111111-1111-1111-1111-111111111111',
        {
          id: 'm-1',
          userId: '11111111-1111-1111-1111-111111111111',
          guildId: 'g-1',
          username: 'alice',
          displayName: 'Alice',
          avatarUrl: null,
          role: 'member',
          nickname: null,
          status: 'online',
          joinedAt: new Date().toISOString(),
        },
      ],
    ]);
    const html = renderMarkdown('hey <@11111111-1111-1111-1111-111111111111>!', userById);
    expect(html).toContain('<span class="mention">@alice</span>');
  });

  it('<@uuid> с неизвестным юзером → @unknown', () => {
    const html = renderMarkdown('hey <@22222222-2222-2222-2222-222222222222>!');
    expect(html).toContain('@unknown');
  });
});

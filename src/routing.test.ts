import { describe, it, expect, beforeEach } from 'vitest';

import { _initTestDatabase, storeChatMetadata } from './db.js';
import { getAvailableGroups, _setRegisteredGroups } from './index.js';

beforeEach(() => {
  _initTestDatabase();
  _setRegisteredGroups({});
});

// --- JID ownership patterns ---

describe('JID ownership patterns', () => {
  it('Weixin JID: starts with wx:', () => {
    const jid = 'wx:oc_12345678';
    expect(jid.startsWith('wx:')).toBe(true);
  });

  it('Non-Weixin JID should not start with wx:', () => {
    const jid = 'tg:12345678';
    expect(jid.startsWith('wx:')).toBe(false);
  });
});

// --- getAvailableGroups ---

describe('getAvailableGroups', () => {
  it('returns only groups, excludes DMs', () => {
    storeChatMetadata(
      'wx:group1',
      '2024-01-01T00:00:01.000Z',
      'Group 1',
      'weixin',
      true,
    );
    storeChatMetadata(
      'wx:dm1',
      '2024-01-01T00:00:02.000Z',
      'User DM',
      'weixin',
      false,
    );
    storeChatMetadata(
      'wx:group2',
      '2024-01-01T00:00:03.000Z',
      'Group 2',
      'weixin',
      true,
    );

    const groups = getAvailableGroups();
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.jid)).toContain('wx:group1');
    expect(groups.map((g) => g.jid)).toContain('wx:group2');
    expect(groups.map((g) => g.jid)).not.toContain('wx:dm1');
  });

  it('excludes __group_sync__ sentinel', () => {
    storeChatMetadata('__group_sync__', '2024-01-01T00:00:00.000Z');
    storeChatMetadata(
      'wx:group',
      '2024-01-01T00:00:01.000Z',
      'Group',
      'weixin',
      true,
    );

    const groups = getAvailableGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].jid).toBe('wx:group');
  });

  it('marks registered groups correctly', () => {
    storeChatMetadata(
      'wx:reg',
      '2024-01-01T00:00:01.000Z',
      'Registered',
      'weixin',
      true,
    );
    storeChatMetadata(
      'wx:unreg',
      '2024-01-01T00:00:02.000Z',
      'Unregistered',
      'weixin',
      true,
    );

    _setRegisteredGroups({
      'wx:reg': {
        name: 'Registered',
        folder: 'registered',
        trigger: '@Andy',
        added_at: '2024-01-01T00:00:00.000Z',
      },
    });

    const groups = getAvailableGroups();
    const reg = groups.find((g) => g.jid === 'wx:reg');
    const unreg = groups.find((g) => g.jid === 'wx:unreg');

    expect(reg?.isRegistered).toBe(true);
    expect(unreg?.isRegistered).toBe(false);
  });

  it('returns groups ordered by most recent activity', () => {
    storeChatMetadata(
      'wx:old',
      '2024-01-01T00:00:01.000Z',
      'Old',
      'weixin',
      true,
    );
    storeChatMetadata(
      'wx:new',
      '2024-01-01T00:00:05.000Z',
      'New',
      'weixin',
      true,
    );
    storeChatMetadata(
      'wx:mid',
      '2024-01-01T00:00:03.000Z',
      'Mid',
      'weixin',
      true,
    );

    const groups = getAvailableGroups();
    expect(groups[0].jid).toBe('wx:new');
    expect(groups[1].jid).toBe('wx:mid');
    expect(groups[2].jid).toBe('wx:old');
  });

  it('excludes non-group chats regardless of JID format', () => {
    storeChatMetadata(
      'unknown-format-123',
      '2024-01-01T00:00:01.000Z',
      'Unknown',
    );
    storeChatMetadata(
      'custom:abc',
      '2024-01-01T00:00:02.000Z',
      'Custom DM',
      'custom',
      false,
    );
    storeChatMetadata(
      'wx:group',
      '2024-01-01T00:00:03.000Z',
      'Group',
      'weixin',
      true,
    );

    const groups = getAvailableGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].jid).toBe('wx:group');
  });

  it('returns empty array when no chats exist', () => {
    const groups = getAvailableGroups();
    expect(groups).toHaveLength(0);
  });
});

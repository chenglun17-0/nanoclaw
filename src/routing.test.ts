import { describe, it, expect, beforeEach } from 'vitest';

import { _initTestDatabase, storeChatMetadata } from './db.js';
import { getAvailableGroups, _setRegisteredGroups } from './index.js';

beforeEach(() => {
  _initTestDatabase();
  _setRegisteredGroups({});
});

// --- JID ownership patterns ---

describe('JID ownership patterns', () => {
  it('Feishu JID: starts with fs:', () => {
    const jid = 'fs:oc_12345678';
    expect(jid.startsWith('fs:')).toBe(true);
  });

  it('Non-Feishu JID should not start with fs:', () => {
    const jid = 'tg:12345678';
    expect(jid.startsWith('fs:')).toBe(false);
  });
});

// --- getAvailableGroups ---

describe('getAvailableGroups', () => {
  it('returns only groups, excludes DMs', () => {
    storeChatMetadata(
      'fs:group1',
      '2024-01-01T00:00:01.000Z',
      'Group 1',
      'feishu',
      true,
    );
    storeChatMetadata(
      'fs:dm1',
      '2024-01-01T00:00:02.000Z',
      'User DM',
      'feishu',
      false,
    );
    storeChatMetadata(
      'fs:group2',
      '2024-01-01T00:00:03.000Z',
      'Group 2',
      'feishu',
      true,
    );

    const groups = getAvailableGroups();
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.jid)).toContain('fs:group1');
    expect(groups.map((g) => g.jid)).toContain('fs:group2');
    expect(groups.map((g) => g.jid)).not.toContain('fs:dm1');
  });

  it('excludes __group_sync__ sentinel', () => {
    storeChatMetadata('__group_sync__', '2024-01-01T00:00:00.000Z');
    storeChatMetadata(
      'fs:group',
      '2024-01-01T00:00:01.000Z',
      'Group',
      'feishu',
      true,
    );

    const groups = getAvailableGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].jid).toBe('fs:group');
  });

  it('marks registered groups correctly', () => {
    storeChatMetadata(
      'fs:reg',
      '2024-01-01T00:00:01.000Z',
      'Registered',
      'feishu',
      true,
    );
    storeChatMetadata(
      'fs:unreg',
      '2024-01-01T00:00:02.000Z',
      'Unregistered',
      'feishu',
      true,
    );

    _setRegisteredGroups({
      'fs:reg': {
        name: 'Registered',
        folder: 'registered',
        trigger: '@Andy',
        added_at: '2024-01-01T00:00:00.000Z',
      },
    });

    const groups = getAvailableGroups();
    const reg = groups.find((g) => g.jid === 'fs:reg');
    const unreg = groups.find((g) => g.jid === 'fs:unreg');

    expect(reg?.isRegistered).toBe(true);
    expect(unreg?.isRegistered).toBe(false);
  });

  it('returns groups ordered by most recent activity', () => {
    storeChatMetadata(
      'fs:old',
      '2024-01-01T00:00:01.000Z',
      'Old',
      'feishu',
      true,
    );
    storeChatMetadata(
      'fs:new',
      '2024-01-01T00:00:05.000Z',
      'New',
      'feishu',
      true,
    );
    storeChatMetadata(
      'fs:mid',
      '2024-01-01T00:00:03.000Z',
      'Mid',
      'feishu',
      true,
    );

    const groups = getAvailableGroups();
    expect(groups[0].jid).toBe('fs:new');
    expect(groups[1].jid).toBe('fs:mid');
    expect(groups[2].jid).toBe('fs:old');
  });

  it('excludes non-group chats regardless of JID format', () => {
    storeChatMetadata('unknown-format-123', '2024-01-01T00:00:01.000Z', 'Unknown');
    storeChatMetadata(
      'custom:abc',
      '2024-01-01T00:00:02.000Z',
      'Custom DM',
      'custom',
      false,
    );
    storeChatMetadata(
      'fs:group',
      '2024-01-01T00:00:03.000Z',
      'Group',
      'feishu',
      true,
    );

    const groups = getAvailableGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].jid).toBe('fs:group');
  });

  it('returns empty array when no chats exist', () => {
    const groups = getAvailableGroups();
    expect(groups).toHaveLength(0);
  });
});

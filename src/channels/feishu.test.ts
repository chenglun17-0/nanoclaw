import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock config
vi.mock('../config.js', () => ({
  ASSISTANT_NAME: 'Andy',
  TRIGGER_PATTERN: /^@Andy\b/i,
}));

// Mock logger
vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const refs = vi.hoisted(() => ({
  wsClient: null as any,
  sdkClient: null as any,
  dispatcher: null as any,
}));

vi.mock('@larksuiteoapi/node-sdk', () => ({
  Domain: { Feishu: 'feishu' },
  LoggerLevel: { error: 'error' },
  Client: class MockClient {
    im = {
      v1: {
        message: {
          create: vi.fn().mockResolvedValue({}),
        },
      },
    };

    constructor(_opts: any) {
      refs.sdkClient = this;
    }
  },
  WSClient: class MockWSClient {
    start = vi.fn(async ({ eventDispatcher }: any) => {
      refs.dispatcher = eventDispatcher;
    });

    close = vi.fn();

    constructor(_opts: any) {
      refs.wsClient = this;
    }
  },
  EventDispatcher: class MockEventDispatcher {
    handles: Record<string, (...args: any[]) => any> = {};

    constructor(_opts: any) {}

    register(handles: Record<string, (...args: any[]) => any>) {
      this.handles = { ...this.handles, ...handles };
      return this;
    }
  },
}));

const readEnvFileMock = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    FEISHU_APP_ID: 'cli_xxx',
    FEISHU_APP_SECRET: 'sec_xxx',
  }),
);

vi.mock('../env.js', () => ({
  readEnvFile: readEnvFileMock,
}));

import { readEnvFile } from '../env.js';
import { FeishuChannel, FeishuChannelOpts } from './feishu.js';

function createTestOpts(
  overrides?: Partial<FeishuChannelOpts>,
): FeishuChannelOpts {
  return {
    onMessage: vi.fn(),
    onChatMetadata: vi.fn(),
    registeredGroups: vi.fn(() => ({
      'fs:oc_test_chat': {
        name: 'Test Chat',
        folder: 'test-chat',
        trigger: '@Andy',
        added_at: '2024-01-01T00:00:00.000Z',
      },
    })),
    ...overrides,
  };
}

function createMessageEvent(overrides?: {
  chat_id?: string;
  chat_type?: string;
  message_type?: string;
  content?: string;
  mentions?: Array<{ key: string; name: string }>;
  sender_type?: string;
  sender_user_id?: string;
}) {
  return {
    sender: {
      sender_type: overrides?.sender_type || 'user',
      sender_id: {
        user_id: overrides?.sender_user_id || 'ou_user_123',
      },
    },
    message: {
      message_id: 'om_123',
      create_time: '1704067200000',
      chat_id: overrides?.chat_id || 'oc_test_chat',
      chat_type: overrides?.chat_type || 'group',
      message_type: overrides?.message_type || 'text',
      content:
        overrides?.content ||
        JSON.stringify({ text: 'Hello from Feishu' }),
      mentions: overrides?.mentions,
    },
  };
}

async function triggerInbound(event: ReturnType<typeof createMessageEvent>) {
  const handler = refs.dispatcher?.handles?.['im.message.receive_v1'];
  expect(typeof handler).toBe('function');
  await handler(event);
}

describe('FeishuChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readEnvFileMock.mockReturnValue({
      FEISHU_APP_ID: 'cli_xxx',
      FEISHU_APP_SECRET: 'sec_xxx',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('connect() marks channel as connected and starts ws client', async () => {
    const channel = new FeishuChannel(createTestOpts());

    await channel.connect();

    expect(channel.isConnected()).toBe(true);
    expect(refs.wsClient.start).toHaveBeenCalledTimes(1);
  });

  it('throws when FEISHU_APP_ID/FEISHU_APP_SECRET are missing', () => {
    vi.mocked(readEnvFile).mockReturnValue({});

    expect(() => new FeishuChannel(createTestOpts())).toThrow(
      'FEISHU_APP_ID and FEISHU_APP_SECRET must be set in .env',
    );
  });

  it('owns fs: prefixed JIDs only', () => {
    const channel = new FeishuChannel(createTestOpts());

    expect(channel.ownsJid('fs:oc_test_chat')).toBe(true);
    expect(channel.ownsJid('tg:123')).toBe(false);
  });

  it('queues outgoing messages when disconnected and flushes after connect', async () => {
    const channel = new FeishuChannel(createTestOpts());

    await channel.sendMessage('fs:oc_test_chat', 'Queued');
    expect(refs.sdkClient.im.v1.message.create).not.toHaveBeenCalled();

    await channel.connect();

    expect(refs.sdkClient.im.v1.message.create).toHaveBeenCalledWith({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: 'oc_test_chat',
        msg_type: 'text',
        content: JSON.stringify({ text: 'Queued' }),
      },
    });
  });

  it('sendMessage() posts text message to Feishu chat API', async () => {
    const channel = new FeishuChannel(createTestOpts());
    await channel.connect();

    await channel.sendMessage('fs:oc_test_chat', 'Hello');

    expect(refs.sdkClient.im.v1.message.create).toHaveBeenCalledWith({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: 'oc_test_chat',
        msg_type: 'text',
        content: JSON.stringify({ text: 'Hello' }),
      },
    });
  });

  it('stores inbound message for registered chat', async () => {
    const opts = createTestOpts();
    const channel = new FeishuChannel(opts);
    await channel.connect();

    await triggerInbound(createMessageEvent());

    expect(opts.onChatMetadata).toHaveBeenCalledWith(
      'fs:oc_test_chat',
      expect.any(String),
      undefined,
      'feishu',
      true,
    );
    expect(opts.onMessage).toHaveBeenCalledWith(
      'fs:oc_test_chat',
      expect.objectContaining({
        id: 'om_123',
        chat_jid: 'fs:oc_test_chat',
        sender: 'ou_user_123',
        sender_name: 'ou_user_123',
        content: 'Hello from Feishu',
        is_from_me: false,
      }),
    );
  });

  it('only emits metadata for unregistered chat', async () => {
    const opts = createTestOpts({
      registeredGroups: vi.fn(() => ({})),
    });
    const channel = new FeishuChannel(opts);
    await channel.connect();

    await triggerInbound(createMessageEvent({ chat_id: 'oc_unknown' }));

    expect(opts.onChatMetadata).toHaveBeenCalledWith(
      'fs:oc_unknown',
      expect.any(String),
      undefined,
      'feishu',
      true,
    );
    expect(opts.onMessage).not.toHaveBeenCalled();
  });

  it('normalizes assistant mention into trigger prefix', async () => {
    const opts = createTestOpts();
    const channel = new FeishuChannel(opts);
    await channel.connect();

    await triggerInbound(
      createMessageEvent({
        content: JSON.stringify({ text: '@_user_1 请帮我总结一下' }),
        mentions: [{ key: '@_user_1', name: 'Andy Bot' }],
      }),
    );

    expect(opts.onMessage).toHaveBeenCalledWith(
      'fs:oc_test_chat',
      expect.objectContaining({
        content: '@Andy Bot 请帮我总结一下',
      }),
    );
  });

  it('retries queued messages after temporary send failure', async () => {
    vi.useFakeTimers();

    const channel = new FeishuChannel(createTestOpts());
    await channel.connect();

    refs.sdkClient.im.v1.message.create
      .mockRejectedValueOnce(new Error('temporary error'))
      .mockResolvedValue(undefined);

    await channel.sendMessage('fs:oc_test_chat', 'Retry me');

    expect(refs.sdkClient.im.v1.message.create).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);

    expect(refs.sdkClient.im.v1.message.create).toHaveBeenCalledTimes(2);
    expect(refs.sdkClient.im.v1.message.create).toHaveBeenLastCalledWith({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: 'oc_test_chat',
        msg_type: 'text',
        content: JSON.stringify({ text: 'Retry me' }),
      },
    });

    await channel.disconnect();
  });
});

import * as lark from '@larksuiteoapi/node-sdk';

import { ASSISTANT_NAME, TRIGGER_PATTERN } from '../config.js';
import { readEnvFile } from '../env.js';
import { logger } from '../logger.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
} from '../types.js';

export interface FeishuChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

type FeishuMessageEvent = Parameters<
  NonNullable<lark.EventHandles['im.message.receive_v1']>
>[0];

function normalizeText(content: string): string {
  return content.replace(/\s+/g, '').toLowerCase();
}

function toIsoTimestamp(raw: string | undefined): string {
  const value = Number(raw);
  if (!Number.isFinite(value)) return new Date().toISOString();

  const millis = value > 1e12 ? value : value * 1000;
  return new Date(millis).toISOString();
}

function parseMessageContent(messageType: string, content: string): string {
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    return content;
  }

  if (messageType === 'text' && typeof parsed?.text === 'string') {
    return parsed.text;
  }

  if (typeof parsed?.text === 'string' && parsed.text.trim()) {
    return `[${messageType}] ${parsed.text}`;
  }

  return `[${messageType}]`;
}

function replaceMentionKeys(
  text: string,
  mentions: Array<{ key: string; name: string }> | undefined,
): string {
  if (!mentions || mentions.length === 0) return text;

  let normalized = text;
  for (const mention of mentions) {
    if (!mention.key) continue;
    const mentionLabel = mention.name
      ? `@${mention.name}`
      : `@${ASSISTANT_NAME}`;
    normalized = normalized.split(mention.key).join(mentionLabel);
  }

  return normalized;
}

export class FeishuChannel implements Channel {
  name = 'feishu';

  private client: lark.Client;
  private wsClient: lark.WSClient;
  private connected = false;
  private outgoingQueue: Array<{ jid: string; text: string }> = [];
  private flushing = false;
  private flushRetryTimer: ReturnType<typeof setTimeout> | null = null;

  private opts: FeishuChannelOpts;

  constructor(opts: FeishuChannelOpts) {
    this.opts = opts;

    const env = readEnvFile(['FEISHU_APP_ID', 'FEISHU_APP_SECRET']);
    const appId = env.FEISHU_APP_ID;
    const appSecret = env.FEISHU_APP_SECRET;

    if (!appId || !appSecret) {
      throw new Error('FEISHU_APP_ID and FEISHU_APP_SECRET must be set in .env');
    }

    const baseConfig = {
      appId,
      appSecret,
      domain: lark.Domain.Feishu,
      loggerLevel: lark.LoggerLevel.error,
    };

    this.client = new lark.Client(baseConfig);
    this.wsClient = new lark.WSClient({
      ...baseConfig,
      autoReconnect: true,
    });
  }

  async connect(): Promise<void> {
    const eventDispatcher = new lark.EventDispatcher({
      loggerLevel: lark.LoggerLevel.error,
    }).register({
      'im.message.receive_v1': async (data: FeishuMessageEvent) => {
        await this.handleInboundMessage(data);
      },
    });

    await this.wsClient.start({ eventDispatcher });
    this.connected = true;
    logger.info('Connected to Feishu');

    await this.flushOutgoingQueue();
    this.scheduleFlushRetry();
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    const chatId = jid.replace(/^fs:/, '');

    if (!this.connected) {
      this.enqueueOutgoing(jid, text);
      logger.info(
        { jid, queueSize: this.outgoingQueue.length },
        'Feishu disconnected, message queued',
      );
      return;
    }

    try {
      await this.client.im.v1.message.create({
        params: {
          receive_id_type: 'chat_id',
        },
        data: {
          receive_id: chatId,
          msg_type: 'text',
          content: JSON.stringify({ text }),
        },
      });

      logger.info({ jid, length: text.length }, 'Feishu message sent');
    } catch (err) {
      this.enqueueOutgoing(jid, text);
      logger.warn(
        { jid, err, queueSize: this.outgoingQueue.length },
        'Failed to send Feishu message, queued',
      );
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('fs:');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.flushRetryTimer) {
      clearTimeout(this.flushRetryTimer);
      this.flushRetryTimer = null;
    }
    this.wsClient.close({ force: true });
  }

  // Feishu bot APIs currently don't expose a typing indicator endpoint.
  async setTyping(_jid: string, _isTyping: boolean): Promise<void> {
    // no-op
  }

  async syncGroupMetadata(_force: boolean): Promise<void> {
    // For Feishu, group metadata is discovered from inbound event callbacks.
    logger.info('Feishu syncGroupMetadata is a no-op (event-driven discovery)');
    return Promise.resolve();
  }

  private async handleInboundMessage(data: FeishuMessageEvent): Promise<void> {
    const message = data.message;
    if (!message?.chat_id || !message?.message_id || !message?.content) return;

    const chatJid = `fs:${message.chat_id}`;
    const timestamp = toIsoTimestamp(message.create_time);
    const isGroup = message.chat_type !== 'p2p';

    this.opts.onChatMetadata(chatJid, timestamp, undefined, 'feishu', isGroup);

    const groups = this.opts.registeredGroups();
    if (!groups[chatJid]) return;

    const isBotMessage = data.sender?.sender_type !== 'user';
    const senderId =
      data.sender?.sender_id?.user_id ||
      data.sender?.sender_id?.open_id ||
      data.sender?.sender_id?.union_id ||
      '';

    const senderName = isBotMessage ? ASSISTANT_NAME : senderId || 'unknown';

    const mentionList = (message.mentions || []).map((m) => ({
      key: m.key,
      name: m.name,
    }));

    let content = parseMessageContent(message.message_type, message.content);
    content = replaceMentionKeys(content, mentionList);

    const mentionedAssistant = mentionList.some(
      (m) =>
        m.name &&
        normalizeText(m.name).includes(normalizeText(ASSISTANT_NAME)),
    );

    if (mentionedAssistant && !TRIGGER_PATTERN.test(content)) {
      content = `@${ASSISTANT_NAME} ${content}`;
    }

    if (!content.trim()) return;

    this.opts.onMessage(chatJid, {
      id: message.message_id,
      chat_jid: chatJid,
      sender: senderId || 'unknown',
      sender_name: senderName,
      content,
      timestamp,
      is_from_me: isBotMessage,
      is_bot_message: isBotMessage,
    });
  }

  private async flushOutgoingQueue(): Promise<void> {
    if (this.flushing || this.outgoingQueue.length === 0) return;
    this.flushing = true;

    try {
      logger.info(
        { count: this.outgoingQueue.length },
        'Flushing Feishu outgoing queue',
      );

      while (this.outgoingQueue.length > 0) {
        const item = this.outgoingQueue[0];
        const chatId = item.jid.replace(/^fs:/, '');

        try {
          await this.client.im.v1.message.create({
            params: {
              receive_id_type: 'chat_id',
            },
            data: {
              receive_id: chatId,
              msg_type: 'text',
              content: JSON.stringify({ text: item.text }),
            },
          });
        } catch (err) {
          logger.warn(
            { jid: item.jid, err, queueSize: this.outgoingQueue.length },
            'Failed to flush queued Feishu message, will retry',
          );
          break;
        }
        this.outgoingQueue.shift();

        logger.info(
          { jid: item.jid, length: item.text.length },
          'Queued Feishu message sent',
        );
      }
    } finally {
      this.flushing = false;
      this.scheduleFlushRetry();
    }
  }

  private enqueueOutgoing(jid: string, text: string): void {
    this.outgoingQueue.push({ jid, text });
    this.scheduleFlushRetry();
  }

  private scheduleFlushRetry(): void {
    if (this.flushRetryTimer || this.outgoingQueue.length === 0) return;

    this.flushRetryTimer = setTimeout(() => {
      this.flushRetryTimer = null;
      if (!this.connected || this.outgoingQueue.length === 0) {
        this.scheduleFlushRetry();
        return;
      }

      this.flushOutgoingQueue().catch((err) => {
        logger.warn({ err }, 'Feishu queued message retry failed');
        this.scheduleFlushRetry();
      });
    }, 5000);
    this.flushRetryTimer.unref?.();
  }
}

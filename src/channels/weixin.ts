import { readEnvFile } from '../env.js';
import { logger } from '../logger.js';
import { randomWechatUin } from '../utils.js';
import { Channel, OnChatMetadata, OnInboundMessage } from '../types.js';

export interface WeixinChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
}

interface WeixinMessage {
  from_user_id: string;
  message_id: string;
  create_time_ms: number;
  item_list?: Array<{
    type: number;
    text_item?: { text: string };
  }>;
  context_token?: string;
}

interface WeixinGetUpdatesResp {
  ret: number;
  msgs?: WeixinMessage[];
  get_updates_buf?: string;
}

const MESSAGE_ITEM_TYPE_TEXT = 1;

function extractTextFromMessage(msg: WeixinMessage): string {
  if (!msg.item_list?.length) return '';
  for (const item of msg.item_list) {
    if (item.type === MESSAGE_ITEM_TYPE_TEXT && item.text_item?.text) {
      return item.text_item.text;
    }
  }
  return '';
}

export class WeixinChannel implements Channel {
  name = 'weixin';

  private baseUrl: string;
  private token: string;
  private connected = false;
  private polling = false;
  private pollAbort: AbortController | null = null;
  private contextTokens = new Map<string, string>();
  private typingTickets = new Map<string, string>();
  private updatesBuf = '';

  private opts: WeixinChannelOpts;

  constructor(opts: WeixinChannelOpts) {
    this.opts = opts;

    const env = readEnvFile(['WEIXIN_BASE_URL', 'WEIXIN_TOKEN']);
    this.baseUrl = (
      env.WEIXIN_BASE_URL || 'https://ilinkai.weixin.qq.com'
    ).replace(/\/$/, '');
    this.token = env.WEIXIN_TOKEN || '';

    if (!this.token) {
      throw new Error('WEIXIN_TOKEN must be set in .env');
    }
  }

  async connect(): Promise<void> {
    this.connected = true;
    logger.info('Connected to Weixin');
    this.startPolling();
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    const userId = jid.replace(/^wx:/, '');

    if (!this.connected) {
      logger.warn({ jid }, 'Weixin disconnected, message dropped');
      return;
    }

    const contextToken = this.contextTokens.get(userId) ?? '';
    const body = JSON.stringify({
      msg: {
        to_user_id: userId,
        client_id: `nanoclaw-${Date.now()}`,
        message_type: 2,
        message_state: 2,
        item_list: [{ type: MESSAGE_ITEM_TYPE_TEXT, text_item: { text } }],
        context_token: contextToken,
      },
      base_info: { channel_version: '1.0.0' },
    });

    try {
      const response = await fetch(`${this.baseUrl}/ilink/bot/sendmessage`, {
        method: 'POST',
        headers: this.buildHeaders(body),
        body,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      logger.info({ jid, length: text.length }, 'Weixin message sent');
    } catch (err) {
      logger.warn({ jid, err }, 'Failed to send Weixin message');
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('wx:');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.stopPolling();
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    const userId = jid.replace(/^wx:/, '');
    let ticket = this.typingTickets.get(userId);

    if (!ticket) {
      await this.fetchTypingTicket(userId);
      ticket = this.typingTickets.get(userId);
      if (!ticket) return;
    }

    try {
      const body = JSON.stringify({
        ilink_user_id: userId,
        typing_ticket: ticket,
        status: isTyping ? 1 : 2,
        base_info: { channel_version: '1.0.0' },
      });

      await fetch(`${this.baseUrl}/ilink/bot/sendtyping`, {
        method: 'POST',
        headers: this.buildHeaders(body),
        body,
      });

      logger.debug({ jid, isTyping }, 'Weixin typing sent');
    } catch (err) {
      logger.warn({ jid, err }, 'Failed to send Weixin typing');
    }
  }

  async syncGroupMetadata(_force: boolean): Promise<void> {
    logger.info('Weixin syncGroupMetadata is a no-op');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildHeaders(body: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(body, 'utf-8')),
      Authorization: `Bearer ${this.token}`,
      AuthorizationType: 'ilink_bot_token',
      'X-WECHAT-UIN': randomWechatUin(),
    };
  }

  private async fetchTypingTicket(userId: string): Promise<void> {
    try {
      const body = JSON.stringify({
        ilink_user_id: userId,
        base_info: { channel_version: '1.0.0' },
      });

      const response = await fetch(`${this.baseUrl}/ilink/bot/getconfig`, {
        method: 'POST',
        headers: this.buildHeaders(body),
        body,
      });

      if (!response.ok) return;

      const data = (await response.json()) as { typing_ticket?: string };
      if (data.typing_ticket) {
        this.typingTickets.set(userId, data.typing_ticket);
        logger.debug({ userId }, 'Weixin typing_ticket cached');
      }
    } catch (err) {
      logger.debug({ userId, err }, 'Failed to fetch typing_ticket');
    }
  }

  private startPolling(): void {
    if (this.polling) return;
    this.polling = true;
    this.pollAbort = new AbortController();
    this.pollLoop();
  }

  private stopPolling(): void {
    this.polling = false;
    this.pollAbort?.abort();
    this.pollAbort = null;
  }

  private async pollLoop(): Promise<void> {
    while (this.polling) {
      try {
        await this.fetchUpdates();
      } catch (err) {
        logger.warn({ err }, 'Weixin poll error');
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  private async fetchUpdates(): Promise<void> {
    try {
      const body = JSON.stringify({
        get_updates_buf: this.updatesBuf,
        base_info: { channel_version: '1.0.0' },
      });

      const response = await fetch(`${this.baseUrl}/ilink/bot/getupdates`, {
        method: 'POST',
        headers: this.buildHeaders(body),
        body,
        signal: this.pollAbort?.signal,
      });

      if (!response.ok) return;

      const data = (await response.json()) as WeixinGetUpdatesResp;
      if (data.get_updates_buf) {
        this.updatesBuf = data.get_updates_buf;
      }
      if (!data.msgs?.length) return;

      for (const msg of data.msgs) {
        await this.handleInboundMessage(msg);
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== 'AbortError') {
        throw err;
      }
    }
  }

  private async handleInboundMessage(msg: WeixinMessage): Promise<void> {
    const userId = msg.from_user_id;
    if (!userId) return;

    const chatJid = `wx:${userId}`;
    const timestamp = new Date(msg.create_time_ms).toISOString();

    if (msg.context_token) {
      this.contextTokens.set(userId, msg.context_token);
      this.fetchTypingTicket(userId);
    }

    this.opts.onChatMetadata(chatJid, timestamp, undefined, 'weixin', false);

    const content = extractTextFromMessage(msg);
    if (!content.trim()) return;

    this.opts.onMessage(chatJid, {
      id: msg.message_id,
      chat_jid: chatJid,
      sender: userId,
      sender_name: userId,
      content,
      timestamp,
      is_from_me: false,
      is_bot_message: false,
    });
  }
}

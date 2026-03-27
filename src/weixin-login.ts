import fs from 'fs';
import path from 'path';
import qrcode from 'qrcode-terminal';
import { logger } from './logger.js';
import { randomWechatUin } from './utils.js';

const WEIXIN_API_BASE = 'https://ilinkai.weixin.qq.com';
const DEFAULT_BOT_TYPE = '3';
const QR_POLL_TIMEOUT_MS = 35_000;
const MAX_QR_REFRESH = 3;

interface QrCodeResponse {
  qrcode: string;
  qrcode_img_content: string;
}

interface QrStatusResponse {
  status: 'wait' | 'scaned' | 'confirmed' | 'expired';
  bot_token?: string;
  ilink_bot_id?: string;
  baseurl?: string;
  ilink_user_id?: string;
}

async function fetchQrCode(apiBase: string): Promise<QrCodeResponse> {
  const base = apiBase.endsWith('/') ? apiBase : `${apiBase}/`;
  const url = `${base}ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(DEFAULT_BOT_TYPE)}`;

  logger.info({ url }, 'Fetching Weixin QR code');

  const response = await fetch(url, {
    headers: { 'X-WECHAT-UIN': randomWechatUin() },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable)');
    throw new Error(`QR fetch failed: ${response.status} ${response.statusText} body=${body}`);
  }

  return (await response.json()) as QrCodeResponse;
}

async function pollQrStatus(apiBase: string, qrcode: string): Promise<QrStatusResponse> {
  const base = apiBase.endsWith('/') ? apiBase : `${apiBase}/`;
  const url = `${base}ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QR_POLL_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        'iLink-App-ClientVersion': '1',
        'X-WECHAT-UIN': randomWechatUin(),
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      const body = await response.text().catch(() => '(unreadable)');
      throw new Error(`QR status poll failed: ${response.status} body=${body}`);
    }

    return (await response.json()) as QrStatusResponse;
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      return { status: 'wait' };
    }
    throw err;
  }
}

async function waitForLogin(
  apiBase: string,
  initialQrToken: string,
  timeoutMs = 480_000,
): Promise<{ token: string; botId: string; baseUrl?: string; userId?: string }> {
  const deadline = Date.now() + timeoutMs;
  let scannedPrinted = false;
  let currentQrToken = initialQrToken;
  let refreshCount = 0;

  while (Date.now() < deadline) {
    const data = await pollQrStatus(apiBase, currentQrToken);

    switch (data.status) {
      case 'wait':
        process.stdout.write('.');
        break;

      case 'scaned':
        if (!scannedPrinted) {
          process.stdout.write('\n👀 已扫码，在微信继续操作...\n');
          scannedPrinted = true;
        }
        break;

      case 'expired':
        refreshCount++;
        if (refreshCount > MAX_QR_REFRESH) {
          throw new Error(`QR code expired ${MAX_QR_REFRESH} times, please retry`);
        }
        process.stdout.write(`\n⏳ 二维码已过期，正在刷新...(${refreshCount}/${MAX_QR_REFRESH})\n`);
        const newQr = await fetchQrCode(apiBase);
        currentQrToken = newQr.qrcode;
        scannedPrinted = false;
        process.stdout.write('🔄 新二维码已生成，请重新扫描\n\n');
        qrcode.generate(newQr.qrcode_img_content, { small: true });
        process.stdout.write(`\n或打开链接：${newQr.qrcode_img_content}\n\n`);
        break;

      case 'confirmed':
        if (!data.bot_token || !data.ilink_bot_id) {
          throw new Error('Login confirmed but server did not return bot_token / ilink_bot_id');
        }
        return {
          token: data.bot_token,
          botId: data.ilink_bot_id,
          baseUrl: data.baseurl,
          userId: data.ilink_user_id,
        };
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error('Login timeout');
}

export async function loginWeixin(): Promise<{ token: string; botId: string }> {
  console.log('\n正在启动微信扫码登录...\n');

  const qrResponse = await fetchQrCode(WEIXIN_API_BASE);
  const { qrcode: qrToken, qrcode_img_content: qrcodeUrl } = qrResponse;

  console.log('请使用微信扫描以下二维码：\n');
  qrcode.generate(qrcodeUrl, { small: true });
  console.log(`\n或打开链接：${qrcodeUrl}\n`);
  console.log('等待扫码...\n');

  const result = await waitForLogin(WEIXIN_API_BASE, qrToken);

  console.log('\n✅ 登录成功！\n');
  console.log(`Bot ID: ${result.botId}`);
  console.log(`Token: ${result.token.substring(0, 20)}...\n`);

  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf-8');
  }

  if (envContent.includes('WEIXIN_TOKEN=')) {
    envContent = envContent.replace(/WEIXIN_TOKEN=.*/g, `WEIXIN_TOKEN=${result.token}`);
  } else {
    envContent += `\nWEIXIN_TOKEN=${result.token}\n`;
  }

  const baseUrl = result.baseUrl || WEIXIN_API_BASE;
  if (envContent.includes('WEIXIN_BASE_URL=')) {
    envContent = envContent.replace(/WEIXIN_BASE_URL=.*/g, `WEIXIN_BASE_URL=${baseUrl}`);
  } else {
    envContent += `WEIXIN_BASE_URL=${baseUrl}\n`;
  }

  fs.writeFileSync(envPath, envContent);
  console.log('✅ Token 已自动保存到 .env 文件\n');

  return { token: result.token, botId: result.botId };
}

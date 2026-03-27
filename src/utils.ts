import crypto from 'crypto';

/** Generate a random WeChat UIN (base64-encoded uint32). */
export function randomWechatUin(): string {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), 'utf-8').toString('base64');
}

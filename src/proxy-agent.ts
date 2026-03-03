import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

export type SupportedProxyAgent = SocksProxyAgent | HttpsProxyAgent<string>;

export function getProxyUrlFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return (
    env.all_proxy ||
    env.ALL_PROXY ||
    env.https_proxy ||
    env.HTTPS_PROXY ||
    env.http_proxy ||
    env.HTTP_PROXY
  );
}

export function createProxyAgent(
  proxyUrl?: string,
): SupportedProxyAgent | undefined {
  if (!proxyUrl) return undefined;
  try {
    if (proxyUrl.startsWith('socks')) return new SocksProxyAgent(proxyUrl);
    return new HttpsProxyAgent(proxyUrl);
  } catch {
    return undefined;
  }
}

export function redactProxyUrl(proxyUrl?: string): string | undefined {
  if (!proxyUrl) return undefined;

  try {
    const parsed = new URL(proxyUrl);
    if (parsed.username || parsed.password) {
      parsed.username = parsed.username ? '***' : '';
      parsed.password = parsed.password ? '***' : '';
    }
    return parsed.toString();
  } catch {
    return '<invalid-proxy-url>';
  }
}

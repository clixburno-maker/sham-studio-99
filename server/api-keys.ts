import { storage } from "./storage";

const keyCache = new Map<string, { key: string; timestamp: number }>();
const CACHE_TTL_MS = 30_000;

export async function getApiKey(serviceName: string): Promise<string | undefined> {
  const cached = keyCache.get(serviceName);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.key;
  }

  try {
    const setting = await storage.getApiSetting(serviceName);
    if (setting && setting.apiKey) {
      keyCache.set(serviceName, { key: setting.apiKey, timestamp: Date.now() });
      return setting.apiKey;
    }
  } catch {}

  const envMap: Record<string, string | undefined> = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    evolink: process.env.NANOBANANA_API_KEY,
    elevenlabs: process.env.ELEVENLABS_API_KEY,
  };

  return envMap[serviceName];
}

export function clearKeyCache(serviceName?: string) {
  if (serviceName) {
    keyCache.delete(serviceName);
  } else {
    keyCache.clear();
  }
}

const STORAGE_KEY = "yt_video_prod_api_keys";

export interface ApiKeys {
  anthropic: string;
  elevenlabs: string;
  evolink: string;
}

export function getApiKeys(): ApiKeys {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        anthropic: parsed.anthropic || "",
        elevenlabs: parsed.elevenlabs || "",
        evolink: parsed.evolink || "",
      };
    }
  } catch {}
  return { anthropic: "", elevenlabs: "", evolink: "" };
}

export function saveApiKeys(keys: ApiKeys): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

export function clearApiKeys(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasAnyKeys(): boolean {
  const keys = getApiKeys();
  return !!(keys.anthropic || keys.elevenlabs || keys.evolink);
}

export function getApiHeaders(): Record<string, string> {
  const keys = getApiKeys();
  const headers: Record<string, string> = {};
  if (keys.anthropic) headers["x-user-anthropic-key"] = keys.anthropic;
  if (keys.elevenlabs) headers["x-user-elevenlabs-key"] = keys.elevenlabs;
  if (keys.evolink) headers["x-user-evolink-key"] = keys.evolink;
  return headers;
}

export function maskKey(key: string): string {
  if (!key || key.length < 8) return key ? "••••••••" : "";
  return key.slice(0, 4) + "••••••••" + key.slice(-4);
}

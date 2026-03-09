import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Settings2,
  Key,
  Eye,
  EyeOff,
  Check,
  X,
  Loader2,
  Trash2,
  Shield,
  Sparkles,
  Image,
  Mic,
} from "lucide-react";

interface ApiKeyInfo {
  serviceName: string;
  hasKey: boolean;
  maskedKey: string | null;
  updatedAt: string | null;
  source?: string;
}

const SERVICE_CONFIG: Record<string, { label: string; description: string; icon: React.ReactNode; placeholder: string; color: string }> = {
  anthropic: {
    label: "Anthropic (Claude)",
    description: "Powers AI script writing, story analysis, and prompt generation",
    icon: <Sparkles className="w-5 h-5" />,
    placeholder: "sk-ant-api03-...",
    color: "text-purple-400",
  },
  evolink: {
    label: "EvoLink.AI",
    description: "Generates 4K photorealistic images and cinematic video clips",
    icon: <Image className="w-5 h-5" />,
    placeholder: "evl-...",
    color: "text-sky-400",
  },
  elevenlabs: {
    label: "ElevenLabs",
    description: "Creates AI voiceovers with natural-sounding speech",
    icon: <Mic className="w-5 h-5" />,
    placeholder: "Your ElevenLabs API key",
    color: "text-emerald-400",
  },
};

function ApiKeyCard({ info, onSave, onDelete, onTest }: {
  info: ApiKeyInfo;
  onSave: (serviceName: string, apiKey: string) => Promise<void>;
  onDelete: (serviceName: string) => Promise<void>;
  onTest: (serviceName: string, apiKey: string) => Promise<{ valid: boolean; message: string }>;
}) {
  const config = SERVICE_CONFIG[info.serviceName];
  const [inputKey, setInputKey] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; message: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (!config) return null;

  const handleSave = async () => {
    if (!inputKey.trim()) return;
    setSaving(true);
    setTestResult(null);
    try {
      await onSave(info.serviceName, inputKey.trim());
      setInputKey("");
      setShowInput(false);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    const keyToTest = inputKey.trim() || "";
    if (!keyToTest) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await onTest(info.serviceName, keyToTest);
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (info.source === "environment") return;
    setDeleting(true);
    try {
      await onDelete(info.serviceName);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="glass-card rounded-2xl overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center ring-1 ring-white/10 ${config.color}`}>
              {config.icon}
            </div>
            <div>
              <h3 className="font-semibold text-sm">{config.label}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{config.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {info.hasKey ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium ring-1 ring-emerald-500/20">
                <Check className="w-3 h-3" />
                {info.source === "environment" ? "Environment" : "Custom"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium ring-1 ring-red-500/20">
                <X className="w-3 h-3" />
                Not Set
              </span>
            )}
          </div>
        </div>

        {info.hasKey && info.maskedKey && (
          <div className="mt-3 flex items-center gap-2">
            <code className="text-xs font-mono bg-white/5 px-3 py-1.5 rounded-lg ring-1 ring-white/10 flex-1 truncate">
              {showKey ? info.maskedKey : "••••••••••••••••"}
            </code>
            <button
              onClick={() => setShowKey(!showKey)}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
              title={showKey ? "Hide" : "Show"}
            >
              {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            {info.source !== "environment" && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors text-muted-foreground hover:text-red-400"
                title="Remove custom key (revert to environment)"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        )}

        {info.source === "environment" && info.hasKey && (
          <p className="text-[11px] text-muted-foreground mt-2">
            Using environment variable. Add a custom key below to override.
          </p>
        )}

        <div className="mt-3 pt-3 border-t border-white/5">
          {!showInput ? (
            <button
              onClick={() => setShowInput(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold ghost-btn transition-all duration-200 active:scale-[0.98]"
            >
              <Key className="w-3.5 h-3.5" />
              {info.hasKey ? "Change API Key" : "Add API Key"}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <input
                  type="password"
                  value={inputKey}
                  onChange={(e) => { setInputKey(e.target.value); setTestResult(null); }}
                  placeholder={config.placeholder}
                  className="glass-input w-full h-10 text-xs rounded-xl px-3 pr-20 focus:outline-none font-mono"
                  autoFocus
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleSave}
                  disabled={!inputKey.trim() || saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold gradient-btn text-white border-0 transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save Key
                </button>
                <button
                  onClick={handleTest}
                  disabled={!inputKey.trim() || testing}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold ghost-btn transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
                >
                  {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
                  Test Key
                </button>
                <button
                  onClick={() => { setShowInput(false); setInputKey(""); setTestResult(null); }}
                  className="px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
              {testResult && (
                <div className={`text-xs px-3 py-2 rounded-lg ${testResult.valid ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20" : "bg-red-500/10 text-red-400 ring-1 ring-red-500/20"}`}>
                  {testResult.valid ? <Check className="w-3 h-3 inline mr-1.5" /> : <X className="w-3 h-3 inline mr-1.5" />}
                  {testResult.message}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/api-keys");
      if (res.ok) {
        setApiKeys(await res.json());
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleSave = async (serviceName: string, apiKey: string) => {
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceName, apiKey }),
      });
      if (res.ok) {
        toast({ title: "API key saved", description: `${SERVICE_CONFIG[serviceName]?.label} key updated successfully.` });
        await fetchKeys();
      } else {
        const err = await res.json();
        toast({ title: "Error", description: err.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (serviceName: string) => {
    try {
      const res = await fetch(`/api/settings/api-keys/${serviceName}`, { method: "DELETE" });
      if (res.ok) {
        toast({ title: "Custom key removed", description: `Reverted to environment variable for ${SERVICE_CONFIG[serviceName]?.label}.` });
        await fetchKeys();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleTest = async (serviceName: string, apiKey: string): Promise<{ valid: boolean; message: string }> => {
    try {
      const res = await fetch("/api/settings/api-keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceName, apiKey }),
      });
      if (res.ok) {
        return await res.json();
      }
      return { valid: false, message: "Could not verify API key" };
    } catch {
      return { valid: false, message: "Connection error" };
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl gradient-btn flex items-center justify-center shadow-lg">
            <Settings2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">API Settings</h1>
            <p className="text-sm text-muted-foreground">Manage your API keys for all connected services</p>
          </div>
        </div>
      </div>

      <div className="mb-6 p-4 rounded-xl bg-amber-500/5 ring-1 ring-amber-500/15">
        <p className="text-xs text-amber-400 leading-relaxed">
          <Shield className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
          Custom API keys override environment variables and take effect immediately. Your keys are stored securely in the database and never exposed in full through the API.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {apiKeys.map(info => (
            <ApiKeyCard
              key={info.serviceName}
              info={info}
              onSave={handleSave}
              onDelete={handleDelete}
              onTest={handleTest}
            />
          ))}
        </div>
      )}
    </div>
  );
}

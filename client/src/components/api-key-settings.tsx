import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Eye, EyeOff, Trash2, Check } from "lucide-react";
import { getApiKeys, saveApiKeys, maskKey, type ApiKeys } from "@/lib/api-keys";
import { useToast } from "@/hooks/use-toast";

export function ApiKeySettings() {
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState<ApiKeys>({ anthropic: "", elevenlabs: "", evolink: "" });
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setKeys(getApiKeys());
      setEditing({});
      setEditValues({});
      setShowKeys({});
    }
  }, [open]);

  const keyConfigs = [
    {
      id: "anthropic" as const,
      label: "Anthropic (Claude)",
      placeholder: "sk-ant-...",
      description: "Used for script analysis, prompt engineering, and AI writing",
    },
    {
      id: "elevenlabs" as const,
      label: "ElevenLabs",
      placeholder: "xi-...",
      description: "Used for AI voiceover generation",
    },
    {
      id: "evolink" as const,
      label: "EvoLink / NanoBanana",
      placeholder: "Your EvoLink API key",
      description: "Used for image and video generation",
    },
  ];

  const handleSave = (keyId: keyof ApiKeys) => {
    const value = editValues[keyId]?.trim() || "";
    const newKeys = { ...keys, [keyId]: value };
    saveApiKeys(newKeys);
    setKeys(newKeys);
    setEditing({ ...editing, [keyId]: false });
    setEditValues({ ...editValues, [keyId]: "" });
    toast({ title: value ? "API key saved" : "API key removed" });
  };

  const handleClear = (keyId: keyof ApiKeys) => {
    const newKeys = { ...keys, [keyId]: "" };
    saveApiKeys(newKeys);
    setKeys(newKeys);
    setEditing({ ...editing, [keyId]: false });
    toast({ title: "API key removed" });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="ios-btn ios-btn-secondary">
          <Settings className="w-4 h-4" />
          API Keys
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>API Key Settings</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2 mb-4">
          Add your own API keys to use this tool with your accounts. Keys are stored locally in your browser.
        </p>
        <div className="space-y-5">
          {keyConfigs.map((config) => {
            const currentKey = keys[config.id];
            const isEditing = editing[config.id];

            return (
              <div key={config.id} className="space-y-1.5">
                <Label className="text-sm font-medium">{config.label}</Label>
                <p className="text-xs text-muted-foreground">{config.description}</p>

                {isEditing ? (
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder={config.placeholder}
                      value={editValues[config.id] || ""}
                      onChange={(e) => setEditValues({ ...editValues, [config.id]: e.target.value })}
                      className="font-mono text-xs"
                      autoFocus
                    />
                    <Button size="sm" variant="outline" onClick={() => handleSave(config.id)}>
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing({ ...editing, [config.id]: false })}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : currentKey ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 font-mono text-xs bg-muted px-3 py-2 rounded-md border">
                      {showKeys[config.id] ? currentKey : maskKey(currentKey)}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowKeys({ ...showKeys, [config.id]: !showKeys[config.id] })}
                    >
                      {showKeys[config.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing({ ...editing, [config.id]: true });
                        setEditValues({ ...editValues, [config.id]: currentKey });
                      }}
                    >
                      Change
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleClear(config.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing({ ...editing, [config.id]: true })}
                    className="w-full justify-start text-muted-foreground"
                  >
                    + Add {config.label} key
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft,
  Mic,
  Play,
  Pause,
  Check,
  Loader2,
  ChevronDown,
  Plus,
  RotateCcw,
  Download,
  Volume2,
  Clock,
  Trash2,
  X,
} from "lucide-react";
import { Link } from "wouter";

interface Voice {
  voice_id: string;
  name: string;
  category: string;
  description: string;
  customId?: string;
}

export default function VoiceoverPage() {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [selectedVoiceId, setSelectedVoiceId] = useState("Brian");
  const [showVoiceDropdown, setShowVoiceDropdown] = useState(false);
  const [voiceoverUrl, setVoiceoverUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [showAddVoice, setShowAddVoice] = useState(false);
  const [newVoiceName, setNewVoiceName] = useState("");
  const [newVoiceId, setNewVoiceId] = useState("");
  const [newVoiceDesc, setNewVoiceDesc] = useState("");

  const { data: voices } = useQuery<Voice[]>({
    queryKey: ["/api/voices"],
  });

  const addVoiceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/voices/custom", {
        name: newVoiceName.trim(),
        voiceId: newVoiceId.trim(),
        description: newVoiceDesc.trim() || null,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/voices"] });
      setSelectedVoiceId(data.voiceId);
      setNewVoiceName("");
      setNewVoiceId("");
      setNewVoiceDesc("");
      setShowAddVoice(false);
      toast({ title: "Voice added", description: `"${data.name}" is now available in your voice list` });
    },
    onError: (err: any) => {
      toast({ title: "Failed to add voice", description: err.message, variant: "destructive" });
    },
  });

  const deleteVoiceMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/voices/custom/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voices"] });
      toast({ title: "Voice removed" });
    },
  });

  const voiceoverMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/generate-voiceover", {
        text,
        voiceId: selectedVoiceId,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      setVoiceoverUrl(data.url);
      toast({ title: "Voiceover generated", description: "Your audio is ready to play and download" });
    },
    onError: (err: any) => {
      toast({ title: "Error generating voiceover", description: err.message, variant: "destructive" });
    },
  });

  const selectedVoice = voices?.find((v) => v.voice_id === selectedVoiceId);
  const presetVoices = voices?.filter((v) => v.category !== "custom") || [];
  const customVoices = voices?.filter((v) => v.category === "custom") || [];
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const estimatedMinutes = Math.round(wordCount / 145);

  const handleDownload = () => {
    if (!voiceoverUrl) return;
    const a = document.createElement("a");
    a.href = voiceoverUrl;
    a.download = `voiceover_${Date.now()}.mp3`;
    a.click();
  };

  return (
    <div className="min-h-full p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        <Link href="/">
          <button className="ghost-btn mb-6 text-sm">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/15 to-cyan-500/10 ring-1 ring-blue-500/20 flex items-center justify-center">
            <Mic className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight gradient-text">Voiceover Studio</h1>
            <p className="text-muted-foreground text-sm">Generate AI voiceovers with any ElevenLabs voice</p>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="glass-card rounded-2xl p-6">
            <Label className="text-sm font-medium mb-2 block">Script Text</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste your script or type the text you want to convert to speech..."
              className="min-h-[200px] bg-[var(--glass-bg)] border-[var(--glass-border)] rounded-xl resize-y text-sm leading-relaxed"
            />
            {wordCount > 0 && (
              <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                <span>{wordCount} words</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> ~{estimatedMinutes || 1} min audio</span>
              </div>
            )}
          </Card>

          <Card className="glass-card rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-medium">Voice Selection</Label>
              <button
                onClick={() => setShowAddVoice(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Voice ID
              </button>
            </div>

            {showAddVoice && (
              <Card className="mb-4 p-4 glass-card rounded-xl border-blue-500/20">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">Add Custom ElevenLabs Voice</span>
                  <button onClick={() => setShowAddVoice(false)} className="text-muted-foreground hover:text-foreground p-0.5">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Voice Name</Label>
                    <input
                      type="text"
                      value={newVoiceName}
                      onChange={(e) => setNewVoiceName(e.target.value)}
                      placeholder="e.g. My Narrator Voice"
                      className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm focus:border-blue-400/50 focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">ElevenLabs Voice ID</Label>
                    <input
                      type="text"
                      value={newVoiceId}
                      onChange={(e) => setNewVoiceId(e.target.value)}
                      placeholder="e.g. zKb9yQZzbyTOE2hxatpu"
                      className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm font-mono focus:border-blue-400/50 focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Description (optional)</Label>
                    <input
                      type="text"
                      value={newVoiceDesc}
                      onChange={(e) => setNewVoiceDesc(e.target.value)}
                      placeholder="e.g. Deep cinematic narrator"
                      className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm focus:border-blue-400/50 focus:outline-none transition-colors"
                    />
                  </div>
                  <button
                    onClick={() => addVoiceMutation.mutate()}
                    disabled={!newVoiceName.trim() || !newVoiceId.trim() || addVoiceMutation.isPending}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                      bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors
                      disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {addVoiceMutation.isPending ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Adding...</>
                    ) : (
                      <><Plus className="w-3.5 h-3.5" /> Add Voice</>
                    )}
                  </button>
                </div>
              </Card>
            )}

            <div className="relative mb-4">
              <button
                onClick={() => setShowVoiceDropdown(!showVoiceDropdown)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] hover:border-primary/30 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  {selectedVoice ? (
                    <div className="flex items-center gap-2">
                      {selectedVoice.category === "custom" && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">CUSTOM</span>
                      )}
                      <span className="text-foreground font-medium">{selectedVoice.name}</span>
                      <span className="text-xs text-muted-foreground/60">— {selectedVoice.description}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Select a voice</span>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showVoiceDropdown ? "rotate-180" : ""}`} />
              </button>

              {showVoiceDropdown && voices && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 glass-card rounded-xl border border-[var(--glass-border)] shadow-xl max-h-80 overflow-y-auto">
                  {customVoices.length > 0 && (
                    <>
                      <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-purple-400/70 border-b border-[var(--glass-border)]">
                        Your Custom Voices
                      </div>
                      {customVoices.map((voice) => (
                        <div
                          key={voice.voice_id}
                          className={`flex items-center gap-2 px-4 py-2.5 hover:bg-[var(--glass-highlight)] transition-colors
                            ${selectedVoiceId === voice.voice_id ? "bg-purple-500/5" : ""}`}
                        >
                          <button
                            onClick={() => {
                              setSelectedVoiceId(voice.voice_id);
                              setShowVoiceDropdown(false);
                            }}
                            className="flex-1 flex items-center gap-2 text-left min-w-0"
                          >
                            <span className={`text-sm font-medium truncate ${selectedVoiceId === voice.voice_id ? "text-purple-400" : "text-foreground"}`}>
                              {voice.name}
                            </span>
                            <span className="text-xs text-muted-foreground/60 truncate">— {voice.description}</span>
                          </button>
                          {selectedVoiceId === voice.voice_id && (
                            <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (voice.customId) {
                                deleteVoiceMutation.mutate(voice.customId);
                                if (selectedVoiceId === voice.voice_id) {
                                  setSelectedVoiceId("Brian");
                                }
                              }
                            }}
                            className="text-muted-foreground/40 hover:text-red-400 transition-colors shrink-0 p-0.5"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </>
                  )}

                  <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 border-b border-[var(--glass-border)]">
                    {customVoices.length > 0 ? "Preset Voices" : "Available Voices"}
                  </div>
                  {presetVoices.map((voice) => (
                    <button
                      key={voice.voice_id}
                      onClick={() => {
                        setSelectedVoiceId(voice.voice_id);
                        setShowVoiceDropdown(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--glass-highlight)] transition-colors
                        ${selectedVoiceId === voice.voice_id ? "bg-blue-500/5" : ""}`}
                    >
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-medium ${selectedVoiceId === voice.voice_id ? "text-blue-400" : "text-foreground"}`}>
                          {voice.name}
                        </span>
                        <span className="text-xs text-muted-foreground/60 ml-2">— {voice.description}</span>
                      </div>
                      {selectedVoiceId === voice.voice_id && (
                        <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => voiceoverMutation.mutate()}
              disabled={voiceoverMutation.isPending || !text.trim()}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold
                gradient-btn text-white border-0 glow-sm hover:glow-md transition-all duration-300
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {voiceoverMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
              ) : (
                <><Mic className="w-4 h-4" /> Generate Voiceover</>
              )}
            </button>
          </Card>

          {voiceoverMutation.isPending && (
            <Card className="glass-card rounded-2xl p-5 border-blue-500/10">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" />
                  <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                    <Volume2 className="w-5 h-5 text-white" />
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Generating voiceover...</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Voice: {selectedVoice?.name || selectedVoiceId} · {wordCount} words · ~{estimatedMinutes || 1} min
                  </p>
                </div>
              </div>
              <div className="mt-3 h-1.5 bg-[var(--glass-bg)] rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full animate-pulse" style={{ width: "60%" }} />
              </div>
            </Card>
          )}

          {voiceoverUrl && (
            <Card className="glass-card rounded-2xl p-5 border-green-500/10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                  <Check className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <span className="text-sm font-medium">Voiceover ready</span>
                  <p className="text-xs text-muted-foreground">
                    Voice: {selectedVoice?.name || selectedVoiceId}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => {
                    if (!audioRef.current) return;
                    if (isPlaying) {
                      audioRef.current.pause();
                    } else {
                      audioRef.current.play();
                    }
                  }}
                  className="w-10 h-10 rounded-full gradient-btn flex items-center justify-center shrink-0 glow-sm hover:glow-md transition-all active:scale-95"
                >
                  {isPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
                </button>
                <audio
                  ref={audioRef}
                  src={voiceoverUrl}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  controls
                  className="flex-1 h-10 opacity-80"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleDownload}
                  className="flex-1 ghost-btn justify-center"
                >
                  <Download className="w-4 h-4" />
                  Download MP3
                </button>
                <button
                  onClick={() => {
                    setVoiceoverUrl(null);
                    if (audioRef.current) {
                      audioRef.current.pause();
                      setIsPlaying(false);
                    }
                    voiceoverMutation.mutate();
                  }}
                  disabled={voiceoverMutation.isPending}
                  className="flex-1 ghost-btn justify-center"
                >
                  <RotateCcw className="w-4 h-4" />
                  Regenerate
                </button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

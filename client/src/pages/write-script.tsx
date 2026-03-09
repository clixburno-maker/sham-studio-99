import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  PenTool,
  Mic,
  Check,
  Loader2,
  RotateCcw,
  Play,
  Pause,
  Volume2,
  ChevronDown,
  Clock,
  Timer,
  GraduationCap,
  X,
  FileText,
  Clapperboard,
  Edit3,
} from "lucide-react";
import { Link } from "wouter";

interface Voice {
  voice_id: string;
  name: string;
  category: string;
  description: string;
}

interface Niche {
  id: string;
  name: string;
  channelName: string | null;
  status: string;
  styleProfile: any;
  videoCount: number | null;
}

function minutesToWords(min: number) {
  return { min: Math.round(min * 130), max: Math.round(min * 160) };
}

type StepId = "topic" | "script" | "voiceover" | "project";

export default function WriteScript() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [activeStep, setActiveStep] = useState<StepId>("topic");
  const [topic, setTopic] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [generatedScript, setGeneratedScript] = useState("");
  const [voiceoverUrl, setVoiceoverUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState("Brian");
  const [customVoiceId, setCustomVoiceId] = useState("");
  const [showCustomVoice, setShowCustomVoice] = useState(false);
  const [showVoiceDropdown, setShowVoiceDropdown] = useState(false);
  const [selectedNicheId, setSelectedNicheId] = useState<string | null>(null);
  const [showNicheDropdown, setShowNicheDropdown] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [savedScriptId, setSavedScriptId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const nicheDropdownRef = useRef<HTMLDivElement>(null);

  const { data: niches } = useQuery<Niche[]>({
    queryKey: ["/api/niches"],
  });

  const readyNiches = niches?.filter((n) => n.status === "ready") || [];
  const selectedNiche = readyNiches.find((n) => n.id === selectedNicheId);

  const { data: voices } = useQuery<Voice[]>({
    queryKey: ["/api/voices"],
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowVoiceDropdown(false);
      }
      if (nicheDropdownRef.current && !nicheDropdownRef.current.contains(e.target as Node)) {
        setShowNicheDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const generateScriptMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/generate-script", {
        topic,
        minutes: durationMinutes,
        ...(selectedNicheId ? { nicheId: selectedNicheId } : {}),
      });
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedScript(data.script);
      setSavedScriptId(data.savedScriptId || null);
      setIsGenerating(false);
      setActiveStep("script");
    },
    onError: (err: Error) => {
      toast({ title: "Error generating script", description: err.message, variant: "destructive" });
      setIsGenerating(false);
    },
  });

  const voiceoverMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/generate-voiceover", {
        text: generatedScript,
        voiceId: selectedVoiceId,
        ...(savedScriptId ? { savedScriptId } : {}),
      });
      return res.json();
    },
    onSuccess: (data) => {
      setVoiceoverUrl(data.url);
      toast({ title: "Voiceover generated", description: "Preview your audio below" });
    },
    onError: (err: Error) => {
      toast({ title: "Error generating voiceover", description: err.message, variant: "destructive" });
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async () => {
      const projectTitle = topic.length > 80 ? topic.substring(0, 80) + "..." : topic;
      const res = await apiRequest("POST", "/api/projects", {
        title: projectTitle,
        script: generatedScript,
        status: "draft",
        voiceoverUrl: voiceoverUrl,
        ...(savedScriptId ? { savedScriptId } : {}),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project created", description: "Heading to your project..." });
      navigate(`/project/${data.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleGenerate = () => {
    setIsGenerating(true);
    generateScriptMutation.mutate();
  };

  const togglePlayback = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const wordCount = generatedScript.trim() ? generatedScript.trim().split(/\s+/).length : 0;
  const selectedVoice = voices?.find((v) => v.voice_id === selectedVoiceId);
  const wordEstimate = minutesToWords(durationMinutes);

  const stepOrder: StepId[] = ["topic", "script", "voiceover", "project"];
  const stepIndex = (s: StepId) => stepOrder.indexOf(s);
  const isDone = (s: StepId) => stepIndex(s) < stepIndex(activeStep);
  const isActive = (s: StepId) => s === activeStep;
  const isLocked = (s: StepId) => stepIndex(s) > stepIndex(activeStep);

  const topicDone = isDone("topic") || (isActive("topic") && isGenerating);
  const scriptDone = isDone("script");
  const voiceoverDone = isDone("voiceover");

  const steps = [
    { id: "topic" as StepId, label: "Topic & Style", icon: Sparkles, number: 1 },
    { id: "script" as StepId, label: "Write Script", icon: FileText, number: 2 },
    { id: "voiceover" as StepId, label: "Voiceover", icon: Mic, number: 3 },
    { id: "project" as StepId, label: "Create Project", icon: Clapperboard, number: 4 },
  ];

  return (
    <div className="min-h-full p-6 md:p-8">
      <div className="max-w-3xl mx-auto">
        <Link href="/">
          <Button
            variant="ghost"
            className="mb-4 -ml-2 text-muted-foreground hover:text-foreground transition-colors duration-200"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Projects
          </Button>
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg gradient-btn flex items-center justify-center glow-sm">
            <PenTool className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight gradient-text">AI Script Writer</h1>
            <p className="text-muted-foreground text-sm">
              Topic, script, voiceover, project — all connected
            </p>
          </div>
        </div>

        <div className="space-y-0">
          {steps.map((s, i) => {
            const active = isActive(s.id) || (s.id === "topic" && isGenerating);
            const done = s.id === "topic" ? topicDone && !isGenerating :
                         s.id === "script" ? scriptDone :
                         s.id === "voiceover" ? voiceoverDone : false;
            const locked = isLocked(s.id) && !(s.id === "topic" && isGenerating);
            const Icon = s.icon;

            return (
              <div key={s.id}>
                <div className="flex items-stretch gap-4">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-500 flex-shrink-0 ${
                        active
                          ? "gradient-btn text-white glow-sm scale-110"
                          : done
                          ? "bg-green-500/20 text-green-400 border border-green-500/30"
                          : "glass-card text-muted-foreground border border-[var(--glass-border)]"
                      }`}
                    >
                      {done ? <Check className="w-4 h-4" /> : active ? <Icon className="w-4 h-4" /> : s.number}
                    </div>
                    {i < steps.length - 1 && (
                      <div className={`w-0.5 flex-1 min-h-[16px] transition-all duration-500 ${done ? "bg-gradient-to-b from-green-500/40 to-green-500/10" : "bg-[var(--glass-border)]"}`} />
                    )}
                  </div>

                  <div className={`flex-1 pb-6 transition-all duration-300 ${locked ? "opacity-40" : ""}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-sm font-semibold ${active ? "text-foreground" : done ? "text-green-400" : "text-muted-foreground"}`}>
                        {s.label}
                      </span>
                      {done && !active && (
                        <span
                          onClick={() => setActiveStep(s.id)}
                          className="text-xs text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1 transition-colors"
                        >
                          <Edit3 className="w-3 h-3" /> edit
                        </span>
                      )}
                    </div>

                    {s.id === "topic" && (
                      <>
                        {(active || isGenerating) && !done && (
                          <Card className="glass-card rounded-xl overflow-hidden animate-in fade-in slide-in-from-left-2 duration-300">
                            <div className="p-5 space-y-4">
                              <div>
                                <Label className="text-xs text-muted-foreground mb-1.5 block">Video Topic</Label>
                                <Textarea
                                  placeholder="e.g. The story of how a single F-117 Nighthawk stealth fighter was shot down over Serbia in 1999..."
                                  className="min-h-[100px] text-sm leading-relaxed glass-input rounded-xl"
                                  value={topic}
                                  onChange={(e) => setTopic(e.target.value)}
                                  autoFocus
                                  disabled={isGenerating}
                                />
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <Label className="text-xs text-muted-foreground mb-1.5 block">Duration</Label>
                                  <div className="glass-input rounded-xl p-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xl font-bold gradient-text">{durationMinutes} min</span>
                                      <span className="text-xs text-muted-foreground">
                                        ~{wordEstimate.min.toLocaleString()}-{wordEstimate.max.toLocaleString()} words
                                      </span>
                                    </div>
                                    <input
                                      type="range"
                                      min="8"
                                      max="45"
                                      step="1"
                                      value={durationMinutes}
                                      onChange={(e) => setDurationMinutes(Number(e.target.value))}
                                      className="w-full h-2 rounded-full appearance-none cursor-pointer accent-blue-500"
                                      disabled={isGenerating}
                                      style={{
                                        background: `linear-gradient(90deg, hsl(217 95% 50%) ${((durationMinutes - 8) / (45 - 8)) * 100}%, hsl(220 15% 20%) ${((durationMinutes - 8) / (45 - 8)) * 100}%)`,
                                      }}
                                    />
                                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                                      <span>8 min</span>
                                      <span>45 min</span>
                                    </div>
                                  </div>
                                </div>

                                <div>
                                  <Label className="text-xs text-muted-foreground mb-1.5 block">Writing Style</Label>
                                  <div className="relative" ref={nicheDropdownRef}>
                                    <div
                                      onClick={() => !isGenerating && readyNiches.length > 0 && setShowNicheDropdown(!showNicheDropdown)}
                                      className={`glass-input rounded-xl p-3 flex items-center justify-between text-sm ${readyNiches.length > 0 && !isGenerating ? "cursor-pointer" : ""}`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <GraduationCap className={`w-4 h-4 flex-shrink-0 ${selectedNiche ? "text-purple-400" : "text-muted-foreground"}`} />
                                        {selectedNiche ? (
                                          <span className="text-foreground font-medium truncate">{selectedNiche.channelName || selectedNiche.name}</span>
                                        ) : readyNiches.length > 0 ? (
                                          <span className="text-muted-foreground">Default style</span>
                                        ) : (
                                          <span className="text-muted-foreground/60">No niches trained</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 flex-shrink-0">
                                        {selectedNiche && (
                                          <span
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setSelectedNicheId(null);
                                              setShowNicheDropdown(false);
                                            }}
                                            className="p-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer"
                                          >
                                            <X className="w-3 h-3 text-muted-foreground" />
                                          </span>
                                        )}
                                        {readyNiches.length > 0 && (
                                          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${showNicheDropdown ? "rotate-180" : ""}`} />
                                        )}
                                      </div>
                                    </div>

                                    {showNicheDropdown && (
                                      <div className="absolute top-full left-0 right-0 mt-1.5 glass-card border border-[var(--glass-border)] rounded-xl overflow-hidden z-50 shadow-xl max-h-[200px] overflow-y-auto">
                                        <div
                                          onClick={() => { setSelectedNicheId(null); setShowNicheDropdown(false); }}
                                          className={`flex items-center gap-2.5 p-2.5 text-sm cursor-pointer transition-colors hover:bg-white/5 ${!selectedNicheId ? "bg-white/5" : ""}`}
                                        >
                                          <PenTool className="w-3.5 h-3.5 text-muted-foreground" />
                                          <span className="text-foreground">Default Style</span>
                                        </div>
                                        {readyNiches.map((niche) => (
                                          <div
                                            key={niche.id}
                                            onClick={() => { setSelectedNicheId(niche.id); setShowNicheDropdown(false); }}
                                            className={`flex items-center gap-2.5 p-2.5 text-sm cursor-pointer transition-colors hover:bg-white/5 border-t border-[var(--glass-border)] ${selectedNicheId === niche.id ? "bg-purple-500/10" : ""}`}
                                          >
                                            <GraduationCap className={`w-3.5 h-3.5 ${selectedNicheId === niche.id ? "text-purple-400" : "text-muted-foreground"}`} />
                                            <div className="min-w-0 flex-1">
                                              <div className="text-foreground truncate">{niche.channelName || niche.name}</div>
                                              <div className="text-[10px] text-muted-foreground">{niche.videoCount || 0} videos</div>
                                            </div>
                                            {selectedNicheId === niche.id && <Check className="w-3.5 h-3.5 text-purple-400" />}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {isGenerating ? (
                                <div className="flex items-center justify-center gap-3 py-3">
                                  <div className="relative w-8 h-8">
                                    <div className="absolute inset-0 rounded-full gradient-btn opacity-30 animate-ping" />
                                    <div className="relative w-8 h-8 rounded-full gradient-btn flex items-center justify-center">
                                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">Writing your script...</p>
                                    <p className="text-xs text-muted-foreground">
                                      {durationMinutes} min / ~{wordEstimate.min.toLocaleString()}-{wordEstimate.max.toLocaleString()} words
                                      {selectedNiche && (
                                        <span className="text-purple-400 ml-1">
                                          in {selectedNiche.channelName || selectedNiche.name} style
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex justify-end">
                                  <button
                                    onClick={handleGenerate}
                                    disabled={!topic.trim()}
                                    className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300
                                      ${topic.trim()
                                        ? "gradient-btn text-white glow-sm hover:glow-md hover:scale-[1.02] active:scale-[0.98]"
                                        : "bg-white/5 border border-white/10 text-muted-foreground cursor-not-allowed opacity-50"
                                      }`}
                                  >
                                    <Sparkles className="w-4 h-4" />
                                    Generate Script
                                  </button>
                                </div>
                              )}
                            </div>
                          </Card>
                        )}

                        {done && !active && (
                          <div className="text-xs text-muted-foreground space-y-0.5">
                            <p className="truncate max-w-md">{topic}</p>
                            <p>{durationMinutes} min{selectedNiche ? ` · ${selectedNiche.channelName || selectedNiche.name} style` : ""}</p>
                          </div>
                        )}
                      </>
                    )}

                    {s.id === "script" && (
                      <>
                        {active && (
                          <Card className="glass-card rounded-xl overflow-hidden animate-in fade-in slide-in-from-left-2 duration-300">
                            <div className="p-5 space-y-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-xs text-muted-foreground">
                                    {wordCount} words · ~{Math.round(wordCount / 145)} min read
                                  </p>
                                </div>
                                <button
                                  onClick={() => {
                                    setIsGenerating(true);
                                    setActiveStep("topic");
                                    generateScriptMutation.mutate();
                                  }}
                                  disabled={generateScriptMutation.isPending}
                                  className="ghost-btn text-xs px-3 py-1.5 rounded-lg"
                                >
                                  {generateScriptMutation.isPending ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <RotateCcw className="w-3 h-3" />
                                  )}
                                  Regenerate
                                </button>
                              </div>

                              <Textarea
                                value={generatedScript}
                                onChange={(e) => setGeneratedScript(e.target.value)}
                                className="min-h-[300px] text-sm leading-relaxed glass-input rounded-xl"
                              />

                              <div className="flex justify-end">
                                <button
                                  onClick={() => setActiveStep("voiceover")}
                                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold gradient-btn text-white glow-sm hover:glow-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
                                >
                                  Approve & Continue
                                  <ArrowRight className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </Card>
                        )}

                        {done && !active && (
                          <div className="text-xs text-muted-foreground">
                            <p>{wordCount} words · ~{Math.round(wordCount / 145)} min read</p>
                          </div>
                        )}

                        {locked && (
                          <p className="text-xs text-muted-foreground/50">AI will write your script here</p>
                        )}
                      </>
                    )}

                    {s.id === "voiceover" && (
                      <>
                        {active && (
                          <Card className="glass-card rounded-xl overflow-hidden animate-in fade-in slide-in-from-left-2 duration-300">
                            <div className="p-5 space-y-4">
                              <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Voice</Label>
                                <div className="relative" ref={dropdownRef}>
                                  <div
                                    onClick={() => setShowVoiceDropdown(!showVoiceDropdown)}
                                    className="glass-input rounded-xl p-3 flex items-center justify-between text-sm cursor-pointer"
                                  >
                                    <span className="flex items-center gap-2">
                                      <Volume2 className="w-4 h-4 text-muted-foreground" />
                                      {showCustomVoice ? (
                                        <span className="text-foreground">Custom Voice ID</span>
                                      ) : selectedVoice ? (
                                        <>
                                          <span className="text-foreground font-medium">{selectedVoice.name}</span>
                                          <span className="text-xs text-muted-foreground/60">— {selectedVoice.description}</span>
                                        </>
                                      ) : (
                                        <span className="text-muted-foreground">Select a voice...</span>
                                      )}
                                    </span>
                                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showVoiceDropdown ? "rotate-180" : ""}`} />
                                  </div>
                                  {showVoiceDropdown && voices && (
                                    <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl border border-[var(--glass-border)] max-h-72 overflow-y-auto shadow-xl bg-white/80 dark:bg-[hsl(220,15%,8%)]/95 backdrop-blur-2xl">
                                      {voices.map((voice) => (
                                        <div
                                          key={voice.voice_id}
                                          onClick={() => {
                                            setSelectedVoiceId(voice.voice_id);
                                            setShowCustomVoice(false);
                                            setShowVoiceDropdown(false);
                                          }}
                                          className={`px-4 py-2.5 hover:bg-[var(--glass-highlight)] transition-colors flex items-center justify-between cursor-pointer border-b border-[var(--glass-border)] last:border-b-0 ${
                                            !showCustomVoice && selectedVoiceId === voice.voice_id ? "bg-blue-500/5" : ""
                                          }`}
                                        >
                                          <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                              <span className={`text-sm font-medium ${!showCustomVoice && selectedVoiceId === voice.voice_id ? "text-blue-400" : "text-foreground"}`}>
                                                {voice.name}
                                              </span>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground mt-0.5">{voice.description}</p>
                                          </div>
                                          {!showCustomVoice && selectedVoiceId === voice.voice_id && (
                                            <Check className="w-3.5 h-3.5 text-blue-400 shrink-0 ml-2" />
                                          )}
                                        </div>
                                      ))}
                                      <div
                                        onClick={() => {
                                          setShowCustomVoice(true);
                                          setShowVoiceDropdown(false);
                                        }}
                                        className={`px-4 py-2.5 hover:bg-[var(--glass-highlight)] transition-colors flex items-center gap-2 cursor-pointer border-t border-[var(--glass-border)] ${
                                          showCustomVoice ? "bg-purple-500/5" : ""
                                        }`}
                                      >
                                        <PenTool className={`w-3.5 h-3.5 ${showCustomVoice ? "text-purple-400" : "text-muted-foreground"}`} />
                                        <div className="min-w-0">
                                          <span className={`text-sm font-medium ${showCustomVoice ? "text-purple-400" : "text-foreground"}`}>
                                            Use Custom Voice ID
                                          </span>
                                          <p className="text-[11px] text-muted-foreground mt-0.5">Enter an ElevenLabs voice ID manually</p>
                                        </div>
                                        {showCustomVoice && <Check className="w-3.5 h-3.5 text-purple-400 shrink-0 ml-auto" />}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {showCustomVoice && (
                                <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                                  <Label className="text-xs text-muted-foreground">ElevenLabs Voice ID</Label>
                                  <input
                                    type="text"
                                    value={customVoiceId}
                                    onChange={(e) => {
                                      setCustomVoiceId(e.target.value);
                                      if (e.target.value.trim()) {
                                        setSelectedVoiceId(e.target.value.trim());
                                      }
                                    }}
                                    placeholder="e.g. JBFqnCBsd6RMkjVDRZzb or a voice name"
                                    className="w-full glass-input rounded-xl p-3 text-sm"
                                  />
                                  <p className="text-[10px] text-muted-foreground/60">
                                    Paste any ElevenLabs voice ID or name supported by the API
                                  </p>
                                </div>
                              )}

                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => voiceoverMutation.mutate()}
                                  disabled={voiceoverMutation.isPending || (showCustomVoice && !customVoiceId.trim())}
                                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
                                    bg-white/10 dark:bg-white/[0.08] backdrop-blur-xl border border-white/20 dark:border-white/[0.12] text-foreground
                                    shadow-lg hover:bg-white/15 dark:hover:bg-white/[0.12] hover:scale-[1.02] active:scale-[0.98]
                                    transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none"
                                >
                                  {voiceoverMutation.isPending ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                                  ) : (
                                    <><Mic className="w-4 h-4" /> Generate Voiceover</>
                                  )}
                                </button>
                                {voiceoverUrl && (
                                  <button
                                    onClick={() => {
                                      setVoiceoverUrl(null);
                                      setIsPlaying(false);
                                      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
                                      voiceoverMutation.mutate();
                                    }}
                                    disabled={voiceoverMutation.isPending}
                                    className="ghost-btn text-xs px-3 py-1.5 rounded-lg"
                                  >
                                    <RotateCcw className="w-3 h-3" /> Redo
                                  </button>
                                )}
                              </div>

                              {voiceoverMutation.isPending && (
                                <div className="flex items-center gap-3 py-2 animate-in fade-in duration-300">
                                  <div className="relative w-8 h-8">
                                    <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" />
                                    <div className="relative w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                                      <Mic className="w-3.5 h-3.5 text-blue-400" />
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-xs font-medium">Generating voiceover...</p>
                                    <p className="text-[11px] text-muted-foreground">
                                      Voice: {showCustomVoice ? customVoiceId : (selectedVoice?.name || selectedVoiceId)} · {wordCount} words · ~{Math.round(wordCount / 145)} min
                                    </p>
                                  </div>
                                </div>
                              )}

                              {voiceoverUrl && (
                                <div className="space-y-2 animate-in fade-in duration-300">
                                  <div className="flex items-center gap-2 text-xs text-green-400">
                                    <Check className="w-3.5 h-3.5" />
                                    <span className="font-medium">Voiceover ready</span>
                                    <span className="text-muted-foreground">
                                      · {showCustomVoice ? customVoiceId : (selectedVoice?.name || selectedVoiceId)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3 p-3 rounded-xl glass-card border border-[var(--glass-border)]">
                                    <button
                                      onClick={togglePlayback}
                                      className="w-10 h-10 rounded-full gradient-btn flex items-center justify-center shrink-0 glow-sm hover:glow-md transition-all active:scale-95"
                                    >
                                      {isPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
                                    </button>
                                    <audio
                                      ref={audioRef}
                                      src={voiceoverUrl}
                                      onEnded={() => setIsPlaying(false)}
                                      onPlay={() => setIsPlaying(true)}
                                      onPause={() => setIsPlaying(false)}
                                      controls
                                      className="flex-1 h-8 opacity-80"
                                    />
                                  </div>
                                </div>
                              )}

                              <div className="flex justify-between pt-1">
                                <button
                                  onClick={() => {
                                    setActiveStep("project");
                                    createProjectMutation.mutate();
                                  }}
                                  disabled={createProjectMutation.isPending}
                                  className="ghost-btn text-xs px-4 py-2 rounded-lg"
                                >
                                  Skip Voiceover <ArrowRight className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => {
                                    setActiveStep("project");
                                    createProjectMutation.mutate();
                                  }}
                                  disabled={!voiceoverUrl || createProjectMutation.isPending}
                                  className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300
                                    ${voiceoverUrl
                                      ? "gradient-btn text-white glow-sm hover:glow-md hover:scale-[1.02] active:scale-[0.98]"
                                      : "bg-white/5 border border-white/10 text-muted-foreground cursor-not-allowed opacity-50"
                                    }`}
                                >
                                  Create Project <ArrowRight className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </Card>
                        )}

                        {done && !active && (
                          <div className="text-xs text-muted-foreground">
                            {voiceoverUrl ? (
                              <span className="flex items-center gap-1.5">
                                <Check className="w-3 h-3 text-green-400" />
                                Voiceover generated · {showCustomVoice ? customVoiceId : (selectedVoice?.name || selectedVoiceId)}
                              </span>
                            ) : "Skipped"}
                          </div>
                        )}

                        {locked && (
                          <p className="text-xs text-muted-foreground/50">Add narration to your script</p>
                        )}
                      </>
                    )}

                    {s.id === "project" && (
                      <>
                        {active && (
                          <Card className="glass-card rounded-xl overflow-hidden animate-in fade-in slide-in-from-left-2 duration-300">
                            <div className="p-8 text-center">
                              <div className="relative w-14 h-14 mx-auto mb-4">
                                <div className="absolute inset-0 rounded-full gradient-btn opacity-20 animate-ping" />
                                <div className="relative w-14 h-14 rounded-full gradient-btn flex items-center justify-center glow-md">
                                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                                </div>
                              </div>
                              <h3 className="font-semibold mb-1">Creating Your Project</h3>
                              <p className="text-xs text-muted-foreground">Setting everything up...</p>
                            </div>
                          </Card>
                        )}

                        {locked && (
                          <p className="text-xs text-muted-foreground/50">Your project will be created here</p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

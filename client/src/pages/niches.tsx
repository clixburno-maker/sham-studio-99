import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft,
  Plus,
  Loader2,
  Check,
  Trash2,
  Youtube,
  BookOpen,
  Zap,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  FileText,
  ExternalLink,
  Hash,
  Eye,
  EyeOff,
  RotateCcw,
  Search,
  Download,
  Brain,
  CheckSquare,
  Square,
} from "lucide-react";
import { Link } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Niche {
  id: string;
  name: string;
  channelUrl: string | null;
  channelName: string | null;
  status: string;
  styleProfile: any;
  videoCount: number | null;
  sampleTranscripts: any;
  createdAt: string | null;
}

interface NicheVideo {
  id: string;
  nicheId: string;
  videoId: string;
  title: string;
  transcript: string;
  wordCount: number | null;
  createdAt: string | null;
}

interface PreviewVideo {
  videoId: string;
  title: string;
  url: string;
}

interface ExtractedVideo {
  videoId: string;
  title: string;
  wordCount: number;
}

interface TrainingProgress {
  step: string;
  detail: string;
  current: number;
  total: number;
  extractedVideos?: ExtractedVideo[];
  channelName?: string;
  analysisSteps?: Array<{ label: string; status: "pending" | "active" | "done" }>;
}

export default function NichesPage() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [channelUrl, setChannelUrl] = useState("");
  const [nicheName, setNicheName] = useState("");
  const [previewVideos, setPreviewVideos] = useState<PreviewVideo[] | null>(null);
  const [previewChannelName, setPreviewChannelName] = useState<string | null>(null);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const [activeNicheId, setActiveNicheId] = useState<string | null>(null);
  const [expandedNiche, setExpandedNiche] = useState<string | null>(null);
  const [expandedTab, setExpandedTab] = useState<"style" | "videos">("videos");
  const [expandedTranscript, setExpandedTranscript] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Niche | null>(null);

  const { data: niches, isLoading } = useQuery<Niche[]>({
    queryKey: ["/api/niches"],
    refetchInterval: activeNicheId ? 3000 : false,
  });

  const { data: progress } = useQuery<TrainingProgress>({
    queryKey: [`/api/niches/${activeNicheId}/progress`],
    enabled: !!activeNicheId,
    refetchInterval: 2000,
  });

  const { data: nicheVideos } = useQuery<NicheVideo[]>({
    queryKey: [`/api/niches/${expandedNiche}/videos`],
    enabled: !!expandedNiche,
  });

  useEffect(() => {
    if (progress?.step === "complete" || progress?.step === "extracted") {
      setTimeout(() => {
        if (activeNicheId) {
          setExpandedNiche(activeNicheId);
          setExpandedTab("videos");
          queryClient.invalidateQueries({ queryKey: [`/api/niches/${activeNicheId}/videos`] });
        }
        setActiveNicheId(null);
        queryClient.invalidateQueries({ queryKey: ["/api/niches"] });
      }, 1500);
    } else if (progress?.step === "error") {
      setTimeout(() => {
        setActiveNicheId(null);
        queryClient.invalidateQueries({ queryKey: ["/api/niches"] });
      }, 2000);
    }
  }, [progress]);

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/niches/preview", { channelUrl });
      return res.json();
    },
    onSuccess: (data) => {
      setPreviewVideos(data.videos);
      setPreviewChannelName(data.channelName);
      setSelectedVideoIds(new Set(data.videos.map((v: PreviewVideo) => v.videoId)));
      toast({ title: `Found ${data.videos.length} videos`, description: `Channel: ${data.channelName}` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const selectedVideos = previewVideos?.filter(v => selectedVideoIds.has(v.videoId)) || [];

  const toggleVideoSelection = (videoId: string) => {
    setSelectedVideoIds(prev => {
      const next = new Set(prev);
      if (next.has(videoId)) {
        next.delete(videoId);
      } else {
        next.add(videoId);
      }
      return next;
    });
  };

  const toggleAllVideos = () => {
    if (!previewVideos) return;
    if (selectedVideoIds.size === previewVideos.length) {
      setSelectedVideoIds(new Set());
    } else {
      setSelectedVideoIds(new Set(previewVideos.map(v => v.videoId)));
    }
  };

  const createAndExtractMutation = useMutation({
    mutationFn: async () => {
      const createRes = await apiRequest("POST", "/api/niches/create", {
        channelUrl,
        name: nicheName,
        channelName: previewChannelName,
        videos: selectedVideos,
      });
      const niche = await createRes.json();
      await apiRequest("POST", `/api/niches/${niche.id}/extract`, { videoIds: selectedVideos.map(v => v.videoId) });
      return niche;
    },
    onSuccess: (niche) => {
      setActiveNicheId(niche.id);
      setShowForm(false);
      setChannelUrl("");
      setNicheName("");
      setPreviewVideos(null);
      setPreviewChannelName(null);
      setSelectedVideoIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/niches"] });
      toast({ title: "Extraction started", description: `Pulling transcripts from ${selectedVideos.length} selected videos...` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const extractMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/niches/${id}/extract`);
      return id;
    },
    onSuccess: (id) => {
      setActiveNicheId(id);
      queryClient.invalidateQueries({ queryKey: ["/api/niches"] });
      toast({ title: "Extraction started", description: "Pulling transcripts from all videos..." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/niches/${id}/analyze`);
      return id;
    },
    onSuccess: (id) => {
      setActiveNicheId(id);
      queryClient.invalidateQueries({ queryKey: ["/api/niches"] });
      toast({ title: "Analysis started", description: "AI is analyzing the writing style..." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const retrainMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/niches/${id}/retrain`);
      return res.json();
    },
    onSuccess: (data) => {
      setExpandedNiche(null);
      queryClient.invalidateQueries({ queryKey: ["/api/niches"] });
      toast({ title: "Reset", description: "Niche reset. You can re-extract and re-analyze." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/niches/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/niches"] });
      toast({ title: "Niche deleted" });
      setDeleteTarget(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ready": return "text-green-400 bg-green-500/10 border-green-500/20";
      case "extracted": return "text-cyan-400 bg-cyan-500/10 border-cyan-500/20";
      case "preview": return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
      case "extracting": case "analyzing": return "text-blue-400 bg-blue-500/10 border-blue-500/20";
      case "failed": return "text-red-400 bg-red-500/10 border-red-500/20";
      default: return "text-muted-foreground bg-muted/50 border-muted-foreground/20";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "ready": return <Check className="w-5 h-5 text-green-400" />;
      case "extracted": return <FileText className="w-5 h-5 text-cyan-400" />;
      case "preview": return <Search className="w-5 h-5 text-yellow-400" />;
      case "failed": return <AlertCircle className="w-5 h-5 text-red-400" />;
      default: return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
    }
  };

  return (
    <div className="min-h-full p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/">
          <Button variant="ghost" className="mb-4 -ml-2 text-muted-foreground hover:text-foreground transition-colors duration-200">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Projects
          </Button>
        </Link>

        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/10 ring-1 ring-orange-500/20 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#e5e5e5]">Niche Training</h1>
              <p className="text-muted-foreground text-sm">
                Train AI to write scripts in your competitor's style
              </p>
            </div>
          </div>
          <button
            onClick={() => { setShowForm(!showForm); setPreviewVideos(null); setPreviewChannelName(null); }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold bg-white/10 border border-white/20 text-foreground hover:bg-white/15 hover:border-white/30 transition-all duration-300"
          >
            <Plus className="w-4 h-4" />
            Add Niche
          </button>
        </div>

        {showForm && (
          <Card className="rounded-lg p-6 mb-8 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 ring-1 ring-red-500/20 flex items-center justify-center">
                <Youtube className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h2 className="font-semibold text-lg">Train from YouTube Channel</h2>
                <p className="text-xs text-muted-foreground">
                  Step 1: Paste a channel URL to preview top videos
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium tracking-wide">Niche Name</Label>
                <Input
                  placeholder="e.g. Military Aviation Documentary, Naval History"
                  value={nicheName}
                  onChange={(e) => setNicheName(e.target.value)}
                  className="surface-input rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium tracking-wide">YouTube Channel URL</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://youtube.com/@ChannelName"
                    value={channelUrl}
                    onChange={(e) => { setChannelUrl(e.target.value); setPreviewVideos(null); setPreviewChannelName(null); setSelectedVideoIds(new Set()); }}
                    className="surface-input rounded-xl flex-1"
                  />
                  <button
                    onClick={() => previewMutation.mutate()}
                    disabled={!channelUrl.trim() || previewMutation.isPending}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold shrink-0
                      transition-all duration-300
                      ${channelUrl.trim()
                        ? "bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20"
                        : "bg-white/5 border border-white/10 text-muted-foreground cursor-not-allowed opacity-50"
                      }`}
                  >
                    {previewMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    Fetch Videos
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground/60">
                  Supports formats: @handle, /channel/UC..., /c/name, /user/name
                </p>
              </div>

              {previewVideos && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Youtube className="w-4 h-4 text-red-400" />
                      <span className="text-sm font-medium">{previewChannelName}</span>
                      <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded border border-[#1a1a1a]">
                        Top {previewVideos.length} videos
                      </span>
                    </div>
                    <button
                      onClick={toggleAllVideos}
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {selectedVideoIds.size === previewVideos.length ? (
                        <><CheckSquare className="w-3.5 h-3.5 text-blue-400" />Deselect All</>
                      ) : (
                        <><Square className="w-3.5 h-3.5" />Select All</>
                      )}
                    </button>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {selectedVideoIds.size} of {previewVideos.length} videos selected for training
                  </div>
                  <div className="space-y-2">
                    {previewVideos.map((video, i) => {
                      const isSelected = selectedVideoIds.has(video.videoId);
                      return (
                        <div
                          key={video.videoId}
                          onClick={() => toggleVideoSelection(video.videoId)}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200 ${
                            isSelected
                              ? "bg-blue-500/10 border border-blue-500/20 ring-1 ring-blue-500/10"
                              : "bg-white/5 border border-white/10 opacity-60 hover:opacity-80"
                          }`}
                        >
                          <div className="shrink-0">
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-blue-400" />
                            ) : (
                              <Square className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                          <img
                            src={`https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`}
                            alt={video.title}
                            className="w-24 h-[54px] rounded-md object-cover shrink-0 bg-black/20"
                            loading="lazy"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium line-clamp-2 leading-snug">{video.title}</div>
                          </div>
                          <a
                            href={video.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="shrink-0 text-muted-foreground hover:text-blue-400 transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => { setShowForm(false); setPreviewVideos(null); setPreviewChannelName(null); }}
                  className="flat-btn-ghost px-5 py-2.5 rounded-2xl"
                >
                  Cancel
                </button>
                {previewVideos && (
                  <button
                    onClick={() => createAndExtractMutation.mutate()}
                    disabled={!nicheName.trim() || selectedVideoIds.size === 0 || createAndExtractMutation.isPending}
                    className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-semibold transition-all duration-300 ${
                      nicheName.trim()
                        ? "bg-white/10 border border-white/20 text-foreground hover:bg-white/15 hover:border-white/30"
                        : "bg-white/5 border border-white/10 text-muted-foreground cursor-not-allowed opacity-50"
                    }`}
                  >
                    {createAndExtractMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Starting...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        Extract {selectedVideoIds.size} Transcript{selectedVideoIds.size !== 1 ? "s" : ""}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </Card>
        )}

        {activeNicheId && progress && progress.step !== "complete" && progress.step !== "extracted" && progress.step !== "error" && (
          <Card className="rounded-lg p-5 mb-6 animate-in fade-in duration-300">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary opacity-20 animate-ping" />
                <div className="relative w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                </div>
              </div>
              <div className="flex-1">
                <div className="font-medium text-sm capitalize">{progress.step}...</div>
                <p className="text-xs text-muted-foreground mt-0.5">{progress.detail}</p>
              </div>
              {progress.total > 1 && (
                <span className="text-xs text-muted-foreground font-mono">{progress.current}/{progress.total}</span>
              )}
            </div>
            {progress.total > 1 && (
              <div className="mt-3 h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            )}

            {progress.channelName && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Youtube className="w-3.5 h-3.5 text-red-400" />
                <span>Channel: <span className="text-foreground font-medium">{progress.channelName}</span></span>
              </div>
            )}

            {progress.extractedVideos && progress.extractedVideos.length > 0 && (
              <div className="mt-4 space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Extracted Transcripts ({progress.extractedVideos.length})
                </div>
                {progress.extractedVideos.map((video) => (
                  <div key={video.videoId} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-green-500/5 border border-green-500/10 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="w-5 h-5 rounded-md bg-green-500/10 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-green-400" />
                    </div>
                    <img
                      src={`https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`}
                      alt={video.title}
                      className="w-16 h-9 rounded object-cover shrink-0 bg-black/20"
                      loading="lazy"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{video.title}</div>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{video.wordCount.toLocaleString()} words</span>
                    <a
                      href={`https://www.youtube.com/watch?v=${video.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-muted-foreground hover:text-blue-400 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            )}

            {progress.step === "analyzing" && (
              <div className="mt-4 space-y-2">
                <div className="px-4 py-3.5 rounded-xl bg-purple-500/5 border border-purple-500/15">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Brain className="w-4 h-4 text-purple-400" />
                        <div className="absolute inset-0 animate-ping">
                          <Brain className="w-4 h-4 text-purple-400 opacity-30" />
                        </div>
                      </div>
                      <span className="text-xs text-purple-300 font-semibold tracking-wide">AI Style Analysis</span>
                    </div>
                    {progress.analysisSteps && (
                      <span className="text-[10px] font-mono text-purple-400/60">
                        {progress.analysisSteps.filter(s => s.status === "done").length}/{progress.analysisSteps.length}
                      </span>
                    )}
                  </div>

                  {progress.analysisSteps && progress.analysisSteps.length > 0 && (
                    <>
                      <div className="h-1 rounded-full bg-purple-500/10 overflow-hidden mb-3">
                        <div
                          className="h-full rounded-full bg-purple-500 transition-all duration-700 ease-out"
                          style={{ width: `${(progress.analysisSteps.filter(s => s.status === "done").length / progress.analysisSteps.length) * 100}%` }}
                        />
                      </div>
                      <div className="space-y-2 ml-1">
                        {progress.analysisSteps.map((step, i) => (
                          <div key={i} className={`flex items-center gap-2.5 transition-all duration-300 ${
                            step.status === "active" ? "translate-x-1" : ""
                          }`}>
                            {step.status === "done" ? (
                              <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                                <Check className="w-2.5 h-2.5 text-green-400" />
                              </div>
                            ) : step.status === "active" ? (
                              <div className="w-4 h-4 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
                                <Loader2 className="w-2.5 h-2.5 text-purple-400 animate-spin" />
                              </div>
                            ) : (
                              <div className="w-4 h-4 rounded-full border border-white/10 shrink-0" />
                            )}
                            <span className={`text-[11px] transition-all duration-300 ${
                              step.status === "done" ? "text-green-400/70 line-through decoration-green-500/30" :
                              step.status === "active" ? "text-purple-200 font-medium" :
                              "text-muted-foreground/40"
                            }`}>
                              {step.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="mt-3 pt-2.5 border-t border-purple-500/10">
                    <p className="text-[10px] text-purple-400/50 italic">{progress.detail}</p>
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}

        {isLoading && (
          <div className="grid gap-4">
            {[1, 2].map((i) => (
              <Card key={i} className="rounded-lg p-5">
                <div className="h-5 w-1/3 bg-muted/30 rounded animate-pulse mb-2" />
                <div className="h-4 w-2/3 bg-muted/20 rounded animate-pulse" />
              </Card>
            ))}
          </div>
        )}

        {!isLoading && niches && niches.length === 0 && !showForm && (
          <Card className="rounded-lg p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-orange-500/10 ring-1 ring-orange-500/20 flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-7 h-7 text-orange-400" />
            </div>
            <h2 className="text-lg font-semibold mb-1">No niches trained yet</h2>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
              Add a YouTube channel to analyze its writing style. The AI will learn the tone, pacing, and techniques to replicate in your scripts.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-semibold bg-white/10 border border-white/20 text-foreground hover:bg-white/15 hover:border-white/30 transition-all duration-300"
            >
              <Plus className="w-4 h-4" />
              Train First Niche
            </button>
          </Card>
        )}

        {!isLoading && niches && niches.length > 0 && (
          <div className="grid gap-4">
            {niches.map((niche) => (
              <Card key={niche.id} className="rounded-lg overflow-hidden group relative">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ring-1 ${
                        niche.status === "ready" ? "bg-green-500/10 ring-green-500/20" :
                        niche.status === "extracted" ? "bg-cyan-500/10 ring-cyan-500/20" :
                        niche.status === "preview" ? "bg-yellow-500/10 ring-yellow-500/20" :
                        niche.status === "failed" ? "bg-red-500/10 ring-red-500/20" :
                        "bg-blue-500/10 ring-blue-500/20"
                      }`}>
                        {getStatusIcon(niche.status)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate">{niche.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                          {niche.channelName && <span>{niche.channelName}</span>}
                          {niche.videoCount && niche.videoCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] border border-[#1a1a1a]">
                              {niche.videoCount} videos
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[11px] font-medium capitalize px-2.5 py-1 rounded-lg border ${getStatusColor(niche.status)}`}>
                        {niche.status}
                      </span>

                      {niche.status === "preview" && (
                        <button
                          onClick={() => extractMutation.mutate(niche.id)}
                          disabled={extractMutation.isPending}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold
                            bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all"
                        >
                          {extractMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                          Extract
                        </button>
                      )}

                      {niche.status === "extracted" && (
                        <button
                          onClick={() => analyzeMutation.mutate(niche.id)}
                          disabled={analyzeMutation.isPending}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold
                            bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 transition-all"
                        >
                          {analyzeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
                          Analyze Style
                        </button>
                      )}

                      {(niche.status === "ready" || niche.status === "extracted") && (
                        <button
                          onClick={() => {
                            setExpandedNiche(expandedNiche === niche.id ? null : niche.id);
                            setExpandedTranscript(null);
                          }}
                          className="p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                        >
                          {expandedNiche === niche.id ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          )}
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(niche);
                        }}
                        className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/10 transition-all text-muted-foreground hover:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {expandedNiche === niche.id && (
                  <div className="border-t border-[#1a1a1a] animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center justify-between border-b border-[#1a1a1a]">
                      <div className="flex">
                        <button
                          onClick={() => setExpandedTab("videos")}
                          className={`flex items-center gap-2 px-5 py-3 text-xs font-medium transition-all duration-200 border-b-2 -mb-px ${
                            expandedTab === "videos"
                              ? "border-blue-500 text-blue-400"
                              : "border-transparent text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Extracted Videos {nicheVideos ? `(${nicheVideos.length})` : ""}
                        </button>
                        {niche.status === "ready" && (
                          <button
                            onClick={() => setExpandedTab("style")}
                            className={`flex items-center gap-2 px-5 py-3 text-xs font-medium transition-all duration-200 border-b-2 -mb-px ${
                              expandedTab === "style"
                                ? "border-purple-500 text-purple-400"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <Zap className="w-3.5 h-3.5" />
                            Style Analysis
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 pr-4">
                        {niche.status === "extracted" && (
                          <button
                            onClick={() => analyzeMutation.mutate(niche.id)}
                            disabled={analyzeMutation.isPending}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold
                              bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 transition-all"
                          >
                            {analyzeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
                            Analyze Style
                          </button>
                        )}
                        <button
                          onClick={() => retrainMutation.mutate(niche.id)}
                          disabled={retrainMutation.isPending}
                          className="flat-btn-ghost text-[11px] px-3 py-1.5 inline-flex items-center gap-1.5"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Reset
                        </button>
                      </div>
                    </div>

                    {expandedTab === "videos" && (
                      <div className="p-5">
                        {!nicheVideos ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading videos...
                          </div>
                        ) : nicheVideos.length === 0 ? (
                          <div className="flex flex-col items-center gap-3 py-4">
                            <p className="text-sm text-muted-foreground">No video transcripts extracted yet.</p>
                            <button
                              onClick={() => extractMutation.mutate(niche.id)}
                              disabled={extractMutation.isPending}
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold
                                bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all"
                            >
                              {extractMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                              Extract Transcripts
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {nicheVideos.map((video) => (
                              <div key={video.id} className="rounded-xl border border-[#1a1a1a] overflow-hidden">
                                <button
                                  onClick={() => setExpandedTranscript(expandedTranscript === video.id ? null : video.id)}
                                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-[rgba(255,255,255,0.05)] transition-colors duration-200"
                                >
                                  <img
                                    src={`https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`}
                                    alt={video.title}
                                    className="w-20 h-[45px] rounded-md object-cover shrink-0 bg-black/20"
                                    loading="lazy"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">{video.title}</div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-[10px] text-muted-foreground">{video.wordCount?.toLocaleString()} words</span>
                                      <a
                                        href={`https://www.youtube.com/watch?v=${video.videoId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                                      >
                                        <ExternalLink className="w-2.5 h-2.5" />
                                        YouTube
                                      </a>
                                    </div>
                                  </div>
                                  <div className="shrink-0">
                                    {expandedTranscript === video.id ? (
                                      <EyeOff className="w-4 h-4 text-muted-foreground" />
                                    ) : (
                                      <Eye className="w-4 h-4 text-muted-foreground" />
                                    )}
                                  </div>
                                </button>
                                {expandedTranscript === video.id && (
                                  <div className="border-t border-[#1a1a1a] p-4 animate-in fade-in duration-200">
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Full Transcript</div>
                                    <div className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                      {video.transcript}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {expandedTab === "style" && niche.styleProfile && (
                      <div className="p-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {[
                            { label: "Tone", value: (niche.styleProfile as any).tone },
                            { label: "Pacing", value: (niche.styleProfile as any).pacing },
                            { label: "Vocabulary", value: (niche.styleProfile as any).vocabulary },
                            { label: "Narrative Voice", value: (niche.styleProfile as any).narrativeVoice },
                            { label: "Hook Style", value: (niche.styleProfile as any).hookStyle },
                            { label: "Structure", value: (niche.styleProfile as any).structurePattern },
                            { label: "Dramatic Techniques", value: (niche.styleProfile as any).dramaticTechniques },
                            { label: "Unique Qualities", value: (niche.styleProfile as any).uniqueQualities },
                          ].filter(item => item.value).map((item) => (
                            <div key={item.label} className="rounded-xl p-3 border border-[#1a1a1a]">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{item.label}</div>
                              <div className="text-xs leading-relaxed">{item.value}</div>
                            </div>
                          ))}
                        </div>
                        {(niche.styleProfile as any).signaturePhrases?.length > 0 && (
                          <div className="mt-3">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Signature Phrases</div>
                            <div className="flex flex-wrap gap-1.5">
                              {((niche.styleProfile as any).signaturePhrases as string[]).map((phrase, i) => (
                                <span key={i} className="text-[11px] px-2.5 py-1 rounded-lg border border-[#1a1a1a]">
                                  "{phrase}"
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {(niche.styleProfile as any).writingInstructions && (
                          <div className="mt-4 rounded-xl p-4 border border-[#1a1a1a]">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Writing Instructions</div>
                            <div className="text-xs leading-relaxed text-muted-foreground">
                              {(niche.styleProfile as any).writingInstructions}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete niche?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete "{deleteTarget?.name}" and its trained style profile.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

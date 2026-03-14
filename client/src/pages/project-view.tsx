import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getApiHeaders } from "@/lib/api-keys";
import {
  ArrowLeft, Sparkles, Play, Pause, Plane, MapPin, User, Eye,
  Camera, Clock, Palette, Image, Loader2, RefreshCw, Download,
  Crosshair, Sun, CloudSun, Film, ChevronRight, ArrowRight,
  ChevronLeft, X, RotateCcw, Video, FileDown, ImageIcon, Film as FilmIcon, Layers,
  DollarSign, FileText, ChevronDown, MessageSquare, Send, Volume2, Mic,
  CheckSquare, Square, Zap, AlertTriangle, Pencil, Crown, Star, ChevronUp, Settings2, BookOpen,
  Maximize, Users, Trash2
} from "lucide-react";
import type { Project, Scene, GeneratedImage, ScriptAnalysis } from "@shared/schema";
import { useState, useEffect, useCallback, useRef } from "react";

const COST_ANALYSIS_BASE = 0.50;

function proxyUrl(url: string | null | undefined): string {
  if (!url) return "";
  return `/api/proxy-media?url=${encodeURIComponent(url)}`;
}

type ModelTier = "budget" | "mid" | "premium";

interface VideoModel {
  id: string;
  name: string;
  apiModel: string;
  duration: number;
  quality: string;
  costPerClip: number;
  description: string;
  tier: ModelTier;
}

const VIDEO_MODELS: VideoModel[] = [
  { id: "grok", name: "Grok Imagine Video", apiModel: "grok-imagine-image-to-video", duration: 6, quality: "720p", costPerClip: 0.064, description: "Fast, affordable 6s clips at 720p", tier: "budget" },
  { id: "hailuo", name: "Hailuo 2.3 Fast", apiModel: "MiniMax-Hailuo-2.3-Fast", duration: 6, quality: "768p", costPerClip: 0.167, description: "MiniMax 6s clips — great motion and expressions", tier: "mid" },
  { id: "veo31", name: "Veo 3.1 Quality", apiModel: "veo3.1-fast", duration: 8, quality: "1080p", costPerClip: 0.168, description: "Google 8s clips at 1080p with cinematic motion", tier: "mid" },
  { id: "seedance", name: "Seedance 1.5 Pro", apiModel: "seedance-1.5-pro", duration: 8, quality: "720p", costPerClip: 0.198, description: "ByteDance cinematic 8s clips with camera control", tier: "mid" },
  { id: "ltx23", name: "LTX 2.3", apiModel: "ltx-2-3-fast", duration: 8, quality: "1080p", costPerClip: 0.32, description: "Lightricks 8s clips at 1080p — fast, cinematic with camera motion", tier: "mid" },
  { id: "sora2pro", name: "Sora 2 Pro", apiModel: "sora-2-pro", duration: 15, quality: "1080p", costPerClip: 0.958, description: "OpenAI premium 15s HD with physics-accurate motion", tier: "premium" },
  { id: "kling", name: "Kling 3.0", apiModel: "kling-v3-image-to-video", duration: 15, quality: "1080p", costPerClip: 1.50, description: "Premium 15s at 1080p — maximum duration, best motion", tier: "premium" },
];

interface ImageModel {
  id: string;
  name: string;
  apiModel: string;
  quality: string;
  resolution: string;
  costPerImage: number;
  description: string;
  maxRefImages: number;
  tier: ModelTier;
}

const IMAGE_MODELS: ImageModel[] = [
  { id: "nanobanana", name: "NanoBanana Pro", apiModel: "gemini-3-pro-image-preview", quality: "4K", resolution: "4K", costPerImage: 0.05, description: "Gemini-powered 4K photorealistic images — proven quality", maxRefImages: 3, tier: "mid" },
];

const TIER_COLORS: Record<ModelTier, { border: string; bg: string; text: string; label: string }> = {
  budget: { border: "border-emerald-500/40", bg: "from-emerald-500/10 to-emerald-500/5", text: "text-emerald-400", label: "Budget" },
  mid: { border: "border-blue-500/40", bg: "from-blue-500/10 to-blue-500/5", text: "text-blue-400", label: "Mid-Tier" },
  premium: { border: "border-amber-500/40", bg: "from-amber-500/10 to-amber-500/5", text: "text-amber-400", label: "Premium" },
};

const COST_ANALYSIS_PER_SCENE = 0.30;

function formatCost(amount: number): string {
  if (amount < 0.01) return "<$0.01";
  return `$${amount.toFixed(2)}`;
}

interface AnalysisProgress {
  step: string;
  detail: string;
  current: number;
  total: number;
}

interface GenerationProgress {
  status: "submitting" | "polling" | "complete" | "error";
  totalImages: number;
  submitted: number;
  completed: number;
  failed: number;
  currentBatch: number;
  totalBatches: number;
  detail: string;
  startedAt: number;
}

export default function ProjectView() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("analysis");
  const [generatingSceneId, setGeneratingSceneId] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStartTime, setAnalysisStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [genProgress, setGenProgress] = useState<GenerationProgress | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genElapsed, setGenElapsed] = useState(0);
  const [genStartTime, setGenStartTime] = useState<number | null>(null);

  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", id],
    refetchInterval: isAnalyzing ? 4000 : false,
  });

  const { data: scenes, isLoading: scenesLoading } = useQuery<Scene[]>({
    queryKey: ["/api/projects", id, "scenes"],
    enabled: !!project,
    refetchInterval: isAnalyzing ? 3000 : false,
  });

  const { data: images, isLoading: imagesLoading, refetch: refetchImages } = useQuery<GeneratedImage[]>({
    queryKey: ["/api/projects", id, "images"],
    enabled: !!project,
  });

  const { data: charRefsData } = useQuery<any[]>({
    queryKey: ["/api/projects", id, "character-references"],
    enabled: !!project && project.status !== "draft",
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.some((r: any) => r.status === "generating") ? 5000 : false;
    },
  });

  const hasGeneratingImages = images?.some((img) => img.status === "pending" || img.status === "generating");
  const hasGeneratingVideos = images?.some((img) => img.videoStatus === "generating");
  const [regeneratingImageId, setRegeneratingImageId] = useState<string | null>(null);
  const [videoGeneratingImageId, setVideoGeneratingImageId] = useState<string | null>(null);

  const [regenSeenGenerating, setRegenSeenGenerating] = useState(false);
  const prevRegenIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (regeneratingImageId !== prevRegenIdRef.current) {
      prevRegenIdRef.current = regeneratingImageId;
      setRegenSeenGenerating(false);
    }
    if (!regeneratingImageId || !images) return;
    const img = images.find(i => i.id === regeneratingImageId);
    if (!img) return;
    const isActive = img.status === "generating" || img.status === "pending";
    if (isActive) {
      setRegenSeenGenerating(true);
    } else if (regenSeenGenerating) {
      setRegeneratingImageId(null);
      setRegenSeenGenerating(false);
    }
  }, [regeneratingImageId, images, regenSeenGenerating]);
  const [animatingSceneId, setAnimatingSceneId] = useState<string | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSmartRegenerating, setIsSmartRegenerating] = useState(false);
  const [showSmartRegenPicker, setShowSmartRegenPicker] = useState(false);
  const [smartRegenSelectedScenes, setSmartRegenSelectedScenes] = useState<Set<string>>(new Set());
  const [selectedVideoModel, setSelectedVideoModel] = useState<string>("grok");
  const [selectedVideoDuration, setSelectedVideoDuration] = useState<number | null>(null);
  const [isGeneratingAllVideos, setIsGeneratingAllVideos] = useState(false);
  const currentVideoModel = VIDEO_MODELS.find(m => m.id === selectedVideoModel) || VIDEO_MODELS[0];
  const [selectedImageModel, setSelectedImageModel] = useState<string>("nanobanana");
  const currentImageModel = IMAGE_MODELS.find(m => m.id === selectedImageModel) || IMAGE_MODELS[0];
  const [voiceoverPlaying, setVoiceoverPlaying] = useState(false);
  const voiceoverAudioRef = useRef<HTMLAudioElement | null>(null);
  const [showImageModelPicker, setShowImageModelPicker] = useState(false);
  const [showVideoModelPicker, setShowVideoModelPicker] = useState(false);

  useEffect(() => {
    if (!hasGeneratingImages || !id) return;
    const interval = setInterval(async () => {
      try {
        await apiRequest("POST", `/api/projects/${id}/poll-images`);
        queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "images"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      } catch (e) {}
    }, 6000);
    return () => clearInterval(interval);
  }, [hasGeneratingImages, id]);

  useEffect(() => {
    if (!hasGeneratingVideos || !id) return;
    const interval = setInterval(async () => {
      try {
        await apiRequest("POST", `/api/projects/${id}/poll-videos`);
        queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "images"] });
      } catch (e) {}
    }, 8000);
    return () => clearInterval(interval);
  }, [hasGeneratingVideos, id]);

  useEffect(() => {
    if (!project || projectLoading) return;
    if (project.status === "analyzing" && !isAnalyzing) {
      setIsAnalyzing(true);
      if (!analysisStartTime) {
        setAnalysisStartTime(Date.now());
      }
      const progress = project.analysisProgress as AnalysisProgress | null;
      if (progress) {
        setAnalysisProgress(progress);
      }
    }
  }, [project, projectLoading]);

  useEffect(() => {
    if (!isAnalyzing || !id) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${id}/analyze-progress`, { headers: getApiHeaders() });
        const data = await res.json();
        if (data) {
          setAnalysisProgress(data);
          if (data.step === "complete") {
            setIsAnalyzing(false);
            setAnalysisProgress(null);
            setAnalysisStartTime(null);
            queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
            queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "scenes"] });
            toast({ title: "Analysis complete", description: "Your story has been fully analyzed." });
            setActiveTab("storyboard");
          } else if (data.step === "error") {
            setIsAnalyzing(false);
            setAnalysisProgress(null);
            setAnalysisStartTime(null);
            queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
            toast({ title: "Analysis failed", description: data.detail || "Something went wrong.", variant: "destructive" });
          }
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [isAnalyzing, id]);

  useEffect(() => {
    if (!isAnalyzing || !analysisStartTime) {
      return;
    }
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - analysisStartTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [isAnalyzing, analysisStartTime]);

  useEffect(() => {
    if (!project || projectLoading) return;
    if (project.status === "generating" && !isGenerating) {
      setIsGenerating(true);
      if (!genStartTime) setGenStartTime(Date.now());
    }
  }, [project, projectLoading]);

  useEffect(() => {
    if (!isGenerating || !id) return;
    const fetchProgress = async () => {
      try {
        const res = await fetch(`/api/projects/${id}/generation-progress`, { headers: getApiHeaders() });
        const data: GenerationProgress | null = await res.json();
        if (data) {
          setGenProgress(data);
          if (data.status === "complete" || data.status === "error") {
            setIsGenerating(false);
            setGenProgress(data);
            setGenStartTime(null);
            queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "images"] });
            queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
            if (data.status === "complete") {
              toast({ title: "Generation complete", description: data.detail });
            } else {
              toast({ title: "Generation error", description: data.detail, variant: "destructive" });
            }
            setTimeout(() => setGenProgress(null), 10000);
          }
        } else if (!hasGeneratingImages) {
          setIsGenerating(false);
          setGenProgress(null);
          setGenStartTime(null);
        }
      } catch {}
    };
    fetchProgress();
    const interval = setInterval(fetchProgress, 3000);
    return () => clearInterval(interval);
  }, [isGenerating, id]);

  useEffect(() => {
    if (!isGenerating || !genStartTime) return;
    const timer = setInterval(() => {
      setGenElapsed(Math.floor((Date.now() - genStartTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [isGenerating, genStartTime]);

  const formatElapsed = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const startAnalysis = useCallback(async () => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalysisStartTime(Date.now());
    setElapsedSeconds(0);
    setAnalysisProgress({ step: "reading", detail: "Starting analysis...", current: 0, total: 1 });

    try {
      await apiRequest("POST", `/api/projects/${id}/analyze`);
    } catch (err: any) {
      toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
      setIsAnalyzing(false);
      setAnalysisProgress(null);
      setAnalysisStartTime(null);
    }
  }, [id, isAnalyzing, toast]);

  const generateSceneMutation = useMutation({
    mutationFn: async (sceneId: string) => {
      setGeneratingSceneId(sceneId);
      const res = await apiRequest("POST", `/api/projects/${id}/scenes/${sceneId}/generate`, { imageModel: selectedImageModel });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "images"] });
      if (data.allFailed) {
        toast({ title: "Generation failed", description: data.error || "All images failed to generate.", variant: "destructive" });
      } else {
        toast({ title: "Generation started", description: "Image sequence is being generated for this scene." });
      }
      setGeneratingSceneId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
      setGeneratingSceneId(null);
    },
  });

  const generateAllMutation = useMutation({
    mutationFn: async (opts?: { forceRegenerate?: boolean }) => {
      const res = await apiRequest("POST", `/api/projects/${id}/generate-all`, { imageModel: selectedImageModel, forceRegenerate: opts?.forceRegenerate || false });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.started) {
        setIsGenerating(true);
        setGenStartTime(Date.now());
        setGenProgress(data.progress || null);
        toast({ title: "Generation started", description: `Submitting ${data.total || 0} images in ${data.batches || 0} batches...` });
      } else if (data.allFailed) {
        toast({ title: "Generation failed", description: data.error || "All images failed to generate.", variant: "destructive" });
      } else {
        toast({ title: "Nothing to generate", description: data.message || "All scenes already have completed images." });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "images"] });
    },
    onError: (err: Error) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const [showRegenAllConfirm, setShowRegenAllConfirm] = useState(false);

  const retryFailedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/projects/${id}/retry-failed`, { imageModel: selectedImageModel });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.started) {
        setIsGenerating(true);
        setGenStartTime(Date.now());
        setGenProgress(data.progress || null);
        toast({ title: "Retry started", description: `Re-submitting ${data.total || 0} failed/pending images in ${data.batches || 0} waves...` });
      } else {
        toast({ title: "Nothing to retry", description: data.message || "No failed or pending images found." });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "images"] });
    },
    onError: (err: Error) => {
      toast({ title: "Retry failed", description: err.message, variant: "destructive" });
    },
  });

  const regenerateImage = useCallback(async (imageId: string, feedback?: string) => {
    if (!id) return;
    setRegeneratingImageId(imageId);
    try {
      await apiRequest("POST", `/api/projects/${id}/images/${imageId}/regenerate`, { feedback: feedback || undefined, imageModel: selectedImageModel });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "images"] });
      toast({
        title: feedback ? "Applying feedback and regenerating..." : "Smart regeneration started",
        description: feedback ? "AI is modifying the prompt based on your feedback..." : "AI is analyzing what went wrong and creating an improved prompt...",
      });
    } catch (err: any) {
      toast({ title: "Regeneration failed", description: err.message, variant: "destructive" });
      setRegeneratingImageId(null);
    }
  }, [id, toast, selectedImageModel]);

  const [regeneratingSceneId, setRegeneratingSceneId] = useState<string | null>(null);

  const regenerateSceneWithFeedback = useCallback(async (sceneId: string, feedback: string) => {
    if (!id) return;
    setRegeneratingSceneId(sceneId);
    try {
      await apiRequest("POST", `/api/projects/${id}/scenes/${sceneId}/regenerate-with-feedback`, { feedback, imageModel: selectedImageModel });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "images"] });
      toast({
        title: "Regenerating entire scene with feedback",
        description: "AI is applying your feedback to all images in this scene...",
      });
    } catch (err: any) {
      toast({ title: "Scene regeneration failed", description: err.message, variant: "destructive" });
    } finally {
      setRegeneratingSceneId(null);
    }
  }, [id, toast, selectedImageModel]);

  const regenerateImageWithConsistency = useCallback(async (imageId: string) => {
    if (!id) return;
    setRegeneratingImageId(imageId);
    try {
      await apiRequest("POST", `/api/projects/${id}/images/${imageId}/regenerate-with-consistency`, { imageModel: selectedImageModel });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "images"] });
      toast({
        title: "Regenerating with character consistency",
        description: "Using character reference portraits for consistent look...",
      });
    } catch (err: any) {
      toast({ title: "Consistency regeneration failed", description: err.message, variant: "destructive" });
      setRegeneratingImageId(null);
    }
  }, [id, toast, selectedImageModel]);

  const deleteImage = useCallback(async (imageId: string) => {
    if (!id) return;
    try {
      await apiRequest("DELETE", `/api/projects/${id}/images/${imageId}`);
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "images"] });
      toast({ title: "Image deleted" });
    } catch (err: any) {
      toast({ title: "Failed to delete image", description: err.message, variant: "destructive" });
    }
  }, [id, toast]);

  const removeVideo = useCallback(async (imageId: string) => {
    if (!id) return;
    try {
      await apiRequest("POST", `/api/projects/${id}/images/${imageId}/remove-video`);
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "images"] });
      toast({ title: "Video clip removed" });
    } catch (err: any) {
      toast({ title: "Failed to remove video", description: err.message, variant: "destructive" });
    }
  }, [id, toast]);

  const regenerateSceneWithConsistency = useCallback(async (sceneId: string) => {
    if (!id) return;
    setRegeneratingSceneId(sceneId);
    try {
      await apiRequest("POST", `/api/projects/${id}/scenes/${sceneId}/regenerate-with-consistency`, { imageModel: selectedImageModel });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "images"] });
      toast({
        title: "Regenerating entire scene with character consistency",
        description: "All images in this scene will use character reference portraits...",
      });
    } catch (err: any) {
      toast({ title: "Scene consistency regeneration failed", description: err.message, variant: "destructive" });
    } finally {
      setRegeneratingSceneId(null);
    }
  }, [id, toast, selectedImageModel]);

  const { data: smartRegenProgress } = useQuery<{ status: string; total: number; completed: number; failed: number; detail: string }>({
    queryKey: ["/api/projects", id, "smart-regenerate", "progress"],
    enabled: isSmartRegenerating,
    refetchInterval: 2000,
  });

  useEffect(() => {
    if (smartRegenProgress?.status === "complete") {
      setTimeout(() => {
        setIsSmartRegenerating(false);
        queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "images"] });
      }, 3000);
    }
  }, [smartRegenProgress]);

  const smartRegenerateMutation = useMutation({
    mutationFn: async (sceneIds?: string[]) => {
      const res = await apiRequest("POST", `/api/projects/${id}/smart-regenerate`, {
        imageModel: selectedImageModel,
        sceneIds: sceneIds && sceneIds.length > 0 ? sceneIds : undefined,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.started) {
        setIsSmartRegenerating(true);
        setShowSmartRegenPicker(false);
        setSmartRegenSelectedScenes(new Set());
        toast({ title: "Smart regeneration started", description: `AI is analyzing ${data.total} failed image${data.total !== 1 ? "s" : ""} and creating improved prompts...` });
      } else {
        toast({ title: "Nothing to regenerate", description: data.message || "No failed images found." });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "images"] });
    },
    onError: (err: Error) => {
      toast({ title: "Smart regeneration failed", description: err.message, variant: "destructive" });
    },
  });

  const generateVideoFromImage = useCallback(async (imageId: string, modelOverride?: string) => {
    if (!id) return;
    setVideoGeneratingImageId(imageId);
    try {
      const model = modelOverride || selectedVideoModel;
      const modelConfig = VIDEO_MODELS.find(m => m.id === model) || VIDEO_MODELS[0];
      const body: any = { videoModel: model };
      if (selectedVideoDuration && model === "kling") {
        body.videoDuration = selectedVideoDuration;
      }
      const res = await apiRequest("POST", `/api/projects/${id}/images/${imageId}/generate-video`, body);
      const updatedImage = await res.json();
      queryClient.setQueryData(
        ["/api/projects", id, "images"],
        (old: any[] | undefined) => old ? old.map(img => img.id === imageId ? updatedImage : img) : old
      );
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "images"] });
      toast({ title: "Creating motion", description: `Video generation started using ${modelConfig.name}.` });
    } catch (err: any) {
      toast({ title: "Video generation failed", description: err.message, variant: "destructive" });
    } finally {
      setVideoGeneratingImageId(null);
    }
  }, [id, toast, selectedVideoModel, selectedVideoDuration]);

  const regenerateVideoWithFeedback = useCallback(async (imageId: string, feedback: string, modelOverride?: string) => {
    if (!id) return;
    setVideoGeneratingImageId(imageId);
    try {
      const model = modelOverride || selectedVideoModel;
      const modelConfig = VIDEO_MODELS.find(m => m.id === model) || VIDEO_MODELS[0];
      const body: any = { feedback, videoModel: model };
      if (selectedVideoDuration && model === "kling") {
        body.videoDuration = selectedVideoDuration;
      }
      const res = await apiRequest("POST", `/api/projects/${id}/images/${imageId}/regenerate-video-with-feedback`, body);
      const updatedImage = await res.json();
      queryClient.setQueryData(
        ["/api/projects", id, "images"],
        (old: any[] | undefined) => old ? old.map(img => img.id === imageId ? updatedImage : img) : old
      );
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "images"] });
      toast({ title: "Regenerating motion", description: `Video regeneration with feedback started using ${modelConfig.name}.` });
    } catch (err: any) {
      toast({ title: "Video regeneration failed", description: err.message, variant: "destructive" });
    } finally {
      setVideoGeneratingImageId(null);
    }
  }, [id, toast, selectedVideoModel, selectedVideoDuration]);

  const regenerateSceneVideosWithFeedback = useCallback(async (sceneId: string, feedback: string) => {
    if (!id) return;
    setAnimatingSceneId(sceneId);
    try {
      const body: any = { feedback, videoModel: selectedVideoModel };
      if (selectedVideoDuration && selectedVideoModel === "kling") {
        body.videoDuration = selectedVideoDuration;
      }
      const res = await apiRequest("POST", `/api/projects/${id}/scenes/${sceneId}/regenerate-videos-with-feedback`, body);
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "images"] });
      toast({ title: "Regenerating scene motion", description: `Started ${data.started} video${data.started !== 1 ? "s" : ""} with feedback using ${currentVideoModel.name}.` });
    } catch (err: any) {
      toast({ title: "Scene video regeneration failed", description: err.message, variant: "destructive" });
    } finally {
      setAnimatingSceneId(null);
    }
  }, [id, toast, selectedVideoModel, selectedVideoDuration, currentVideoModel]);

  const animateAllScene = useCallback(async (sceneId: string) => {
    if (!id) return;
    setAnimatingSceneId(sceneId);
    try {
      const animateBody: any = { videoModel: selectedVideoModel };
      if (selectedVideoDuration && selectedVideoModel === "kling") {
        animateBody.videoDuration = selectedVideoDuration;
      }
      const res = await apiRequest("POST", `/api/projects/${id}/scenes/${sceneId}/animate-all`, animateBody);
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "images"] });
      toast({ title: "Animating scene", description: `Started ${data.started} video${data.started !== 1 ? "s" : ""} with ${currentVideoModel.name}.` });
    } catch (err: any) {
      toast({ title: "Animate all failed", description: err.message, variant: "destructive" });
    } finally {
      setAnimatingSceneId(null);
    }
  }, [id, toast, selectedVideoModel, currentVideoModel]);

  const generateAllVideos = useCallback(async () => {
    if (!id) return;
    setIsGeneratingAllVideos(true);
    try {
      const body: any = { videoModel: selectedVideoModel };
      if (selectedVideoDuration && selectedVideoModel === "kling") {
        body.videoDuration = selectedVideoDuration;
      }
      const res = await apiRequest("POST", `/api/projects/${id}/animate-all-videos`, body);
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "images"] });
      toast({
        title: "Generating all videos",
        description: `Started ${data.started} video${data.started !== 1 ? "s" : ""} with ${currentVideoModel.name}. Estimated cost: ${formatCost(data.estimatedCost)}`,
      });
    } catch (err: any) {
      toast({ title: "Generate all videos failed", description: err.message, variant: "destructive" });
    } finally {
      setIsGeneratingAllVideos(false);
    }
  }, [id, toast, selectedVideoModel, selectedVideoDuration, currentVideoModel]);

  const handleExport = useCallback(async () => {
    if (!id) return;
    setIsExporting(true);
    try {
      const res = await fetch(`/api/projects/${id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getApiHeaders() },
        body: JSON.stringify({
          includeImages: true,
          includeClips: false,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Export failed" }));
        throw new Error(errData.error || "Export failed");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      a.download = filenameMatch ? filenameMatch[1] : "storyboard_export.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: "Export complete", description: "Your PDF storyboard has been downloaded." });
      setShowExportDialog(false);
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  }, [id, toast]);

  const analysis = project?.analysis as ScriptAnalysis | null;
  const hasCharacters = (analysis?.characters?.length ?? 0) > 0;
  const expectedCharRefs = hasCharacters ? analysis!.characters.length * 3 : 0;
  const completedCharRefs = charRefsData?.filter((r: any) => r.status === "completed" && r.imageUrl)?.length ?? 0;
  const charRefsReady = !hasCharacters || completedCharRefs >= expectedCharRefs;
  const totalScenes = scenes?.length || 0;
  const completedImages = images?.filter((img) => img.status === "completed").length || 0;
  const failedImages = images?.filter((img) => img.status === "failed").length || 0;
  const totalExpected = scenes?.reduce((sum, s) => sum + (s.expectedImages || 4), 0) || 0;
  const progress = totalExpected > 0 ? Math.round((completedImages / totalExpected) * 100) : 0;

  const failedImageCount = images?.filter((img) => img.status === "failed").length || 0;
  const pendingImageCount = images?.filter((img) => img.status === "pending").length || 0;
  const retryableCount = failedImageCount + pendingImageCount;
  const remainingImages = totalExpected - (images?.filter((img) => img.status === "completed" || img.status === "generating" || img.status === "pending").length || 0);
  const imageGenCost = Math.max(0, remainingImages) * currentImageModel.costPerImage;
  const totalImageCost = totalExpected * currentImageModel.costPerImage;
  const totalVideoCost = totalExpected * currentVideoModel.costPerClip;
  const videoEligibleCount = images?.filter(
    (img) => img.status === "completed" && img.imageUrl && (!img.videoStatus || img.videoStatus === "failed")
  ).length || 0;
  const videoEligibleCost = videoEligibleCount * currentVideoModel.costPerClip;
  const completedClipsCount = images?.filter(
    (img) => img.videoStatus === "completed" && img.videoUrl
  ).length || 0;
  const analysisCost = totalScenes > 0 ? COST_ANALYSIS_BASE + (totalScenes * COST_ANALYSIS_PER_SCENE) : 0;
  const totalProjectCost = analysisCost + totalImageCost + totalVideoCost;

  const trackedAnalysisCost = (project as any)?.analysisCost || 0;
  const trackedImageCost = (project as any)?.imageGenerationCost || 0;
  const trackedVideoCost = (project as any)?.videoGenerationCost || 0;
  const hasTrackedCosts = trackedAnalysisCost > 0 || trackedImageCost > 0 || trackedVideoCost > 0;

  const analysisSpent = hasTrackedCosts ? trackedAnalysisCost : ((project?.status !== "draft" && totalScenes > 0) ? analysisCost : 0);
  const imagesSpent = hasTrackedCosts ? trackedImageCost : ((images?.filter((img) => img.status === "completed").length || 0) * currentImageModel.costPerImage);
  const videosSpent = hasTrackedCosts ? trackedVideoCost : ((images?.filter(img => img.videoStatus === "completed").reduce((sum, img) => {
    const model = VIDEO_MODELS.find(m => m.id === (img as any).videoModel) || VIDEO_MODELS[0];
    return sum + model.costPerClip;
  }, 0)) || 0);
  const totalSpent = analysisSpent + imagesSpent + videosSpent;

  if (projectLoading) {
    return (
      <div className="min-h-full p-6 md:p-8">
        <div className="max-w-6xl mx-auto space-y-4">
          <Skeleton className="h-8 w-64 rounded-xl" />
          <Skeleton className="h-4 w-96 rounded-lg" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-full p-6 flex items-center justify-center">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-full p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        <Link href="/">
          <Button variant="ghost" className="mb-5 -ml-2 text-muted-foreground hover:text-foreground transition-colors duration-200 rounded-xl" data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            All Projects
          </Button>
        </Link>

        <div className="flex flex-row items-start justify-between gap-4 flex-wrap mb-6 glass-card rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="icon-box bg-gradient-to-br from-primary/15 to-primary/5 ring-primary/20 w-11 h-11 glow-sm">
              <Plane className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight gradient-text" data-testid="text-project-title">
                {project.title}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {totalScenes} scenes &middot; {completedImages}/{totalExpected} images generated
                {totalSpent > 0 && (
                  <span className="text-green-400/80" title={`Analysis: ${formatCost(analysisSpent)} | Images: ${formatCost(imagesSpent)} | Videos: ${formatCost(videosSpent)}`}>
                    {" "}&middot; {formatCost(totalSpent)} spent
                  </span>
                )}
                {project.voiceoverUrl && (
                  <span className="inline-flex items-center gap-1 ml-2 text-blue-400">
                    <Volume2 className="w-3 h-3" /> Voiceover
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {project.status === "draft" && (
              <button
                onClick={startAnalysis}
                disabled={isAnalyzing}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold gradient-btn text-white border-0 glow-sm hover:glow-md transition-all duration-300 active:scale-[0.97] disabled:opacity-60"
                data-testid="button-analyze"
              >
                {isAnalyzing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Analyzing...</>
                ) : (
                  <><Sparkles className="w-4 h-4" />Analyze Script</>
                )}
              </button>
            )}
            {project.status !== "draft" && scenes && scenes.length > 0 && (
              <>
                <button
                  onClick={startAnalysis}
                  disabled={isAnalyzing}
                  className="ghost-btn disabled:opacity-50"
                  data-testid="button-reanalyze"
                >
                  {isAnalyzing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Analyzing...</>
                  ) : (
                    <><RefreshCw className="w-4 h-4" />Re-analyze</>
                  )}
                </button>
                <button
                  onClick={() => generateAllMutation.mutate()}
                  disabled={generateAllMutation.isPending || isGenerating || !charRefsReady}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold gradient-btn text-white border-0 glow-sm hover:glow-md transition-all duration-300 active:scale-[0.97] disabled:opacity-60"
                  data-testid="button-generate-all"
                  title={!charRefsReady ? `Generate character portraits first (${completedCharRefs}/${expectedCharRefs} done)` : `Estimated cost: ${formatCost(imageGenCost)} for ${Math.max(0, remainingImages)} images`}
                >
                  {generateAllMutation.isPending || isGenerating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Generating...</>
                  ) : !charRefsReady ? (
                    <><Users className="w-4 h-4" />Character Portraits Required ({completedCharRefs}/{expectedCharRefs})</>
                  ) : (
                    <><Play className="w-4 h-4" />Generate All Images ({formatCost(imageGenCost)})</>
                  )}
                </button>
                {completedImages > 0 && !isGenerating && !generateAllMutation.isPending && charRefsReady && (
                  <button
                    onClick={() => setShowRegenAllConfirm(true)}
                    disabled={generateAllMutation.isPending || isGenerating}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all duration-300 active:scale-[0.97] disabled:opacity-60"
                    title={`Delete all ${completedImages} completed images and regenerate from scratch — estimated cost: ${formatCost(totalExpected * currentImageModel.costPerImage)}`}
                  >
                    <RotateCcw className="w-4 h-4" />Regenerate All Images
                  </button>
                )}
                {retryableCount > 0 && !isGenerating && !generateAllMutation.isPending && charRefsReady && (
                  <button
                    onClick={() => retryFailedMutation.mutate()}
                    disabled={retryFailedMutation.isPending || isGenerating}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/20 transition-all duration-300 active:scale-[0.97] disabled:opacity-60"
                    title={`Re-submit ${retryableCount} failed/pending images using existing prompts — estimated cost: ${formatCost(retryableCount * currentImageModel.costPerImage)}`}
                  >
                    {retryFailedMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />Retrying...</>
                    ) : (
                      <><Play className="w-4 h-4" />Retry {retryableCount} Failed/Pending ({formatCost(retryableCount * currentImageModel.costPerImage)})</>
                    )}
                  </button>
                )}
                {failedImageCount > 0 && (
                  <button
                    onClick={() => {
                      if (showSmartRegenPicker) {
                        setShowSmartRegenPicker(false);
                        setSmartRegenSelectedScenes(new Set());
                      } else {
                        const scenesWithFailed = new Set(
                          (images || []).filter(img => img.status === "failed").map(img => img.sceneId)
                        );
                        setSmartRegenSelectedScenes(scenesWithFailed);
                        setShowSmartRegenPicker(true);
                      }
                    }}
                    disabled={smartRegenerateMutation.isPending || isSmartRegenerating}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/20 transition-all duration-300 active:scale-[0.97] disabled:opacity-60"
                    title={`AI will analyze ${failedImageCount} failed images, diagnose prompt issues, and regenerate with improved prompts`}
                  >
                    {smartRegenerateMutation.isPending || isSmartRegenerating ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />Smart Fixing {failedImageCount}...</>
                    ) : (
                      <><RefreshCw className="w-4 h-4" />Smart Fix {failedImageCount} Failed</>
                    )}
                  </button>
                )}
                {videoEligibleCount > 0 && !isGeneratingAllVideos && (
                  <button
                    onClick={generateAllVideos}
                    disabled={isGeneratingAllVideos}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 transition-all duration-300 active:scale-[0.97] disabled:opacity-60"
                    title={`Generate videos for ${videoEligibleCount} images using ${currentVideoModel.name} — estimated cost: ${formatCost(videoEligibleCost)}`}
                  >
                    <Video className="w-4 h-4" />Generate All Videos ({videoEligibleCount}) ~{formatCost(videoEligibleCost)}
                  </button>
                )}
                {isGeneratingAllVideos && (
                  <button
                    disabled
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-purple-500/10 border border-purple-500/20 text-purple-400 opacity-60"
                  >
                    <Loader2 className="w-4 h-4 animate-spin" />Generating Videos...
                  </button>
                )}
                {completedImages > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 transition-all duration-300 active:scale-[0.97]">
                        <Download className="w-4 h-4" />Download / Export
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64 glass-surface border border-white/10">
                      <DropdownMenuItem
                        onClick={() => setShowExportDialog(true)}
                        className="cursor-pointer"
                      >
                        <FileDown className="w-4 h-4 mr-2" />
                        Export PDF Storyboard
                      </DropdownMenuItem>
                      {completedImages > 0 && (
                        <DropdownMenuItem
                          onClick={() => window.open(`/api/projects/${id}/download?type=images`, "_blank")}
                          className="cursor-pointer"
                        >
                          <Image className="w-4 h-4 mr-2" />
                          Download All Images ({completedImages})
                        </DropdownMenuItem>
                      )}
                      {completedClipsCount > 0 && (
                        <DropdownMenuItem
                          onClick={() => window.open(`/api/projects/${id}/download?type=clips`, "_blank")}
                          className="cursor-pointer"
                        >
                          <Video className="w-4 h-4 mr-2" />
                          Download All Clips ({completedClipsCount})
                        </DropdownMenuItem>
                      )}
                      {completedImages > 0 && completedClipsCount > 0 && (
                        <DropdownMenuItem
                          onClick={() => window.open(`/api/projects/${id}/download?type=all`, "_blank")}
                          className="cursor-pointer"
                        >
                          <Layers className="w-4 h-4 mr-2" />
                          Download All Images + Clips ({completedImages + completedClipsCount})
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </>
            )}
          </div>
        </div>

        {project.voiceoverUrl && (
          <Card className="mb-4 glass-card rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (!voiceoverAudioRef.current) return;
                  if (voiceoverPlaying) {
                    voiceoverAudioRef.current.pause();
                  } else {
                    voiceoverAudioRef.current.play();
                  }
                  setVoiceoverPlaying(!voiceoverPlaying);
                }}
                className="w-10 h-10 rounded-full gradient-btn flex items-center justify-center shrink-0 glow-sm hover:glow-md transition-all active:scale-95"
              >
                {voiceoverPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Mic className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-sm font-medium">Voiceover</span>
                </div>
                <audio
                  ref={voiceoverAudioRef}
                  src={project.voiceoverUrl}
                  onEnded={() => setVoiceoverPlaying(false)}
                  onPlay={() => setVoiceoverPlaying(true)}
                  onPause={() => setVoiceoverPlaying(false)}
                  controls
                  className="w-full h-8 opacity-80"
                />
              </div>
            </div>
          </Card>
        )}

        {showExportDialog && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center" onClick={() => !isExporting && setShowExportDialog(false)}>
            <Card className="w-full max-w-sm mx-4 p-6 glass-card rounded-2xl animate-scale-in" onClick={(e) => e.stopPropagation()} data-testid="dialog-export">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Export Storyboard PDF</h3>
                {!isExporting && (
                  <button onClick={() => setShowExportDialog(false)} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-[var(--glass-highlight)]">
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                Visual storyboard with all scenes and images, laid out just like the app board.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowExportDialog(false)}
                  disabled={isExporting}
                  className="flex-1 ghost-btn justify-center"
                  data-testid="button-export-cancel"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold gradient-btn text-white border-0 transition-all duration-300 disabled:opacity-60"
                  data-testid="button-export-download"
                >
                  {isExporting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Generating PDF...</>
                  ) : (
                    <><FileDown className="w-4 h-4" />Download PDF</>
                  )}
                </button>
              </div>
            </Card>
          </div>
        )}

        {showRegenAllConfirm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center" onClick={() => setShowRegenAllConfirm(false)}>
            <Card className="w-full max-w-sm mx-4 p-6 glass-card rounded-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-red-400">Regenerate All Images</h3>
                <button onClick={() => setShowRegenAllConfirm(false)} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-[var(--glass-highlight)]">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground mb-2 leading-relaxed">
                This will delete all {completedImages} existing images and regenerate every scene from scratch.
              </p>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                Estimated cost: <span className="text-foreground font-semibold">{formatCost(totalExpected * currentImageModel.costPerImage)}</span> for {totalExpected} images using {currentImageModel.name}.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRegenAllConfirm(false)}
                  className="flex-1 ghost-btn justify-center"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowRegenAllConfirm(false);
                    generateAllMutation.mutate({ forceRegenerate: true });
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-500 hover:bg-red-600 text-white border-0 transition-all duration-300"
                >
                  <RotateCcw className="w-4 h-4" />Regenerate All
                </button>
              </div>
            </Card>
          </div>
        )}

        {isAnalyzing && analysisProgress && (
          <Card className="mb-6 p-4 glass-card rounded-2xl border-primary/10" data-testid="card-analysis-progress">
            <div className="flex items-center gap-3 mb-3">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                <div className="relative w-8 h-8 rounded-full gradient-btn flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" data-testid="text-analysis-step">
                  {analysisProgress.detail}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-muted-foreground">
                    Step {analysisProgress.current} of {analysisProgress.total}
                  </p>
                  <span className="text-xs text-muted-foreground/40">&middot;</span>
                  <p className="text-xs text-muted-foreground tabular-nums" data-testid="text-elapsed-time">
                    <Clock className="w-3 h-3 inline mr-1" />{formatElapsed(elapsedSeconds)}
                  </p>
                </div>
              </div>
            </div>
            <Progress
              value={Math.round((analysisProgress.current / analysisProgress.total) * 100)}
              className="h-1.5 rounded-full"
              data-testid="progress-analysis"
            />
          </Card>
        )}

        {(isGenerating || genProgress) && genProgress && (
          <Card className={`mb-6 p-5 glass-card rounded-2xl ${genProgress.status === "error" ? "border-red-500/20" : genProgress.status === "complete" ? "border-green-500/15" : "border-primary/15"}`}>
            <div className="flex items-center gap-3 mb-4">
              {genProgress.status === "error" ? (
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center ring-1 ring-red-500/20">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
              ) : genProgress.status === "complete" ? (
                <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center ring-1 ring-green-500/20">
                  <CheckSquare className="w-5 h-5 text-green-500" />
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute inset-0 rounded-xl bg-primary/20 animate-ping" />
                  <div className="relative w-10 h-10 rounded-xl gradient-btn flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                  </div>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${genProgress.status === "error" ? "text-red-400" : genProgress.status === "complete" ? "text-green-400" : ""}`}>
                  {genProgress.status === "submitting" ? "Sending images to rendering API..." :
                   genProgress.status === "polling" ? "Waiting for images to finish rendering..." :
                   genProgress.status === "complete" ? "All images generated successfully" : "Generation stopped — check API credits"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {genProgress.status === "submitting" ? `Uploading prompts in batches of 10. Wave ${genProgress.currentBatch} of ${genProgress.totalBatches}.` :
                   genProgress.status === "polling" ? `${genProgress.completed} of ${genProgress.totalImages} images rendered. ${genProgress.failed > 0 ? `${genProgress.failed} failed.` : ""} Checking every 6 seconds.` :
                   genProgress.status === "complete" ? `${genProgress.completed} images completed${genProgress.failed > 0 ? `, ${genProgress.failed} failed` : ""}. Total time: ${formatElapsed(genElapsed)}.` :
                   genProgress.detail}
                </p>
              </div>
              {genStartTime && genProgress.status !== "complete" && (
                <div className="text-xs text-muted-foreground tabular-nums flex-shrink-0 flex items-center gap-1 glass-badge px-2 py-1 rounded-lg">
                  <Clock className="w-3 h-3" />{formatElapsed(genElapsed)}
                </div>
              )}
            </div>

            <div className="grid grid-cols-4 gap-2 mb-3">
              <div className="glass-surface rounded-xl p-3 border border-[var(--glass-border)] text-center">
                <p className="text-lg font-bold tabular-nums">{genProgress.totalImages}</p>
                <p className="text-[10px] text-muted-foreground font-medium">Total</p>
              </div>
              <div className="glass-surface rounded-xl p-3 border border-blue-500/15 text-center">
                <p className="text-lg font-bold tabular-nums text-blue-400">{genProgress.submitted}</p>
                <p className="text-[10px] text-blue-400/60 font-medium">Queued</p>
              </div>
              <div className="glass-surface rounded-xl p-3 border border-green-500/15 text-center relative overflow-hidden">
                {genProgress.status === "polling" && genProgress.completed > 0 && (
                  <div className="absolute inset-0 bg-green-500/5 animate-pulse" />
                )}
                <p className="text-lg font-bold tabular-nums text-green-400 relative">{genProgress.completed}</p>
                <p className="text-[10px] text-green-400/60 font-medium relative">Done</p>
              </div>
              <div className="glass-surface rounded-xl p-3 border border-red-500/15 text-center">
                <p className="text-lg font-bold tabular-nums text-red-400">{genProgress.failed}</p>
                <p className="text-[10px] text-red-400/60 font-medium">Failed</p>
              </div>
            </div>

            {genProgress.totalImages > 0 && (
              <div>
                <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
                  <span>
                    {genProgress.status === "submitting" ? `Submitting wave ${genProgress.currentBatch}/${genProgress.totalBatches}` :
                     genProgress.status === "polling" ? `Rendering ${genProgress.completed + genProgress.failed}/${genProgress.totalImages}` :
                     genProgress.status === "complete" ? "Complete" : "Stopped"}
                  </span>
                  <span className="tabular-nums font-medium">
                    {genProgress.status === "submitting" && genProgress.totalBatches > 0
                      ? `${Math.round((genProgress.currentBatch / genProgress.totalBatches) * 100)}%`
                      : `${genProgress.totalImages > 0 ? Math.round(((genProgress.completed + genProgress.failed) / genProgress.totalImages) * 100) : 0}%`}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      genProgress.status === "error" ? "bg-red-500" :
                      genProgress.status === "complete" ? "bg-green-500" : "bg-gradient-to-r from-blue-500 to-primary"
                    }`}
                    style={{ width: `${genProgress.status === "submitting" && genProgress.totalBatches > 0
                      ? Math.round((genProgress.currentBatch / genProgress.totalBatches) * 100)
                      : genProgress.totalImages > 0 ? Math.round(((genProgress.completed + genProgress.failed) / genProgress.totalImages) * 100) : 0}%` }}
                  />
                </div>
              </div>
            )}
          </Card>
        )}

        {!genProgress && totalExpected > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between gap-2 mb-2 text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                Image Progress
              </span>
              <span className="font-medium tabular-nums" data-testid="text-progress">
                {completedImages}/{totalExpected} ({progress}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-primary transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {completedImages} completed{failedImages > 0 ? ` · ${failedImages} failed` : ""}{(images?.filter(img => img.status === "generating" || img.status === "pending").length || 0) > 0 ? ` · ${images?.filter(img => img.status === "generating" || img.status === "pending").length} in progress` : ""}
            </p>
          </div>
        )}

        {project?.status !== "draft" && (
          <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="glass-card rounded-2xl overflow-hidden">
              <button
                onClick={() => setShowImageModelPicker(!showImageModelPicker)}
                className="w-full p-3.5 flex items-center gap-3 hover:bg-white/[0.02] transition-colors"
              >
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${TIER_COLORS[currentImageModel.tier].bg} flex items-center justify-center`}>
                  {currentImageModel.tier === "premium" ? <Crown className={`w-4 h-4 ${TIER_COLORS[currentImageModel.tier].text}`} /> : <ImageIcon className={`w-4 h-4 ${TIER_COLORS[currentImageModel.tier].text}`} />}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{currentImageModel.name}</p>
                    <span className={`text-[10px] font-medium ${TIER_COLORS[currentImageModel.tier].text} px-1.5 py-0.5 rounded-md bg-gradient-to-br ${TIER_COLORS[currentImageModel.tier].bg}`}>{TIER_COLORS[currentImageModel.tier].label}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{formatCost(currentImageModel.costPerImage)}/image · {currentImageModel.resolution} · {currentImageModel.maxRefImages} refs</p>
                </div>
                {showImageModelPicker ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {showImageModelPicker && (
                <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-3 animate-in fade-in slide-in-from-top-1 duration-200">
                  {IMAGE_MODELS.map((model) => {
                    const tier = TIER_COLORS[model.tier];
                    const isSelected = selectedImageModel === model.id;
                    return (
                      <div
                        key={model.id}
                        className={`p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                          isSelected ? `glass-surface border ${tier.border}` : "hover:bg-white/[0.03] border border-transparent"
                        }`}
                        onClick={() => { setSelectedImageModel(model.id); setShowImageModelPicker(false); }}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${tier.bg} flex items-center justify-center flex-shrink-0`}>
                            {model.tier === "premium" ? <Crown className={`w-3.5 h-3.5 ${tier.text}`} /> : <ImageIcon className={`w-3.5 h-3.5 ${tier.text}`} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-semibold">{model.name}</p>
                              <span className={`text-[10px] font-medium ${tier.text}`}>{tier.label}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">{model.description}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className={`text-xs font-bold ${tier.text}`}>{formatCost(model.costPerImage)}</p>
                            <p className="text-[10px] text-muted-foreground">{model.resolution}</p>
                          </div>
                          {isSelected && <CheckSquare className="w-4 h-4 text-primary flex-shrink-0" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="glass-card rounded-2xl overflow-hidden">
              <button
                onClick={() => setShowVideoModelPicker(!showVideoModelPicker)}
                className="w-full p-3.5 flex items-center gap-3 hover:bg-white/[0.02] transition-colors"
              >
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${TIER_COLORS[currentVideoModel.tier].bg} flex items-center justify-center`}>
                  {currentVideoModel.tier === "premium" ? <Crown className={`w-4 h-4 ${TIER_COLORS[currentVideoModel.tier].text}`} /> : currentVideoModel.tier === "budget" ? <Zap className={`w-4 h-4 ${TIER_COLORS[currentVideoModel.tier].text}`} /> : <Star className={`w-4 h-4 ${TIER_COLORS[currentVideoModel.tier].text}`} />}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{currentVideoModel.name}</p>
                    <span className={`text-[10px] font-medium ${TIER_COLORS[currentVideoModel.tier].text} px-1.5 py-0.5 rounded-md bg-gradient-to-br ${TIER_COLORS[currentVideoModel.tier].bg}`}>{TIER_COLORS[currentVideoModel.tier].label}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{formatCost(currentVideoModel.costPerClip)}/clip · {currentVideoModel.duration}s · {currentVideoModel.quality}</p>
                </div>
                {showVideoModelPicker ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {showVideoModelPicker && (
                <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-3 animate-in fade-in slide-in-from-top-1 duration-200">
                  {VIDEO_MODELS.map((model) => {
                    const tier = TIER_COLORS[model.tier];
                    const isSelected = selectedVideoModel === model.id;
                    return (
                      <div
                        key={model.id}
                        className={`p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                          isSelected ? `glass-surface border ${tier.border}` : "hover:bg-white/[0.03] border border-transparent"
                        }`}
                        onClick={() => { setSelectedVideoModel(model.id); if (model.id !== "kling") setSelectedVideoDuration(null); setShowVideoModelPicker(false); }}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${tier.bg} flex items-center justify-center flex-shrink-0`}>
                            {model.tier === "premium" ? <Crown className={`w-3.5 h-3.5 ${tier.text}`} /> : model.tier === "budget" ? <Zap className={`w-3.5 h-3.5 ${tier.text}`} /> : <Star className={`w-3.5 h-3.5 ${tier.text}`} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-semibold">{model.name}</p>
                              <span className={`text-[10px] font-medium ${tier.text}`}>{tier.label}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">{model.description}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className={`text-xs font-bold ${tier.text}`}>{formatCost(model.costPerClip)}</p>
                            <p className="text-[10px] text-muted-foreground">{model.duration}s · {model.quality}</p>
                          </div>
                          {isSelected && <CheckSquare className="w-4 h-4 text-primary flex-shrink-0" />}
                        </div>
                        {model.id === "kling" && isSelected && (
                          <div className="mt-2 pt-2 border-t border-white/10 ml-9">
                            <p className="text-[10px] text-muted-foreground mb-1">Clip Duration:</p>
                            <div className="flex gap-1.5">
                              {[5, 10, 15].map((dur) => (
                                <button
                                  key={dur}
                                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                                    (selectedVideoDuration || 15) === dur ? "bg-primary text-white" : "bg-white/5 text-muted-foreground hover:bg-white/10"
                                  }`}
                                  onClick={(e) => { e.stopPropagation(); setSelectedVideoDuration(dur); }}
                                >
                                  {dur}s
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {totalScenes > 0 && (
          <Card className="mb-6 p-4 glass-card rounded-2xl">
            <div className="flex items-center gap-2 mb-3">
              <div className="icon-box bg-gradient-to-br from-green-500/10 to-emerald-500/5 ring-green-500/15 w-6 h-6 rounded-lg">
                <DollarSign className="w-3.5 h-3.5 text-green-500" />
              </div>
              <h3 className="text-sm font-semibold">Estimated API Cost</h3>
              <span className="text-[10px] text-muted-foreground ml-auto font-medium tracking-wide">via EvoLink.AI</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
              <div className="glass-surface rounded-xl p-3 border border-[var(--glass-border)]">
                <p className="text-muted-foreground text-xs mb-1">Analysis ({totalScenes} scenes)</p>
                <p className="font-semibold">{formatCost(analysisCost)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Claude Opus 4.6</p>
              </div>
              <div className="glass-surface rounded-xl p-3 border border-[var(--glass-border)]">
                <p className="text-muted-foreground text-xs mb-1">Images ({totalExpected})</p>
                <p className="font-semibold">{formatCost(totalImageCost)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{formatCost(currentImageModel.costPerImage)}/image &middot; {currentImageModel.name}</p>
              </div>
              <div className="glass-surface rounded-xl p-3 border border-[var(--glass-border)]">
                <p className="text-muted-foreground text-xs mb-1">Video Clips ({totalExpected})</p>
                <p className="font-semibold">{formatCost(totalVideoCost)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{formatCost(currentVideoModel.costPerClip)}/clip &middot; {currentVideoModel.duration}s &middot; {currentVideoModel.name}</p>
              </div>
              <div className="glass-surface rounded-xl p-3 border border-primary/15 bg-primary/[0.03]">
                <p className="text-muted-foreground text-xs mb-1">Full Project Total</p>
                <p className="font-bold text-primary">{formatCost(totalProjectCost)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">analysis + images + clips</p>
              </div>
              <div className="glass-surface rounded-xl p-3 border border-green-500/10 bg-green-500/[0.02]">
                <p className="text-muted-foreground text-xs mb-1">Spent So Far</p>
                <p className="font-bold text-green-500">{formatCost(totalSpent)}</p>
                <div className="text-[10px] text-muted-foreground mt-1 space-y-0.5">
                  {analysisSpent > 0 && (
                    <div className="flex justify-between">
                      <span>Analysis</span>
                      <span className="text-green-400/80">{formatCost(analysisSpent)}</span>
                    </div>
                  )}
                  {imagesSpent > 0 && (
                    <div className="flex justify-between">
                      <span>Images ({images?.filter((img) => img.status === "completed").length || 0} generated)</span>
                      <span className="text-green-400/80">{formatCost(imagesSpent)}</span>
                    </div>
                  )}
                  {videosSpent > 0 && (
                    <div className="flex justify-between">
                      <span>Videos ({completedClipsCount} clips)</span>
                      <span className="text-green-400/80">{formatCost(videosSpent)}</span>
                    </div>
                  )}
                  {totalSpent === 0 && <span>No costs incurred yet</span>}
                </div>
              </div>
            </div>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 glass-card rounded-2xl p-1.5 h-auto">
            <TabsTrigger value="analysis" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-xl transition-all duration-200 py-2 px-4" data-testid="tab-analysis">
              <Eye className="w-4 h-4 mr-2" />
              Story Bible
            </TabsTrigger>
            <TabsTrigger value="storyboard" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-xl transition-all duration-200 py-2 px-4" data-testid="tab-storyboard">
              <Film className="w-4 h-4 mr-2" />
              Storyboard ({totalScenes})
            </TabsTrigger>
            <TabsTrigger value="gallery" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-xl transition-all duration-200 py-2 px-4" data-testid="tab-gallery">
              <Image className="w-4 h-4 mr-2" />
              Gallery ({completedImages})
            </TabsTrigger>
            <TabsTrigger value="clips" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-xl transition-all duration-200 py-2 px-4" data-testid="tab-clips">
              <Video className="w-4 h-4 mr-2" />
              Clips ({images?.filter(img => img.videoStatus === "completed" && img.videoUrl).length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analysis">
            {isAnalyzing && analysisProgress ? (
              <div className="space-y-6">
                <Card className="p-8 flex flex-col items-center justify-center glass-card rounded-2xl">
                  <div className="relative mb-4">
                    <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                    <div className="relative w-14 h-14 rounded-full gradient-btn flex items-center justify-center glow-md">
                      <Loader2 className="w-7 h-7 text-white animate-spin" />
                    </div>
                  </div>
                  <h3 className="font-semibold mb-1" data-testid="text-analysis-heading">
                    {analysisProgress.step === "reading" && "Reading your script..."}
                    {analysisProgress.step === "comprehending" && "AI is reading the entire story..."}
                    {analysisProgress.step === "analyzed" && "Building visual scene breakdown..."}
                    {analysisProgress.step === "prompts" && "Crafting cinematic image sequences..."}
                    {analysisProgress.step === "saving" && "Saving scene data..."}
                  </h3>
                  <p className="text-sm text-muted-foreground text-center max-w-md mb-4 leading-relaxed" data-testid="text-analysis-detail">
                    {analysisProgress.detail}
                  </p>
                  <div className="w-full max-w-xs">
                    <Progress
                      value={Math.round((analysisProgress.current / analysisProgress.total) * 100)}
                      className="h-1.5 rounded-full"
                    />
                    <div className="flex items-center justify-center gap-2 mt-2">
                      <p className="text-xs text-muted-foreground">
                        Step {analysisProgress.current} of {analysisProgress.total}
                      </p>
                      <span className="text-xs text-muted-foreground/40">&middot;</span>
                      <p className="text-xs text-muted-foreground tabular-nums" data-testid="text-elapsed-time-tab">
                        <Clock className="w-3 h-3 inline mr-1" />{formatElapsed(elapsedSeconds)}
                      </p>
                    </div>
                  </div>
                </Card>
                {analysis && <AnalysisView analysis={analysis} projectId={id} selectedImageModel={selectedImageModel} />}
              </div>
            ) : !analysis ? (
              <Card className="p-8 flex flex-col items-center justify-center glass-card rounded-2xl">
                <div className="w-14 h-14 rounded-2xl glass-card flex items-center justify-center mb-4 animate-float">
                  <Sparkles className="w-7 h-7 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-1">Script not analyzed yet</h3>
                <p className="text-sm text-muted-foreground text-center max-w-sm mb-5 leading-relaxed">
                  Click "Analyze Script" to have AI read your complete story, understand the narrative, and create a visual storyboard.
                </p>
                <button
                  onClick={startAnalysis}
                  disabled={isAnalyzing}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold gradient-btn text-white border-0 glow-sm hover:glow-md transition-all duration-300 active:scale-[0.97]"
                  data-testid="button-analyze-empty"
                >
                  <Sparkles className="w-4 h-4" />Analyze Script
                </button>
              </Card>
            ) : (
              <AnalysisView analysis={analysis} projectId={id} selectedImageModel={selectedImageModel} />
            )}
          </TabsContent>

          <TabsContent value="storyboard">
            {scenesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="p-5 glass-card rounded-2xl">
                    <Skeleton className="h-5 w-full mb-3 rounded-lg" />
                    <Skeleton className="h-4 w-3/4 rounded-lg" />
                  </Card>
                ))}
              </div>
            ) : scenes && scenes.length > 0 ? (
              <>
                {isAnalyzing && analysisProgress && (
                  <Card className="mb-4 p-4 glass-card rounded-2xl border-blue-500/15">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center ring-1 ring-blue-500/20">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Building scenes — {scenes.length} ready so far</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{analysisProgress.detail}</p>
                      </div>
                    </div>
                  </Card>
                )}
                {showSmartRegenPicker && !isSmartRegenerating && scenes.length > 0 && (
                  <Card className="mb-4 p-4 glass-card rounded-2xl border-orange-500/15 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 text-orange-400" />
                        <span className="text-sm font-semibold">Select Scenes to Smart Fix</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const scenesWithFailed = new Set(
                              (images || []).filter(img => img.status === "failed").map(img => img.sceneId)
                            );
                            if (smartRegenSelectedScenes.size === scenesWithFailed.size) {
                              setSmartRegenSelectedScenes(new Set());
                            } else {
                              setSmartRegenSelectedScenes(scenesWithFailed);
                            }
                          }}
                          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {smartRegenSelectedScenes.size === (images || []).filter(img => img.status === "failed").map(img => img.sceneId).filter((v, i, a) => a.indexOf(v) === i).length
                            ? "Deselect All" : "Select All"}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                      {scenes
                        .filter(scene => (images || []).some(img => img.sceneId === scene.id && img.status === "failed"))
                        .map((scene, idx) => {
                          const failedInScene = (images || []).filter(img => img.sceneId === scene.id && img.status === "failed").length;
                          const isSelected = smartRegenSelectedScenes.has(scene.id);
                          return (
                            <div
                              key={scene.id}
                              onClick={() => {
                                setSmartRegenSelectedScenes(prev => {
                                  const next = new Set(prev);
                                  if (next.has(scene.id)) next.delete(scene.id);
                                  else next.add(scene.id);
                                  return next;
                                });
                              }}
                              className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 ${
                                isSelected
                                  ? "bg-orange-500/10 border border-orange-500/20 ring-1 ring-orange-500/10"
                                  : "bg-white/5 border border-white/10 opacity-60 hover:opacity-80"
                              }`}
                            >
                              <div className="shrink-0">
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-orange-400" />
                                ) : (
                                  <Square className="w-4 h-4 text-muted-foreground" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium truncate">Scene {scene.sceneNumber}: {scene.sceneHeading || scene.sceneDescription?.substring(0, 60)}</div>
                              </div>
                              <span className="text-[10px] text-orange-400 shrink-0">{failedInScene} failed</span>
                            </div>
                          );
                        })}
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                      <span className="text-[11px] text-muted-foreground">
                        {smartRegenSelectedScenes.size} scene{smartRegenSelectedScenes.size !== 1 ? "s" : ""} selected
                        ({(images || []).filter(img => smartRegenSelectedScenes.has(img.sceneId) && img.status === "failed").length} failed images)
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setShowSmartRegenPicker(false); setSmartRegenSelectedScenes(new Set()); }}
                          className="ghost-btn text-xs px-3 py-1.5"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => smartRegenerateMutation.mutate(Array.from(smartRegenSelectedScenes))}
                          disabled={smartRegenSelectedScenes.size === 0 || smartRegenerateMutation.isPending}
                          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/20 transition-all disabled:opacity-50"
                        >
                          {smartRegenerateMutation.isPending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Zap className="w-3 h-3" />
                          )}
                          Smart Fix Selected
                        </button>
                      </div>
                    </div>
                  </Card>
                )}
                {isSmartRegenerating && smartRegenProgress && smartRegenProgress.status !== "idle" && (
                  <Card className="mb-4 p-4 glass-card rounded-2xl border-orange-500/15">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center ring-1 ring-orange-500/20">
                        {smartRegenProgress.status === "complete" ? (
                          <RefreshCw className="w-4 h-4 text-green-400" />
                        ) : (
                          <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          {smartRegenProgress.status === "complete"
                            ? "Smart regeneration complete"
                            : `Smart fixing failed images — ${smartRegenProgress.completed}/${smartRegenProgress.total} processed`}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{smartRegenProgress.detail}</p>
                      </div>
                      {smartRegenProgress.total > 0 && smartRegenProgress.status !== "complete" && (
                        <span className="text-xs text-muted-foreground font-mono">
                          {smartRegenProgress.completed}/{smartRegenProgress.total}
                        </span>
                      )}
                    </div>
                    {smartRegenProgress.total > 0 && (
                      <div className="mt-3 h-1.5 rounded-full bg-[var(--glass-border)] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            smartRegenProgress.status === "complete"
                              ? "bg-gradient-to-r from-green-500 to-emerald-500"
                              : "bg-gradient-to-r from-orange-500 to-amber-500"
                          }`}
                          style={{ width: `${(smartRegenProgress.completed / smartRegenProgress.total) * 100}%` }}
                        />
                      </div>
                    )}
                  </Card>
                )}
                <StoryboardView
                  projectId={id!}
                  scenes={scenes}
                  images={images || []}
                  onGenerate={(sceneId) => generateSceneMutation.mutate(sceneId)}
                  generatingSceneId={generatingSceneId}
                  isGenerating={generateSceneMutation.isPending}
                  onRegenerateImage={regenerateImage}
                  regeneratingImageId={regeneratingImageId}
                  onGenerateVideo={generateVideoFromImage}
                  onRegenerateVideoWithFeedback={regenerateVideoWithFeedback}
                  videoGeneratingImageId={videoGeneratingImageId}
                  onAnimateAll={animateAllScene}
                  animatingSceneId={animatingSceneId}
                  selectedVideoModel={selectedVideoModel}
                  costPerImage={currentImageModel.costPerImage}
                  onRegenerateSceneWithFeedback={regenerateSceneWithFeedback}
                  regeneratingSceneId={regeneratingSceneId}
                  onRegenerateImageWithConsistency={regenerateImageWithConsistency}
                  onRegenerateSceneWithConsistency={regenerateSceneWithConsistency}
                  onRegenerateSceneVideosWithFeedback={regenerateSceneVideosWithFeedback}
                  selectedImageModel={selectedImageModel}
                  onDeleteImage={deleteImage}
                  onRemoveVideo={removeVideo}
                  charRefsReady={charRefsReady}
                />
              </>
            ) : isAnalyzing ? (
              <Card className="p-8 flex flex-col items-center justify-center glass-card rounded-2xl">
                <div className="relative mb-4">
                  <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                  <div className="relative w-12 h-12 rounded-full gradient-btn flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  </div>
                </div>
                <h3 className="font-semibold mb-1">Building storyboard...</h3>
                <p className="text-sm text-muted-foreground">Scenes will appear here as the AI creates them.</p>
              </Card>
            ) : (
              <Card className="p-8 flex flex-col items-center justify-center glass-card rounded-2xl">
                <div className="w-14 h-14 rounded-2xl glass-card flex items-center justify-center mb-4 animate-float">
                  <Film className="w-7 h-7 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-1">No storyboard yet</h3>
                <p className="text-sm text-muted-foreground">Analyze the script first to create a visual storyboard.</p>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="gallery">
            <GalleryView
              images={images || []}
              scenes={scenes || []}
              onRefresh={() => refetchImages()}
              onRegenerateImage={regenerateImage}
              regeneratingImageId={regeneratingImageId}
              onGenerateVideo={generateVideoFromImage}
              onRegenerateVideoWithFeedback={regenerateVideoWithFeedback}
              videoGeneratingImageId={videoGeneratingImageId}
              selectedVideoModel={selectedVideoModel}
              costPerImage={currentImageModel.costPerImage}
            />
          </TabsContent>

          <TabsContent value="clips">
            <ClipsView
              projectId={id!}
              images={images || []}
              scenes={scenes || []}
              onGenerateVideo={generateVideoFromImage}
              videoGeneratingImageId={videoGeneratingImageId}
              selectedVideoModel={selectedVideoModel}
              onRemoveVideo={removeVideo}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function PortraitLightbox({ imageUrl, characterName, angle, onClose }: { imageUrl: string; characterName: string; angle: string; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const angleLabels: Record<string, string> = { front: "Front View", "three-quarter": "Three-Quarter View", profile: "Side Profile" };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-5xl max-h-[90vh] w-full" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors p-1">
          <X className="w-6 h-6" />
        </button>
        <div className="text-center mb-3">
          <h3 className="text-white text-lg font-semibold">{characterName}</h3>
          <p className="text-white/50 text-sm">{angleLabels[angle] || angle}</p>
        </div>
        <img
          src={proxyUrl(imageUrl)}
          alt={`${characterName} - ${angle}`}
          className="w-full h-auto max-h-[80vh] object-contain rounded-xl"
        />
      </div>
    </div>
  );
}

function AnalysisView({ analysis, projectId, selectedImageModel }: { analysis: ScriptAnalysis; projectId: string; selectedImageModel: string }) {
  const { toast } = useToast();
  const [charRefs, setCharRefs] = useState<any[]>([]);
  const [isGeneratingRefs, setIsGeneratingRefs] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [feedbackRefId, setFeedbackRefId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [lightboxImage, setLightboxImage] = useState<{ url: string; name: string; angle: string } | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchCharRefs = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/character-references`, { headers: getApiHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCharRefs(data);
        return data;
      }
    } catch {}
    return [];
  }, [projectId]);

  useEffect(() => {
    fetchCharRefs();
  }, [fetchCharRefs]);

  useEffect(() => {
    const hasGenerating = charRefs.some(r => r.status === "generating");
    if (hasGenerating && !pollIntervalRef.current) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/projects/${projectId}/character-references/poll`, { method: "POST", headers: getApiHeaders() });
          if (res.ok) {
            const data = await res.json();
            setCharRefs(data);
            const stillGenerating = data.some((r: any) => r.status === "generating");
            if (!stillGenerating && pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
              setIsGeneratingRefs(false);
              setRegeneratingId(null);
            }
          }
        } catch {}
      }, 4000);
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [charRefs, projectId]);

  const generateCharacterPortraits = async () => {
    setIsGeneratingRefs(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-character-references`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getApiHeaders() },
        body: JSON.stringify({ imageModel: selectedImageModel }),
      });
      if (res.ok) {
        const data = await res.json();
        setCharRefs(data.refs || []);
        toast({ title: `Generating ${data.count} character portraits...` });
      } else {
        const err = await res.json();
        toast({ title: "Error", description: err.error, variant: "destructive" });
        setIsGeneratingRefs(false);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setIsGeneratingRefs(false);
    }
  };

  const regeneratePortrait = async (refId: string, feedback?: string) => {
    setRegeneratingId(refId);
    setFeedbackRefId(null);
    setFeedbackText("");
    try {
      const res = await fetch(`/api/projects/${projectId}/character-references/${refId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getApiHeaders() },
        body: JSON.stringify({ feedback: feedback || undefined, imageModel: selectedImageModel }),
      });
      if (res.ok) {
        setCharRefs(prev => prev.map(r => r.id === refId ? { ...r, status: "generating", imageUrl: null } : r));
        toast({ title: feedback ? "Applying feedback and regenerating..." : "Regenerating portrait..." });
      }
    } catch {}
  };

  const completedRefs = charRefs.filter(r => r.status === "completed" && r.imageUrl);
  const generatingRefs = charRefs.filter(r => r.status === "generating");
  const totalExpectedRefs = analysis.characters.length * 3;

  return (
    <div className="space-y-6">
      {lightboxImage && (
        <PortraitLightbox
          imageUrl={lightboxImage.url}
          characterName={lightboxImage.name}
          angle={lightboxImage.angle}
          onClose={() => setLightboxImage(null)}
        />
      )}
      <Card className="glass-card rounded-2xl overflow-hidden p-0">
        <div className="px-5 pt-5 pb-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-1 ring-primary/15">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold">Story Bible</h2>
              <p className="text-xs text-muted-foreground">AI-extracted world, characters, and visual direction</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/5">
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Palette className="w-3.5 h-3.5 text-purple-400" />
              <h3 className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Visual Style</h3>
            </div>
            <div className="space-y-2.5">
              {[
                { label: "Base", value: analysis.visualStyle.baseStyle },
                { label: "Lighting", value: analysis.visualStyle.lighting },
                { label: "Palette", value: analysis.visualStyle.colorPalette },
                { label: "Atmosphere", value: analysis.visualStyle.atmosphere },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{item.label}</p>
                  <p className="text-xs leading-relaxed">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Overview</h3>
            </div>
            <div className="space-y-2.5">
              {[
                { label: "Genre", value: analysis.genre },
                { label: "Setting", value: analysis.setting },
                { label: "Time Period", value: analysis.timePeriod },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{item.label}</p>
                  <p className="text-xs leading-relaxed">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
              <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Story Elements</h3>
            </div>
            <div className="space-y-3">
              {[
                { label: "Characters", count: analysis.characters.length, color: "text-amber-400", icon: <User className="w-3.5 h-3.5" /> },
                { label: "Jets / Aircraft", count: analysis.jets.length, color: "text-sky-400", icon: <Plane className="w-3.5 h-3.5" /> },
                { label: "Locations", count: analysis.locations.length, color: "text-amber-400", icon: <MapPin className="w-3.5 h-3.5" /> },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2.5">
                  <div className={`w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center ${item.color}`}>
                    {item.icon}
                  </div>
                  <div>
                    <p className="text-lg font-bold tabular-nums leading-none">{item.count}</p>
                    <p className="text-[10px] text-muted-foreground">{item.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {analysis.characters.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="section-title">
              <div className="icon-box bg-gradient-to-br from-amber-500/10 to-orange-500/5 ring-amber-500/15 w-6 h-6 rounded-lg">
                <User className="w-3.5 h-3.5 text-amber-400" />
              </div>
              Characters ({analysis.characters.length})
            </h3>
            <button
              onClick={generateCharacterPortraits}
              disabled={isGeneratingRefs || generatingRefs.length > 0}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-300 active:scale-[0.98] disabled:opacity-50 ${
                completedRefs.length > 0
                  ? "ghost-btn"
                  : "gradient-btn text-white border-0 glow-sm hover:glow-md"
              }`}
            >
              {isGeneratingRefs || generatingRefs.length > 0 ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating Portraits ({completedRefs.length}/{totalExpectedRefs})</>
              ) : completedRefs.length > 0 ? (
                <><RefreshCw className="w-3.5 h-3.5" />Regenerate All Portraits</>
              ) : (
                <><Camera className="w-3.5 h-3.5" />Generate Character Portraits (3 angles each)</>
              )}
            </button>
          </div>
          {completedRefs.length > 0 && (
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
              Multi-angle portraits (front, three-quarter, profile) are used as visual references when generating scene images to keep characters looking consistent. Click any portrait to view full size.
            </p>
          )}
          <div className="grid grid-cols-1 gap-4">
            {analysis.characters.map((char, i) => {
              const angleOrder = ["front", "three-quarter", "profile"];
              const angleLabels: Record<string, string> = { front: "Front", "three-quarter": "3/4", profile: "Profile" };
              const charAngleRefs = angleOrder.map(angle => {
                return charRefs.find(r => r.characterName === char.name && (r.angle || "front") === angle) || null;
              });
              const hasAnyRef = charAngleRefs.some(r => r !== null);

              return (
                <Card key={i} className="glass-card p-4 rounded-2xl">
                  <div className="flex gap-4">
                    <div className="flex-shrink-0">
                      {hasAnyRef && (
                        <div className="flex gap-2">
                          {charAngleRefs.map((ref, ai) => {
                            const angle = angleOrder[ai];
                            if (ref && ref.status === "completed" && ref.imageUrl) {
                              return (
                                <div key={angle} className="relative group flex flex-col items-center">
                                  <img
                                    src={proxyUrl(ref.imageUrl)}
                                    alt={`${char.name} - ${angleLabels[angle]}`}
                                    className="w-20 h-20 object-cover rounded-xl border border-[var(--glass-border)] shadow-md ring-1 ring-white/[0.04] cursor-pointer hover:ring-primary/30 transition-all img-fade-in"
                                    loading="lazy"
                                    decoding="async"
                                    onLoad={(e) => e.currentTarget.classList.add("loaded")}
                                    onClick={() => setLightboxImage({ url: ref.imageUrl, name: char.name, angle })}
                                  />
                                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-1">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setLightboxImage({ url: ref.imageUrl, name: char.name, angle }); }}
                                      className="p-1 bg-white/15 hover:bg-white/25 rounded-md transition-colors backdrop-blur-sm"
                                      title="View full size"
                                    >
                                      <Maximize className="w-3.5 h-3.5 text-white" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); regeneratePortrait(ref.id); }}
                                      className="p-1 bg-white/15 hover:bg-white/25 rounded-md transition-colors backdrop-blur-sm"
                                      disabled={regeneratingId === ref.id}
                                      title="Regenerate this angle"
                                    >
                                      <RefreshCw className="w-3.5 h-3.5 text-white" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setFeedbackRefId(ref.id); setFeedbackText(""); }}
                                      className="p-1 bg-white/15 hover:bg-white/25 rounded-md transition-colors backdrop-blur-sm"
                                      disabled={regeneratingId === ref.id}
                                      title="Redo with feedback"
                                    >
                                      <MessageSquare className="w-3.5 h-3.5 text-white" />
                                    </button>
                                  </div>
                                  <span className="text-[9px] text-muted-foreground mt-1 font-medium">{angleLabels[angle]}</span>
                                </div>
                              );
                            } else if (ref && ref.status === "generating") {
                              return (
                                <div key={angle} className="flex flex-col items-center">
                                  <div className="w-20 h-20 rounded-xl border border-[var(--glass-border)] glass-surface flex items-center justify-center">
                                    <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                                  </div>
                                  <span className="text-[9px] text-muted-foreground mt-1 font-medium">{angleLabels[angle]}</span>
                                </div>
                              );
                            } else if (ref && ref.status === "failed") {
                              return (
                                <div key={angle} className="flex flex-col items-center">
                                  <div className="w-20 h-20 rounded-xl border border-red-500/20 bg-red-950/10 flex items-center justify-center cursor-pointer hover:border-red-500/40 transition-colors" onClick={() => regeneratePortrait(ref.id)}>
                                    <RefreshCw className="w-4 h-4 text-red-400" />
                                  </div>
                                  <span className="text-[9px] text-red-400 mt-1 font-medium">{angleLabels[angle]}</span>
                                </div>
                              );
                            }
                            return null;
                          })}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-sm" data-testid={`text-character-name-${i}`}>{char.name}</h4>
                      <p className="text-xs text-muted-foreground mb-1">{char.role}</p>
                      <p className="text-xs line-clamp-3 leading-relaxed">{char.description}</p>
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                        <span className="font-medium">Appearance:</span> {char.appearance}
                      </p>
                      {charAngleRefs.map((ref) => {
                        if (!ref || feedbackRefId !== ref.id) return null;
                        return (
                          <div key={ref.id} className="mt-2 space-y-2">
                            <textarea
                              value={feedbackText}
                              onChange={(e) => setFeedbackText(e.target.value)}
                              placeholder="Describe what you'd like changed... e.g. 'make him look more weathered and battle-worn' or 'wrong uniform, should be navy blue flight suit'"
                              className="glass-input w-full h-20 text-xs rounded-xl px-3 py-2 resize-none focus:outline-none"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold gradient-btn text-white border-0 transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
                                onClick={() => regeneratePortrait(ref.id, feedbackText)}
                                disabled={!feedbackText.trim()}
                              >
                                <Send className="w-3 h-3" />Apply & Regenerate
                              </button>
                              <button
                                className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
                                onClick={() => { setFeedbackRefId(null); setFeedbackText(""); }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {analysis.jets.length > 0 && (
        <div>
          <h3 className="section-title mb-3">
            <div className="icon-box bg-gradient-to-br from-sky-500/10 to-blue-500/5 ring-sky-500/15 w-6 h-6 rounded-lg">
              <Plane className="w-3.5 h-3.5 text-sky-400" />
            </div>
            Jets & Aircraft ({analysis.jets.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {analysis.jets.map((jet, i) => (
              <Card key={i} className="glass-card p-4 rounded-2xl hover:border-sky-500/15 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Plane className="w-4 h-4 text-sky-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm" data-testid={`text-jet-name-${i}`}>{jet.name}</h4>
                    <p className="text-[11px] text-sky-400/70 font-medium mb-1.5">{jet.type}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{jet.description}</p>
                    <div className="mt-2 pt-2 border-t border-white/5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Visual Details</p>
                      <p className="text-[11px] leading-relaxed">{jet.visualDetails}</p>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {analysis.locations.length > 0 && (
        <div>
          <h3 className="section-title mb-3">
            <div className="icon-box bg-gradient-to-br from-amber-500/10 to-yellow-500/5 ring-amber-500/15 w-6 h-6 rounded-lg">
              <MapPin className="w-3.5 h-3.5 text-amber-400" />
            </div>
            Locations ({analysis.locations.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {analysis.locations.map((loc, i) => (
              <Card key={i} className="glass-card p-4 rounded-2xl hover:border-amber-500/15 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MapPin className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm" data-testid={`text-location-name-${i}`}>{loc.name}</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-1">{loc.description}</p>
                    <div className="mt-2 pt-2 border-t border-white/5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Visual Details</p>
                      <p className="text-[11px] leading-relaxed">{loc.visualDetails}</p>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StoryboardView({
  projectId,
  scenes,
  images,
  onGenerate,
  generatingSceneId,
  isGenerating,
  onRegenerateImage,
  regeneratingImageId,
  onGenerateVideo,
  onRegenerateVideoWithFeedback,
  videoGeneratingImageId,
  onAnimateAll,
  animatingSceneId,
  selectedVideoModel,
  costPerImage,
  onRegenerateSceneWithFeedback,
  regeneratingSceneId,
  onRegenerateImageWithConsistency,
  onRegenerateSceneWithConsistency,
  onRegenerateSceneVideosWithFeedback,
  selectedImageModel,
  onDeleteImage,
  onRemoveVideo,
  charRefsReady,
}: {
  projectId: string;
  scenes: Scene[];
  images: GeneratedImage[];
  onGenerate: (sceneId: string) => void;
  generatingSceneId: string | null;
  isGenerating: boolean;
  onRegenerateImage: (imageId: string, feedback?: string) => void;
  regeneratingImageId: string | null;
  onGenerateVideo: (imageId: string, modelOverride?: string) => void;
  onRegenerateVideoWithFeedback: (imageId: string, feedback: string, modelOverride?: string) => void;
  videoGeneratingImageId: string | null;
  onAnimateAll: (sceneId: string) => void;
  animatingSceneId: string | null;
  selectedVideoModel: string;
  costPerImage: number;
  onRegenerateSceneWithFeedback: (sceneId: string, feedback: string) => void;
  regeneratingSceneId: string | null;
  onRegenerateImageWithConsistency?: (imageId: string) => void;
  onRegenerateSceneWithConsistency?: (sceneId: string) => void;
  onRegenerateSceneVideosWithFeedback?: (sceneId: string, feedback: string) => void;
  selectedImageModel: string;
  onDeleteImage: (imageId: string) => void;
  onRemoveVideo: (imageId: string) => void;
  charRefsReady: boolean;
}) {
  const [lightboxImage, setLightboxImage] = useState<GeneratedImage | null>(null);
  const [imageFeedbackId, setImageFeedbackId] = useState<string | null>(null);
  const [imageFeedbackText, setImageFeedbackText] = useState("");
  const [sceneVideoFeedbackId, setSceneVideoFeedbackId] = useState<string | null>(null);
  const [sceneVideoFeedbackText, setSceneVideoFeedbackText] = useState("");
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);
  const [sceneChatId, setSceneChatId] = useState<string | null>(null);
  const [sceneChatMessages, setSceneChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [sceneChatInput, setSceneChatInput] = useState("");
  const [sceneChatLoading, setSceneChatLoading] = useState(false);
  const [sceneChatApplying, setSceneChatApplying] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const currentModel = VIDEO_MODELS.find(m => m.id === selectedVideoModel) || VIDEO_MODELS[0];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sceneChatMessages]);

  const sendChatMessage = async (sceneId: string) => {
    if (!sceneChatInput.trim() || sceneChatLoading) return;
    const userMsg = sceneChatInput.trim();
    setSceneChatInput("");
    const newMessages = [...sceneChatMessages, { role: "user" as const, content: userMsg }];
    setSceneChatMessages(newMessages);
    setSceneChatLoading(true);
    try {
      const res = await apiRequest("POST", `/api/projects/${projectId}/scenes/${sceneId}/scene-chat`, { messages: newMessages });
      const data = await res.json();
      setSceneChatMessages([...newMessages, { role: "assistant" as const, content: data.reply }]);
    } catch (err: any) {
      setSceneChatMessages([...newMessages, { role: "assistant" as const, content: "Sorry, I had trouble understanding. Could you try rephrasing?" }]);
    } finally {
      setSceneChatLoading(false);
    }
  };

  const applyChatFeedback = async (sceneId: string) => {
    if (sceneChatMessages.length === 0 || sceneChatApplying) return;
    setSceneChatApplying(true);
    try {
      await apiRequest("POST", `/api/projects/${projectId}/scenes/${sceneId}/apply-scene-chat`, {
        messages: sceneChatMessages,
        imageModel: selectedImageModel,
      });
      setSceneChatId(null);
      setSceneChatMessages([]);
      setSceneChatInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "images"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
    } catch (err: any) {
      console.error("Apply chat feedback failed:", err);
      setSceneChatMessages(prev => [...prev, { role: "assistant" as const, content: `Failed to apply changes: ${err.message || "Unknown error"}. Please try again.` }]);
    } finally {
      setSceneChatApplying(false);
    }
  };

  const allCompletedImages = [...images]
    .filter(img => img.status === "completed" && img.imageUrl)
    .sort((a, b) => {
      const sceneA = scenes.find(s => s.id === a.sceneId);
      const sceneB = scenes.find(s => s.id === b.sceneId);
      const idxA = sceneA?.sentenceIndex ?? 0;
      const idxB = sceneB?.sentenceIndex ?? 0;
      if (idxA !== idxB) return idxA - idxB;
      return a.variant - b.variant;
    });

  const getShotLabels = (scene: Scene): string[] => {
    try {
      if (scene.shotLabels) return JSON.parse(scene.shotLabels);
    } catch {}
    return [];
  };

  const getShotLabel = (scene: Scene, variantIndex: number): string => {
    const labels = getShotLabels(scene);
    return labels[variantIndex] || `Shot ${variantIndex + 1}`;
  };

  return (
    <div className="relative">
      <div className="absolute left-[22px] top-0 bottom-0 w-px bg-gradient-to-b from-primary/20 via-primary/10 to-transparent pointer-events-none" />

      <div className="space-y-4">
      {scenes.map((scene, index) => {
        const sceneImages = images.filter((img) => img.sceneId === scene.id);
        const hasImages = sceneImages.length > 0;
        const expectedCount = scene.expectedImages || 4;
        const completedCount = sceneImages.filter((img) => img.status === "completed").length;
        const pendingCount = sceneImages.filter((img) => img.status === "pending" || img.status === "generating").length;
        const failedCount = sceneImages.filter((img) => img.status === "failed").length;

        let contextData: any = {};
        try {
          if (scene.context) contextData = JSON.parse(scene.context);
        } catch {}

        return (
          <div key={scene.id} data-testid={`card-scene-${index}`} className="relative pl-12 scene-card">
            <div className="absolute left-0 top-5 flex flex-col items-center z-10">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary/25 to-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary shadow-lg shadow-primary/5 backdrop-blur-sm">
                {index + 1}
              </div>
            </div>

            <Card className="p-5 relative glass-card rounded-2xl">
              <div className="flex flex-col gap-3 mb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm">Scene {index + 1}</h3>
                      {hasImages && (
                        <Badge variant={failedCount === sceneImages.length ? "destructive" : "outline"} className="text-[10px] rounded-lg backdrop-blur-sm">
                          {failedCount === sceneImages.length ? "All Failed" : `${completedCount}/${expectedCount}`}
                          {pendingCount > 0 && " generating..."}
                          {failedCount > 0 && failedCount < sceneImages.length && ` · ${failedCount} failed`}
                        </Badge>
                      )}
                    </div>
                    {scene.sceneDescription && (
                      <p className="text-xs text-muted-foreground leading-relaxed">{scene.sceneDescription}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl glass-surface border border-[var(--glass-border)] mb-3">
                <p className="text-sm leading-relaxed italic text-foreground/90" data-testid={`text-sentence-${index}`}>
                  "{scene.sentence}"
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-3">
                {scene.location && (
                  <div className="flex items-center gap-1 glass-badge px-2 py-1 rounded-lg">
                    <MapPin className="w-3 h-3 text-primary/60" />
                    <span>{scene.location}</span>
                  </div>
                )}
                {scene.timeOfDay && (
                  <div className="flex items-center gap-1 glass-badge px-2 py-1 rounded-lg">
                    <Sun className="w-3 h-3 text-amber-400/60" />
                    <span>{scene.timeOfDay}</span>
                  </div>
                )}
                {scene.mood && (
                  <div className="flex items-center gap-1 glass-badge px-2 py-1 rounded-lg">
                    <CloudSun className="w-3 h-3 text-sky-400/60" />
                    <span>{scene.mood}</span>
                  </div>
                )}
                {contextData.charactersPresent && contextData.charactersPresent.length > 0 && (
                  <div className="flex items-center gap-1 glass-badge px-2 py-1 rounded-lg">
                    <User className="w-3 h-3 text-violet-400/60" />
                    <span>{contextData.charactersPresent.join(", ")}</span>
                  </div>
                )}
                {contextData.aircraftPresent && contextData.aircraftPresent.length > 0 && (
                  <div className="flex items-center gap-1 glass-badge px-2 py-1 rounded-lg">
                    <Plane className="w-3 h-3 text-emerald-400/60" />
                    <span>{contextData.aircraftPresent.join(", ")}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap mb-3">
                <Button
                  size="sm"
                  variant={hasImages ? "outline" : "default"}
                  onClick={() => onGenerate(scene.id)}
                  disabled={(isGenerating && generatingSceneId === scene.id) || !charRefsReady}
                  className={hasImages ? "glass-border rounded-xl text-xs hover:bg-[var(--glass-highlight)] transition-all duration-200" : "gradient-btn text-white border-0 rounded-xl text-xs"}
                  data-testid={`button-generate-scene-${index}`}
                  title={!charRefsReady ? "Generate character portraits first" : `Estimated cost: ${formatCost(expectedCount * costPerImage)}`}
                >
                  {isGenerating && generatingSceneId === scene.id ? (
                    <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Generating</>
                  ) : !charRefsReady ? (
                    <><Users className="w-3 h-3 mr-1" />Portraits Required</>
                  ) : hasImages ? (
                    <><RefreshCw className="w-3 h-3 mr-1" />Regenerate ~{formatCost(expectedCount * costPerImage)}</>
                  ) : (
                    <><Image className="w-3 h-3 mr-1" />Generate ({expectedCount}) ~{formatCost(expectedCount * costPerImage)}</>
                  )}
                </Button>
                {hasImages && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (sceneChatId === scene.id) {
                          setSceneChatId(null);
                          setSceneChatMessages([]);
                          setSceneChatInput("");
                        } else {
                          setSceneChatId(scene.id);
                          setSceneChatMessages([]);
                          setSceneChatInput("");
                        }
                      }}
                      disabled={regeneratingSceneId === scene.id || sceneChatApplying}
                      className="glass-border rounded-xl text-xs hover:bg-[var(--glass-highlight)] transition-all duration-200"
                      title="Chat with AI director to refine this scene's images"
                    >
                      {regeneratingSceneId === scene.id || sceneChatApplying ? (
                        <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Applying...</>
                      ) : (
                        <><MessageSquare className="w-3 h-3 mr-1" />Scene Director</>
                      )}
                    </Button>
                    {onRegenerateSceneWithConsistency && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onRegenerateSceneWithConsistency(scene.id)}
                        disabled={regeneratingSceneId === scene.id}
                        className="glass-border rounded-xl text-xs hover:bg-[var(--glass-highlight)] transition-all duration-200 text-amber-400 border-amber-500/30"
                        title="Regenerate all scene images using character reference portraits for consistency"
                      >
                        <Users className="w-3 h-3 mr-1" />Consistency Regen
                      </Button>
                    )}
                  </>
                )}
                {(() => {
                  const animatable = sceneImages.filter(
                    (img) => img.status === "completed" && img.imageUrl && (!img.videoStatus || img.videoStatus === "failed")
                  );
                  const allAnimating = sceneImages.some((img) => img.videoStatus === "generating");
                  if (animatable.length > 0) {
                    const animateCost = animatable.length * currentModel.costPerClip;
                    return (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onAnimateAll(scene.id)}
                        disabled={animatingSceneId === scene.id || allAnimating}
                        className="glass-border rounded-xl text-xs hover:bg-[var(--glass-highlight)] transition-all duration-200"
                        data-testid={`button-animate-all-scene-${index}`}
                        title={`Estimated cost: ${formatCost(animateCost)}`}
                      >
                        {animatingSceneId === scene.id ? (
                          <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Animating...</>
                        ) : (
                          <><Video className="w-3 h-3 mr-1" />Animate All ({animatable.length}) ~{formatCost(animateCost)}</>
                        )}
                      </Button>
                    );
                  }
                  return null;
                })()}

                {(() => {
                  const sceneImages = images.filter(img => img.sceneId === scene.id);
                  const hasVideos = sceneImages.some(img => img.videoUrl || img.videoStatus === "completed");
                  if (hasVideos && onRegenerateSceneVideosWithFeedback) {
                    return (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSceneVideoFeedbackId(sceneVideoFeedbackId === scene.id ? null : scene.id);
                          setSceneVideoFeedbackText("");
                        }}
                        className="glass-border rounded-xl text-xs text-amber-300/70 hover:text-amber-300 hover:bg-amber-400/[0.05] border-amber-400/20 transition-all duration-200"
                      >
                        <MessageSquare className="w-3 h-3 mr-1" />
                        {sceneVideoFeedbackId === scene.id ? "Cancel" : "Redo Scene Motion with Feedback"}
                      </Button>
                    );
                  }
                  return null;
                })()}
              </div>

              {sceneVideoFeedbackId === scene.id && onRegenerateSceneVideosWithFeedback && (
                <div className="mb-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Video className="w-4 h-4 text-amber-400" />
                    <span className="text-xs text-amber-300 font-semibold">Scene Motion Feedback</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-2.5">
                    All videos in this scene will be regenerated with your feedback applied to guide the motion prompts.
                  </p>
                  <textarea
                    value={sceneVideoFeedbackText}
                    onChange={(e) => setSceneVideoFeedbackText(e.target.value)}
                    placeholder="e.g. 'the aircraft keeps morphing between frames' or 'too much camera shake' or 'the jet design changes mid-clip, keep it static' or 'needs more atmospheric motion like clouds drifting'"
                    className="w-full h-20 text-xs rounded-xl border border-amber-400/15 bg-black/20 text-white px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400/30 focus:border-amber-400/20 placeholder:text-white/25"
                    autoFocus
                  />
                  <div className="flex gap-2 mt-2.5">
                    <Button
                      size="sm"
                      onClick={() => { onRegenerateSceneVideosWithFeedback(scene.id, sceneVideoFeedbackText); setSceneVideoFeedbackId(null); setSceneVideoFeedbackText(""); }}
                      disabled={!sceneVideoFeedbackText.trim()}
                      className="rounded-xl text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/20"
                    >
                      <Send className="w-3 h-3 mr-1" />Regenerate Scene Videos
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setSceneVideoFeedbackId(null); setSceneVideoFeedbackText(""); }}
                      className="rounded-xl text-xs text-white/50 hover:text-white/70"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {sceneChatId === scene.id && (
                <div className="mb-3 rounded-xl bg-blue-500/5 border border-blue-500/20 animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-blue-500/15 bg-blue-500/5">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-blue-400" />
                      <span className="text-xs text-blue-300 font-semibold">Scene Director Chat</span>
                      <span className="text-[10px] text-muted-foreground">— describe what you want changed, then apply</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setSceneChatId(null); setSceneChatMessages([]); setSceneChatInput(""); }}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <div className="max-h-[280px] overflow-y-auto px-4 py-3 space-y-2.5">
                    {sceneChatMessages.length === 0 && (
                      <div className="text-center py-4">
                        <p className="text-[11px] text-muted-foreground">Tell me what you'd like to change about this scene's images.</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">I'll confirm my understanding before applying any changes.</p>
                      </div>
                    )}
                    {sceneChatMessages.map((msg, mi) => (
                      <div key={mi} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                          msg.role === "user"
                            ? "bg-blue-500/20 text-blue-100 border border-blue-500/20"
                            : "bg-white/5 text-white/80 border border-white/10"
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {sceneChatLoading && (
                      <div className="flex justify-start">
                        <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <div className="px-4 py-3 border-t border-blue-500/15 bg-black/10">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={sceneChatInput}
                        onChange={(e) => setSceneChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey && sceneChatInput.trim() && !sceneChatLoading) {
                            e.preventDefault();
                            sendChatMessage(scene.id);
                          }
                        }}
                        placeholder="e.g. 'Make it darker with rain and fog, but keep the aircraft the same...'"
                        className="flex-1 px-3 py-2 rounded-lg text-xs bg-black/20 border border-white/10 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-blue-500/30 focus:ring-1 focus:ring-blue-500/20"
                        disabled={sceneChatLoading || sceneChatApplying}
                        autoFocus
                      />
                      <Button
                        size="sm"
                        onClick={() => sendChatMessage(scene.id)}
                        disabled={!sceneChatInput.trim() || sceneChatLoading || sceneChatApplying}
                        className="rounded-lg text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-400/20 px-3"
                      >
                        {sceneChatLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      </Button>
                    </div>
                    {sceneChatMessages.some(m => m.role === "assistant") && (
                      <div className="flex justify-end gap-2 mt-2.5">
                        <Button
                          size="sm"
                          onClick={() => applyChatFeedback(scene.id)}
                          disabled={sceneChatApplying || sceneChatLoading || !sceneChatMessages.some(m => m.role === "user")}
                          className="gradient-btn text-white border-0 rounded-lg text-xs px-4"
                        >
                          {sceneChatApplying ? (
                            <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Applying to {sceneImages.length} images...</>
                          ) : (
                            <><Sparkles className="w-3 h-3 mr-1" />Apply Changes to All {sceneImages.length} Images</>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {sceneImages.length > 0 && (
                <div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
                    {sceneImages
                      .sort((a, b) => a.variant - b.variant)
                      .map((img, vi) => (
                      <div key={img.id} className="relative">
                        <div className="relative aspect-video rounded-xl overflow-hidden bg-muted/30 group border border-[var(--glass-border)] shadow-sm transition-all duration-300 hover:border-[var(--glass-highlight)] hover:shadow-md hover:scale-[1.02]">
                          {img.status === "completed" && img.imageUrl ? (
                            <>
                              <img
                                src={proxyUrl(img.imageUrl)}
                                alt={getShotLabel(scene, vi)}
                                className="w-full h-full object-cover cursor-pointer img-fade-in"
                                loading="lazy"
                                decoding="async"
                                onClick={() => setLightboxImage(img)}
                                data-testid={`img-scene-${index}-variant-${vi}`}
                                onLoad={(e) => e.currentTarget.classList.add("loaded")}
                                onError={(e) => {
                                  const target = e.currentTarget;
                                  target.style.display = "none";
                                  const fallback = target.nextElementSibling as HTMLElement;
                                  if (fallback?.classList.contains("img-fallback")) fallback.style.display = "flex";
                                }}
                              />
                              <div className="img-fallback hidden w-full h-full items-center justify-center bg-muted/40 text-muted-foreground absolute inset-0">
                                <div className="flex flex-col items-center gap-1">
                                  <ImageIcon className="w-4 h-4 opacity-40" />
                                  <span className="text-[8px] opacity-60">Expired</span>
                                </div>
                              </div>
                              <div className="absolute top-1 right-1 flex gap-0.5 invisible group-hover:visible">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 bg-black/50 text-white/80 backdrop-blur-sm rounded-lg"
                                  onClick={(e) => { e.stopPropagation(); onRegenerateImage(img.id); }}
                                  disabled={regeneratingImageId === img.id}
                                  data-testid={`button-regen-${img.id}`}
                                  title="Regenerate this image"
                                >
                                  {regeneratingImageId === img.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 bg-black/50 text-white/80 backdrop-blur-sm rounded-lg"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (imageFeedbackId === img.id) {
                                      setImageFeedbackId(null);
                                      setImageFeedbackText("");
                                    } else {
                                      setImageFeedbackId(img.id);
                                      setImageFeedbackText("");
                                    }
                                  }}
                                  title="Regenerate with feedback"
                                >
                                  <Pencil className="w-3 h-3" />
                                </Button>
                                {onRegenerateImageWithConsistency && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 bg-black/50 text-amber-400/90 backdrop-blur-sm rounded-lg"
                                    onClick={(e) => { e.stopPropagation(); onRegenerateImageWithConsistency(img.id); }}
                                    disabled={regeneratingImageId === img.id}
                                    title="Regenerate with character consistency"
                                  >
                                    <Users className="w-3 h-3" />
                                  </Button>
                                )}
                                {(!img.videoStatus || img.videoStatus === "failed") ? (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6 bg-black/50 text-white/80 backdrop-blur-sm rounded-lg"
                                        onClick={(e) => e.stopPropagation()}
                                        disabled={videoGeneratingImageId === img.id}
                                        data-testid={`button-video-${img.id}`}
                                      >
                                        {videoGeneratingImageId === img.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Video className="w-3 h-3" />}
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
                                      {VIDEO_MODELS.map((m) => (
                                        <DropdownMenuItem key={m.id} onClick={() => onGenerateVideo(img.id, m.id)}>
                                          <div className="flex justify-between w-full items-center">
                                            <span className="text-xs font-medium">{m.name}</span>
                                            <span className="text-[10px] text-muted-foreground">{m.duration}s · {formatCost(m.costPerClip)}</span>
                                          </div>
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                ) : img.videoStatus === "completed" ? (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6 bg-black/50 text-white/80 backdrop-blur-sm rounded-lg"
                                        onClick={(e) => e.stopPropagation()}
                                        disabled={videoGeneratingImageId === img.id}
                                      >
                                        {videoGeneratingImageId === img.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
                                      <div className="px-2 py-1 text-[10px] text-muted-foreground font-medium">Regenerate Motion With:</div>
                                      {VIDEO_MODELS.map((m) => (
                                        <DropdownMenuItem key={m.id} onClick={() => onGenerateVideo(img.id, m.id)}>
                                          <div className="flex justify-between w-full items-center">
                                            <span className="text-xs font-medium">{m.name}</span>
                                            <span className="text-[10px] text-muted-foreground">{m.duration}s · {formatCost(m.costPerClip)}</span>
                                          </div>
                                        </DropdownMenuItem>
                                      ))}
                                      <DropdownMenuItem onClick={() => onRemoveVideo(img.id)} className="text-red-400 focus:text-red-400">
                                        <div className="flex items-center gap-1.5 w-full">
                                          <Trash2 className="w-3 h-3" />
                                          <span className="text-xs font-medium">Remove Video Clip</span>
                                        </div>
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                ) : null}
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 bg-black/50 text-red-400/80 backdrop-blur-sm rounded-lg hover:text-red-400 hover:bg-red-500/20"
                                  onClick={(e) => { e.stopPropagation(); if (confirm("Delete this image?")) onDeleteImage(img.id); }}
                                  title="Delete this image"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                              {img.videoStatus === "generating" && (
                                <div className="absolute top-1 left-1">
                                  <Badge variant="outline" className="text-[8px] bg-black/60 text-yellow-300 border-yellow-400/30 px-1 py-0 backdrop-blur-sm rounded-md" title={`Generating with ${VIDEO_MODELS.find(m => m.id === (img as any).videoModel)?.name || "unknown model"}`}>
                                    <Loader2 className="w-2 h-2 animate-spin mr-0.5" />{VIDEO_MODELS.find(m => m.id === (img as any).videoModel)?.name || "Video"}
                                  </Badge>
                                </div>
                              )}
                              {img.videoStatus === "failed" && (
                                <div className="absolute top-1 left-1">
                                  <Badge variant="destructive" className="text-[8px] px-1 py-0 rounded-md cursor-help" title={(img as any).videoError || "Video generation failed"}>
                                    <Video className="w-2 h-2 mr-0.5" />Failed
                                  </Badge>
                                </div>
                              )}
                              {img.videoStatus === "completed" && img.videoUrl && (
                                <div className="absolute top-1 left-1">
                                  <Badge variant="outline" className="text-[8px] bg-black/60 text-green-400 border-green-400/30 px-1 py-0 backdrop-blur-sm rounded-md">
                                    <Video className="w-2 h-2 mr-0.5" />Motion
                                  </Badge>
                                </div>
                              )}
                            </>
                          ) : img.status === "failed" ? (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 p-3 bg-destructive/5">
                              <AlertTriangle className="w-5 h-5 text-destructive/70" />
                              <span className="text-[10px] text-destructive font-medium">Failed</span>
                              {(img as any).error && (
                                <button
                                  onClick={() => setExpandedErrorId(expandedErrorId === img.id ? null : img.id)}
                                  className="text-[9px] text-destructive/60 hover:text-destructive/80 underline underline-offset-2 transition-colors"
                                >
                                  {expandedErrorId === img.id ? "Hide details" : "Show error"}
                                </button>
                              )}
                              {expandedErrorId === img.id && (img as any).error && (
                                <p className="text-[9px] text-destructive/70 text-center leading-tight px-1 max-h-12 overflow-y-auto">
                                  {(img as any).error}
                                </p>
                              )}
                              <div className="flex gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 hover:bg-destructive/10"
                                  onClick={() => onRegenerateImage(img.id)}
                                  disabled={regeneratingImageId === img.id}
                                  data-testid={`button-retry-${img.id}`}
                                  title="Retry generation"
                                >
                                  {regeneratingImageId === img.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 hover:bg-destructive/10 text-red-400/70 hover:text-red-400"
                                  onClick={() => onDeleteImage(img.id)}
                                  title="Delete this image"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 hover:bg-destructive/10"
                                  onClick={() => {
                                    setImageFeedbackId(img.id);
                                    setImageFeedbackText("");
                                  }}
                                  title="Retry with feedback"
                                >
                                  <Pencil className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-primary/5">
                              <div className="relative">
                                <Loader2 className="w-5 h-5 animate-spin text-primary/50" />
                                <div className="absolute inset-0 w-5 h-5 rounded-full animate-ping bg-primary/10" />
                              </div>
                              <span className="text-[10px] text-muted-foreground font-medium">Generating...</span>
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/70 to-transparent backdrop-blur-[2px]">
                            <p className="text-white text-[9px] font-medium truncate">
                              {getShotLabel(scene, vi)}
                            </p>
                          </div>
                        </div>

                        {imageFeedbackId === img.id && (
                          <div className="absolute -bottom-1 left-0 right-0 translate-y-full z-20 p-2 rounded-lg bg-black/90 border border-blue-500/30 backdrop-blur-xl shadow-xl animate-in fade-in slide-in-from-top-1 duration-200">
                            <div className="flex items-center gap-1 mb-1.5">
                              <Pencil className="w-3 h-3 text-blue-400" />
                              <span className="text-[10px] text-blue-300 font-semibold">Image Feedback</span>
                            </div>
                            <input
                              type="text"
                              value={imageFeedbackText}
                              onChange={(e) => setImageFeedbackText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && imageFeedbackText.trim()) {
                                  onRegenerateImage(img.id, imageFeedbackText.trim());
                                  setImageFeedbackId(null);
                                  setImageFeedbackText("");
                                }
                                if (e.key === "Escape") {
                                  setImageFeedbackId(null);
                                  setImageFeedbackText("");
                                }
                              }}
                              placeholder="Describe changes..."
                              className="w-full px-2 py-1.5 rounded text-[11px] bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-blue-500/40 mb-1.5"
                              autoFocus
                            />
                            <div className="flex gap-1 justify-end">
                              <button
                                onClick={() => { setImageFeedbackId(null); setImageFeedbackText(""); }}
                                className="px-2 py-1 rounded text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => {
                                  if (imageFeedbackText.trim()) {
                                    onRegenerateImage(img.id, imageFeedbackText.trim());
                                    setImageFeedbackId(null);
                                    setImageFeedbackText("");
                                  }
                                }}
                                disabled={!imageFeedbackText.trim()}
                                className="px-2 py-1 rounded text-[10px] bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors disabled:opacity-40"
                              >
                                Apply
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {scene.promptBase && (
                <details className="text-xs mt-3">
                  <summary className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors font-medium flex items-center gap-1.5">
                    <FileText className="w-3 h-3" />
                    View image prompts ({(() => { try { return JSON.parse(scene.promptBase).length; } catch { return "?"; } })()})
                  </summary>
                  <div className="mt-2 space-y-2">
                    {(() => {
                      try {
                        const prompts = JSON.parse(scene.promptBase);
                        return prompts.map((p: string, pi: number) => (
                          <div key={pi} className="p-3 rounded-xl glass-surface border border-[var(--glass-border)]">
                            <p className="font-medium text-foreground mb-1">{getShotLabel(scene, pi)}</p>
                            <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">{p}</p>
                          </div>
                        ));
                      } catch {
                        return <pre className="p-3 rounded-xl glass-surface border border-[var(--glass-border)] whitespace-pre-wrap text-muted-foreground leading-relaxed">{scene.promptBase}</pre>;
                      }
                    })()}
                  </div>
                </details>
              )}
            </Card>
          </div>
        );
      })}
      </div>

      <Lightbox
        images={allCompletedImages}
        scenes={scenes}
        selectedImage={lightboxImage}
        onClose={() => setLightboxImage(null)}
        onSelect={setLightboxImage}
        onRegenerateImage={onRegenerateImage}
        regeneratingImageId={regeneratingImageId}
        onGenerateVideo={onGenerateVideo}
        onRegenerateVideoWithFeedback={onRegenerateVideoWithFeedback}
        videoGeneratingImageId={videoGeneratingImageId}
        selectedVideoModel={selectedVideoModel}
        costPerImage={costPerImage}
      />
    </div>
  );
}

function GalleryView({
  images,
  scenes,
  onRefresh,
  onRegenerateImage,
  regeneratingImageId,
  onGenerateVideo,
  onRegenerateVideoWithFeedback,
  videoGeneratingImageId,
  selectedVideoModel,
  costPerImage,
}: {
  images: GeneratedImage[];
  scenes: Scene[];
  onRefresh: () => void;
  onRegenerateImage: (imageId: string, feedback?: string) => void;
  regeneratingImageId: string | null;
  onGenerateVideo: (imageId: string, modelOverride?: string) => void;
  onRegenerateVideoWithFeedback: (imageId: string, feedback: string, modelOverride?: string) => void;
  videoGeneratingImageId: string | null;
  selectedVideoModel: string;
  costPerImage: number;
}) {
  const completedImages = images.filter((img) => img.status === "completed" && img.imageUrl);
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);

  const sortedImages = [...completedImages].sort((a, b) => {
    const sceneA = scenes.find(s => s.id === a.sceneId);
    const sceneB = scenes.find(s => s.id === b.sceneId);
    const idxA = sceneA?.sentenceIndex ?? 0;
    const idxB = sceneB?.sentenceIndex ?? 0;
    if (idxA !== idxB) return idxA - idxB;
    return a.variant - b.variant;
  });

  if (completedImages.length === 0) {
    return (
      <Card className="p-8 flex flex-col items-center justify-center glass-card rounded-2xl">
        <div className="w-14 h-14 rounded-2xl glass-card flex items-center justify-center mb-4 animate-float">
          <Image className="w-7 h-7 text-muted-foreground" />
        </div>
        <h3 className="font-semibold mb-1">No images yet</h3>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          Generate images from the Storyboard tab to see them here in sequence.
        </p>
      </Card>
    );
  }

  const getShotLabel = (scene: Scene, variantIndex: number): string => {
    try {
      if (scene.shotLabels) {
        const labels = JSON.parse(scene.shotLabels);
        if (labels[variantIndex]) return labels[variantIndex];
      }
    } catch {}
    return `Shot ${variantIndex + 1}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {completedImages.length} images generated &middot; Shown in story order
        </p>
        <button
          onClick={onRefresh}
          className="ghost-btn text-xs px-3.5 py-1.5"
          data-testid="button-refresh-gallery"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>

      <div className="space-y-6">
        {scenes.map((scene, sceneIdx) => {
          const sceneCompletedImages = sortedImages.filter(img => img.sceneId === scene.id);
          if (sceneCompletedImages.length === 0) return null;

          return (
            <div key={scene.id} className="scene-card">
              <div className="flex items-center gap-2 mb-2 px-1">
                <Badge variant="outline" className="text-[11px] glass-badge border-primary/15 rounded-lg font-medium">Scene {sceneIdx + 1}</Badge>
                <p className="text-xs text-muted-foreground truncate">{scene.sceneDescription || scene.sentence}</p>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {sceneCompletedImages.map((img) => {
                  const shotLabel = getShotLabel(scene, img.variant - 1);
                  return (
                    <div
                      key={img.id}
                      className="relative shrink-0 w-56 aspect-video rounded-xl overflow-hidden bg-muted/30 cursor-pointer group border border-[var(--glass-border)] shadow-sm transition-all duration-300 hover:border-[var(--glass-highlight)] hover:shadow-lg hover:scale-[1.02]"
                      onClick={() => setSelectedImage(img)}
                      data-testid={`gallery-image-${img.id}`}
                    >
                      <img
                        src={proxyUrl(img.imageUrl)}
                        alt={shotLabel}
                        className="w-full h-full object-cover img-fade-in"
                        loading="lazy"
                        decoding="async"
                        onLoad={(e) => e.currentTarget.classList.add("loaded")}
                        onError={(e) => {
                          const target = e.currentTarget;
                          target.style.display = "none";
                          const fallback = target.nextElementSibling as HTMLElement;
                          if (fallback?.classList.contains("img-fallback")) fallback.style.display = "flex";
                        }}
                      />
                      <div className="img-fallback hidden w-full h-full items-center justify-center bg-muted/40 text-muted-foreground absolute inset-0">
                        <div className="flex flex-col items-center gap-1">
                          <ImageIcon className="w-5 h-5 opacity-40" />
                          <span className="text-[9px] opacity-60">Expired</span>
                        </div>
                      </div>
                      <div className="absolute top-1 right-1 flex gap-0.5 invisible group-hover:visible">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 bg-black/50 text-white/80 backdrop-blur-sm rounded-lg"
                          onClick={(e) => { e.stopPropagation(); onRegenerateImage(img.id); }}
                          disabled={regeneratingImageId === img.id}
                          data-testid={`button-gallery-regen-${img.id}`}
                        >
                          {regeneratingImageId === img.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                        </Button>
                        {(!img.videoStatus || img.videoStatus === "failed") ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 bg-black/50 text-white/80 backdrop-blur-sm rounded-lg"
                                onClick={(e) => e.stopPropagation()}
                                disabled={videoGeneratingImageId === img.id}
                                data-testid={`button-gallery-video-${img.id}`}
                              >
                                {videoGeneratingImageId === img.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Video className="w-3 h-3" />}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
                              {VIDEO_MODELS.map((m) => (
                                <DropdownMenuItem key={m.id} onClick={() => onGenerateVideo(img.id, m.id)}>
                                  <div className="flex justify-between w-full items-center">
                                    <span className="text-xs font-medium">{m.name}</span>
                                    <span className="text-[10px] text-muted-foreground">{m.duration}s · {formatCost(m.costPerClip)}</span>
                                  </div>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : img.videoStatus === "completed" ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 bg-black/50 text-white/80 backdrop-blur-sm rounded-lg"
                                onClick={(e) => e.stopPropagation()}
                                disabled={videoGeneratingImageId === img.id}
                              >
                                {videoGeneratingImageId === img.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
                              <div className="px-2 py-1 text-[10px] text-muted-foreground font-medium">Regenerate Motion With:</div>
                              {VIDEO_MODELS.map((m) => (
                                <DropdownMenuItem key={m.id} onClick={() => onGenerateVideo(img.id, m.id)}>
                                  <div className="flex justify-between w-full items-center">
                                    <span className="text-xs font-medium">{m.name}</span>
                                    <span className="text-[10px] text-muted-foreground">{m.duration}s · {formatCost(m.costPerClip)}</span>
                                  </div>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
                      {img.videoStatus === "generating" && (
                        <div className="absolute top-1 left-1">
                          <Badge variant="outline" className="text-[8px] bg-black/60 text-yellow-300 border-yellow-400/30 px-1 py-0 backdrop-blur-sm rounded-md" title={`Generating with ${VIDEO_MODELS.find(m => m.id === (img as any).videoModel)?.name || "unknown model"}`}>
                            <Loader2 className="w-2 h-2 animate-spin mr-0.5" />{VIDEO_MODELS.find(m => m.id === (img as any).videoModel)?.name || "Video"}
                          </Badge>
                        </div>
                      )}
                      {img.videoStatus === "failed" && (
                        <div className="absolute top-1 left-1">
                          <Badge variant="destructive" className="text-[8px] px-1 py-0 rounded-md cursor-help" title={(img as any).videoError || "Video generation failed"}>
                            <Video className="w-2 h-2 mr-0.5" />Failed
                          </Badge>
                        </div>
                      )}
                      {img.videoStatus === "completed" && img.videoUrl && (
                        <div className="absolute top-1 left-1">
                          <Badge variant="outline" className="text-[8px] bg-black/60 text-green-400 border-green-400/30 px-1 py-0 backdrop-blur-sm rounded-md">
                            <Video className="w-2 h-2 mr-0.5" />Motion
                          </Badge>
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/70 to-transparent backdrop-blur-[2px]">
                        <p className="text-white text-[10px] font-medium">
                          {shotLabel}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <Lightbox
        images={sortedImages}
        scenes={scenes}
        selectedImage={selectedImage}
        onClose={() => setSelectedImage(null)}
        onSelect={setSelectedImage}
        onRegenerateImage={onRegenerateImage}
        regeneratingImageId={regeneratingImageId}
        onGenerateVideo={onGenerateVideo}
        onRegenerateVideoWithFeedback={onRegenerateVideoWithFeedback}
        videoGeneratingImageId={videoGeneratingImageId}
        selectedVideoModel={selectedVideoModel}
        costPerImage={costPerImage}
      />
    </div>
  );
}

function ClipsView({
  projectId,
  images,
  scenes,
  onGenerateVideo,
  videoGeneratingImageId,
  selectedVideoModel,
  onRemoveVideo,
}: {
  projectId: string;
  images: GeneratedImage[];
  scenes: Scene[];
  onGenerateVideo: (imageId: string) => void;
  videoGeneratingImageId: string | null;
  selectedVideoModel: string;
  onRemoveVideo: (imageId: string) => void;
}) {
  const currentModel = VIDEO_MODELS.find(m => m.id === selectedVideoModel) || VIDEO_MODELS[0];
  const [playingClipId, setPlayingClipId] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<"idle" | "estimating" | "downloading">("idle");
  const [clipsInfo, setClipsInfo] = useState<{ totalClips: number; totalScenes: number; estimatedSizeMB: number } | null>(null);
  const { toast } = useToast();

  const completedClips = images.filter(
    (img) => img.videoStatus === "completed" && img.videoUrl && img.status === "completed"
  );
  const generatingClips = images.filter(
    (img) => img.videoStatus === "generating" && img.status === "completed"
  );
  const failedClips = images.filter(
    (img) => img.videoStatus === "failed" && img.status === "completed"
  );
  const availableForVideo = images.filter(
    (img) => img.status === "completed" && img.imageUrl && !img.videoStatus
  );

  const handleDownloadClips = async () => {
    if (downloadState === "downloading") return;
    
    if (!clipsInfo) {
      setDownloadState("estimating");
      try {
        const res = await fetch(`/api/projects/${projectId}/clips-info`, { headers: getApiHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setClipsInfo(data);
        setDownloadState("idle");
      } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
        setDownloadState("idle");
      }
      return;
    }

    setDownloadState("downloading");
    toast({ title: "Download started", description: `Downloading ${clipsInfo.totalClips} clips (~${clipsInfo.estimatedSizeMB > 1024 ? (clipsInfo.estimatedSizeMB / 1024).toFixed(1) + " GB" : clipsInfo.estimatedSizeMB + " MB"})... Your browser will save the file when complete.` });
    const a = document.createElement("a");
    a.href = `/api/projects/${projectId}/download-clips`;
    a.download = "clips.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => setDownloadState("idle"), 3000);
  };

  const sortedClips = [...completedClips].sort((a, b) => {
    const sceneA = scenes.find((s) => s.id === a.sceneId);
    const sceneB = scenes.find((s) => s.id === b.sceneId);
    const idxA = sceneA?.sentenceIndex ?? 0;
    const idxB = sceneB?.sentenceIndex ?? 0;
    if (idxA !== idxB) return idxA - idxB;
    return a.variant - b.variant;
  });

  const getShotLabel = (scene: Scene | undefined, variantIndex: number): string => {
    if (!scene) return `Shot ${variantIndex + 1}`;
    try {
      if (scene.shotLabels) {
        const labels = JSON.parse(scene.shotLabels);
        if (labels[variantIndex]) return labels[variantIndex];
      }
    } catch {}
    return `Shot ${variantIndex + 1}`;
  };

  if (completedClips.length === 0 && generatingClips.length === 0) {
    return (
      <div className="space-y-4">
        <Card className="p-8 flex flex-col items-center justify-center glass-card rounded-2xl">
          <div className="w-14 h-14 rounded-2xl glass-card flex items-center justify-center mb-4 animate-float">
            <Video className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="font-semibold mb-1">No video clips yet</h3>
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            Generate videos from your images using the "Create Motion" button in the Gallery or Storyboard tabs.
          </p>
          {availableForVideo.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {availableForVideo.length} images available for video conversion
            </p>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-sm text-muted-foreground" data-testid="text-clips-count">
            {completedClips.length} clip{completedClips.length !== 1 ? "s" : ""} ready
          </p>
          {generatingClips.length > 0 && (
            <Badge variant="outline" className="text-[11px] rounded-lg backdrop-blur-sm" data-testid="badge-clips-generating">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              {generatingClips.length} generating
            </Badge>
          )}
          {failedClips.length > 0 && (
            <Badge variant="destructive" className="text-[11px] rounded-lg" data-testid="badge-clips-failed">
              {failedClips.length} failed
            </Badge>
          )}
        </div>
        {completedClips.length > 0 && (
          <button
            onClick={handleDownloadClips}
            disabled={downloadState === "downloading" || downloadState === "estimating"}
            className="ghost-btn text-xs disabled:opacity-50"
            data-testid="btn-download-clips"
          >
            {downloadState === "estimating" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Calculating size...
              </>
            ) : downloadState === "downloading" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Downloading...
              </>
            ) : clipsInfo ? (
              <>
                <Download className="w-4 h-4" />
                Download All Clips ({clipsInfo.totalClips} clips, ~{clipsInfo.estimatedSizeMB > 1024 ? `${(clipsInfo.estimatedSizeMB / 1024).toFixed(1)} GB` : `${clipsInfo.estimatedSizeMB} MB`})
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download All Clips
              </>
            )}
          </button>
        )}
      </div>

      {generatingClips.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Generating
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {generatingClips.map((img) => {
              const scene = scenes.find((s) => s.id === img.sceneId);
              const sceneIdx = scene ? scenes.indexOf(scene) : -1;
              return (
                <Card key={img.id} className="overflow-hidden glass-card rounded-2xl" data-testid={`clip-generating-${img.id}`}>
                  <div className="relative aspect-video bg-muted/30">
                    {img.imageUrl && (
                      <img src={proxyUrl(img.imageUrl)} alt="Source frame" className="w-full h-full object-cover opacity-50" />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center backdrop-blur-sm">
                      <div className="flex flex-col items-center">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                        <p className="text-xs text-white mt-2 bg-black/50 px-3 py-1 rounded-lg backdrop-blur-sm">Creating motion...</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      {sceneIdx >= 0 && <Badge variant="outline" className="text-[11px] rounded-lg">Scene {sceneIdx + 1}</Badge>}
                      <span className="text-xs text-muted-foreground">{getShotLabel(scene, img.variant - 1)}</span>
                    </div>
                    {img.videoPrompt && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{img.videoPrompt}</p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {failedClips.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 text-destructive">Failed</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {failedClips.map((img) => {
              const scene = scenes.find((s) => s.id === img.sceneId);
              const sceneIdx = scene ? scenes.indexOf(scene) : -1;
              return (
                <Card key={img.id} className="overflow-hidden glass-card rounded-2xl" data-testid={`clip-failed-${img.id}`}>
                  <div className="relative aspect-video bg-muted/20">
                    {img.imageUrl && (
                      <img src={proxyUrl(img.imageUrl)} alt="Source frame" className="w-full h-full object-cover opacity-40" />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center backdrop-blur-sm">
                      <Badge variant="destructive" className="text-xs rounded-lg">Failed</Badge>
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        {sceneIdx >= 0 && <Badge variant="outline" className="text-[11px] rounded-lg">Scene {sceneIdx + 1}</Badge>}
                        <span className="text-xs text-muted-foreground">{getShotLabel(scene, img.variant - 1)}</span>
                      </div>
                      <button
                        onClick={() => onGenerateVideo(img.id)}
                        disabled={videoGeneratingImageId === img.id}
                        className="ghost-btn text-xs px-3 py-1.5 disabled:opacity-50"
                        data-testid={`button-clip-retry-${img.id}`}
                        title={`Retry with ${currentModel.name} ~${formatCost(currentModel.costPerClip)}`}
                      >
                        {videoGeneratingImageId === img.id ? (
                          <><Loader2 className="w-3 h-3 animate-spin" />Retrying</>
                        ) : (
                          <><RotateCcw className="w-3 h-3" />Retry (~{formatCost(currentModel.costPerClip)})</>
                        )}
                      </button>
                    </div>
                    {img.videoPrompt && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{img.videoPrompt}</p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {sortedClips.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Completed Clips</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sortedClips.map((img) => {
              const scene = scenes.find((s) => s.id === img.sceneId);
              const sceneIdx = scene ? scenes.indexOf(scene) : -1;
              const isPlaying = playingClipId === img.id;

              return (
                <Card key={img.id} className="overflow-hidden glass-card rounded-2xl transition-all duration-300 hover:shadow-lg hover:scale-[1.01]" data-testid={`clip-completed-${img.id}`}>
                  <div
                    className="relative aspect-video bg-black cursor-pointer group"
                    onClick={() => setPlayingClipId(isPlaying ? null : img.id)}
                    data-testid={`button-clip-play-${img.id}`}
                  >
                    {isPlaying ? (
                      <video
                        src={proxyUrl(img.videoUrl)}
                        autoPlay
                        loop
                        muted
                        playsInline
                        preload="auto"
                        className="w-full h-full object-contain"
                        data-testid={`video-clip-${img.id}`}
                      />
                    ) : (
                      <>
                        <img
                          src={proxyUrl(img.imageUrl)}
                          alt="Video thumbnail"
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                        <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-200">
                          <div className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center invisible group-hover:visible transition-all duration-300 hover:scale-110 hover:bg-black/60 hover:border-white/30">
                            <Play className="w-5 h-5 text-white ml-0.5" />
                          </div>
                        </div>
                      </>
                    )}
                    <div className="absolute top-1.5 right-1.5 flex gap-1">
                      {(img as any).videoModel && (
                        <Badge variant="outline" className="text-[9px] bg-black/60 text-white border-white/30 px-1.5 py-0 backdrop-blur-sm rounded-md">
                          {VIDEO_MODELS.find(m => m.id === (img as any).videoModel)?.name || (img as any).videoModel}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[9px] bg-black/60 text-green-400 border-green-400/30 px-1.5 py-0 backdrop-blur-sm rounded-md">
                        {VIDEO_MODELS.find(m => m.id === (img as any).videoModel)?.duration || 6}s
                      </Badge>
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        {sceneIdx >= 0 && <Badge variant="outline" className="text-[11px] shrink-0 rounded-lg">Scene {sceneIdx + 1}</Badge>}
                        <span className="text-xs text-muted-foreground truncate">{getShotLabel(scene, img.variant - 1)}</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <a href={proxyUrl(img.videoUrl)} target="_blank" rel="noopener noreferrer">
                          <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg hover:bg-[var(--glass-highlight)]" data-testid={`button-clip-download-${img.id}`}>
                            <Download className="w-3 h-3" />
                          </Button>
                        </a>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
                          onClick={() => { if (confirm("Remove this video clip?")) onRemoveVideo(img.id); }}
                          title="Remove video clip"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    {scene?.sceneDescription && (
                      <p className="text-xs text-muted-foreground/60 mt-1 line-clamp-1 leading-relaxed">
                        {scene.sceneDescription}
                      </p>
                    )}
                    {((img as any).videoPromptSent || img.videoPrompt) && (
                      <details className="mt-2">
                        <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors font-medium">
                          View video prompt
                        </summary>
                        <div className="mt-1.5 p-2.5 rounded-xl glass-surface border border-[var(--glass-border)] text-[10px] text-muted-foreground max-h-32 overflow-y-auto">
                          {(img as any).videoPromptSent ? (
                            <p className="whitespace-pre-wrap leading-relaxed">{(img as any).videoPromptSent}</p>
                          ) : (
                            <p className="whitespace-pre-wrap leading-relaxed">{img.videoPrompt}</p>
                          )}
                        </div>
                      </details>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Lightbox({
  images,
  scenes,
  selectedImage,
  onClose,
  onSelect,
  onRegenerateImage,
  regeneratingImageId,
  onGenerateVideo,
  onRegenerateVideoWithFeedback,
  videoGeneratingImageId,
  selectedVideoModel,
  costPerImage,
}: {
  images: GeneratedImage[];
  scenes: Scene[];
  selectedImage: GeneratedImage | null;
  onClose: () => void;
  onSelect: (img: GeneratedImage) => void;
  onRegenerateImage: (imageId: string, feedback?: string) => void;
  regeneratingImageId: string | null;
  onGenerateVideo: (imageId: string, modelOverride?: string) => void;
  onRegenerateVideoWithFeedback: (imageId: string, feedback: string, modelOverride?: string) => void;
  videoGeneratingImageId: string | null;
  selectedVideoModel: string;
  costPerImage: number;
}) {
  const [showVideo, setShowVideo] = useState(false);
  const [showVideoPrompt, setShowVideoPrompt] = useState(false);
  const [lightboxModel, setLightboxModel] = useState(selectedVideoModel);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [showVideoFeedback, setShowVideoFeedback] = useState(false);
  const [videoFeedbackText, setVideoFeedbackText] = useState("");
  const currentModel = VIDEO_MODELS.find(m => m.id === lightboxModel) || VIDEO_MODELS[0];
  const overlayRef = useRef<HTMLDivElement>(null);

  const getShotLabel = (scene: Scene | undefined, variantIndex: number): string => {
    if (!scene) return `Shot ${variantIndex + 1}`;
    try {
      if (scene.shotLabels) {
        const labels = JSON.parse(scene.shotLabels);
        if (labels[variantIndex]) return labels[variantIndex];
      }
    } catch {}
    return `Shot ${variantIndex + 1}`;
  };

  const currentIndex = selectedImage ? images.findIndex(img => img.id === selectedImage.id) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < images.length - 1;

  useEffect(() => {
    setShowVideo(false);
    setShowVideoPrompt(false);
    setShowFeedback(false);
    setFeedbackText("");
    setShowVideoFeedback(false);
    setVideoFeedbackText("");
  }, [selectedImage?.id]);

  useEffect(() => {
    setLightboxModel(selectedVideoModel);
  }, [selectedVideoModel]);

  const goPrev = useCallback(() => {
    if (hasPrev) onSelect(images[currentIndex - 1]);
  }, [hasPrev, currentIndex, images, onSelect]);

  const goNext = useCallback(() => {
    if (hasNext) onSelect(images[currentIndex + 1]);
  }, [hasNext, currentIndex, images, onSelect]);

  useEffect(() => {
    if (!selectedImage) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
      else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedImage, goPrev, goNext, onClose]);

  if (!selectedImage) return null;

  const scene = scenes.find(s => s.id === selectedImage.sceneId);
  const sceneIdx = scene ? scenes.indexOf(scene) : -1;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      data-testid="lightbox-overlay"
    >
      <button
        className="absolute top-4 right-4 text-white/60 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-all duration-200 z-10"
        onClick={onClose}
        data-testid="button-lightbox-close"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="absolute top-4 left-4 text-white/40 text-sm glass-surface px-3.5 py-1.5 rounded-xl border border-white/[0.06] backdrop-blur-xl" data-testid="text-lightbox-counter">
        {currentIndex + 1} / {images.length}
      </div>

      {hasPrev && (
        <button
          className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white z-10 w-11 h-11 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] hover:border-white/[0.15] transition-all duration-300 flex items-center justify-center hover:shadow-[0_0_20px_rgba(255,255,255,0.06)]"
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          data-testid="button-lightbox-prev"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {hasNext && (
        <button
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white z-10 w-11 h-11 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] hover:border-white/[0.15] transition-all duration-300 flex items-center justify-center hover:shadow-[0_0_20px_rgba(255,255,255,0.06)]"
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          data-testid="button-lightbox-next"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      <div className="max-w-5xl w-full mx-12 flex flex-col items-center">
        {showVideo && selectedImage.videoStatus === "completed" && selectedImage.videoUrl ? (
          <video
            src={proxyUrl(selectedImage.videoUrl)}
            controls
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="max-h-[75vh] w-auto max-w-full rounded-2xl shadow-2xl ring-1 ring-white/[0.06]"
            data-testid="video-lightbox"
          />
        ) : (
          <img
            src={proxyUrl(selectedImage.imageUrl)}
            alt={scene?.sentence || "Generated image"}
            className="max-h-[75vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl ring-1 ring-white/[0.06]"
            data-testid="img-lightbox"
          />
        )}
        <div className="mt-4 w-full max-w-3xl px-4 glass-surface rounded-2xl border border-white/[0.06] p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              {sceneIdx >= 0 && (
                <p className="text-white/40 text-xs mb-1 font-medium">
                  Scene {sceneIdx + 1} &middot; {getShotLabel(scene, selectedImage.variant - 1)}
                </p>
              )}
              <p className="text-white/70 text-sm truncate">
                {scene?.sceneDescription || scene?.sentence || ""}
              </p>
            </div>
            <a href={showVideo && selectedImage.videoUrl ? proxyUrl(selectedImage.videoUrl) : proxyUrl(selectedImage.imageUrl)} target="_blank" rel="noopener noreferrer">
              <button className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium border border-white/15 text-white/70 hover:text-white hover:border-white/25 hover:bg-white/[0.05] transition-all duration-200" data-testid="button-lightbox-download">
                <Download className="w-3 h-3" />
                Open Full Size
              </button>
            </a>
          </div>

          <div className="flex items-center gap-2 flex-wrap mt-3">
            <button
              onClick={() => onRegenerateImage(selectedImage.id)}
              disabled={regeneratingImageId === selectedImage.id}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium border border-white/15 text-white/70 hover:text-white hover:border-white/25 hover:bg-white/[0.05] transition-all duration-200 disabled:opacity-50"
              data-testid="button-lightbox-regenerate"
              title={`Estimated cost: ${formatCost(costPerImage)}`}
            >
              {regeneratingImageId === selectedImage.id ? (
                <><Loader2 className="w-3 h-3 animate-spin" />Regenerating</>
              ) : (
                <><RotateCcw className="w-3 h-3" />Regenerate (~{formatCost(costPerImage)})</>
              )}
            </button>

            <button
              onClick={() => { setShowFeedback(!showFeedback); setFeedbackText(""); }}
              disabled={regeneratingImageId === selectedImage.id}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium border border-white/15 text-white/70 hover:text-white hover:border-white/25 hover:bg-white/[0.05] transition-all duration-200 disabled:opacity-50"
              title="Regenerate with specific feedback"
            >
              <MessageSquare className="w-3 h-3" />{showFeedback ? "Cancel Feedback" : "Redo with Feedback"}
            </button>

            <div className="h-4 w-px bg-white/[0.08]" />

            <Select value={lightboxModel} onValueChange={setLightboxModel}>
              <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs bg-transparent border-white/15 text-white/70 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIDEO_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="text-xs">{m.name} ({m.duration}s · {formatCost(m.costPerClip)})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedImage.videoStatus === "completed" && selectedImage.videoUrl ? (
              <>
                <button
                  onClick={() => setShowVideo(!showVideo)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium border border-white/15 text-white/70 hover:text-white hover:border-white/25 hover:bg-white/[0.05] transition-all duration-200"
                  data-testid="button-lightbox-toggle-video"
                >
                  {showVideo ? (
                    <><Image className="w-3 h-3" />Show Image</>
                  ) : (
                    <><Video className="w-3 h-3" />Play Motion</>
                  )}
                </button>
                {(selectedImage as any).videoModel && (
                  <Badge variant="secondary" className="text-[10px] rounded-lg">
                    Made with: {VIDEO_MODELS.find(m => m.id === (selectedImage as any).videoModel)?.name || (selectedImage as any).videoModel}
                  </Badge>
                )}
                <button
                  onClick={() => onGenerateVideo(selectedImage.id, lightboxModel)}
                  disabled={videoGeneratingImageId === selectedImage.id}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium border border-white/15 text-white/70 hover:text-white hover:border-white/25 hover:bg-white/[0.05] transition-all duration-200 disabled:opacity-50"
                  title={`Re-generate video with ${currentModel.name}`}
                >
                  {videoGeneratingImageId === selectedImage.id ? (
                    <><Loader2 className="w-3 h-3 animate-spin" />Regenerating</>
                  ) : (
                    <><RotateCcw className="w-3 h-3" />Redo Motion ({currentModel.name} ~{formatCost(currentModel.costPerClip)})</>
                  )}
                </button>
                <button
                  onClick={() => { setShowVideoFeedback(!showVideoFeedback); setVideoFeedbackText(""); }}
                  disabled={videoGeneratingImageId === selectedImage.id}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium border border-amber-400/20 text-amber-300/70 hover:text-amber-300 hover:border-amber-400/30 hover:bg-amber-400/[0.05] transition-all duration-200 disabled:opacity-50"
                  title="Regenerate video with feedback on what to fix"
                >
                  <MessageSquare className="w-3 h-3" />{showVideoFeedback ? "Cancel" : "Redo Motion with Feedback"}
                </button>
              </>
            ) : selectedImage.videoStatus === "generating" ? (
              <button disabled className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium border border-yellow-400/30 text-yellow-300 opacity-80" data-testid="button-lightbox-video-pending">
                <Loader2 className="w-3 h-3 animate-spin" />Creating Motion ({VIDEO_MODELS.find(m => m.id === (selectedImage as any).videoModel)?.name || "Video"})
              </button>
            ) : (
              <button
                onClick={() => onGenerateVideo(selectedImage.id, lightboxModel)}
                disabled={videoGeneratingImageId === selectedImage.id}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium border border-white/15 text-white/70 hover:text-white hover:border-white/25 hover:bg-white/[0.05] transition-all duration-200 disabled:opacity-50"
                data-testid="button-lightbox-create-video"
                title={`Estimated cost: ${formatCost(currentModel.costPerClip)}`}
              >
                {videoGeneratingImageId === selectedImage.id ? (
                  <><Loader2 className="w-3 h-3 animate-spin" />Creating</>
                ) : selectedImage.videoStatus === "failed" ? (
                  <><Video className="w-3 h-3" />Retry Motion ({currentModel.name} ~{formatCost(currentModel.costPerClip)})</>
                ) : (
                  <><Video className="w-3 h-3" />Create Motion ({currentModel.name} ~{formatCost(currentModel.costPerClip)})</>
                )}
              </button>
            )}

            <div className="h-4 w-px bg-white/[0.08]" />

            <button
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs text-white/50 hover:text-white/70 transition-colors"
              onClick={() => setShowVideoPrompt(!showVideoPrompt)}
            >
              <FileText className="w-3 h-3" />
              {showVideoPrompt ? "Hide" : "Show"} Video Prompt
            </button>
          </div>

          {showFeedback && (
            <div className="mt-3 p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm w-full">
              <p className="text-white/50 text-xs mb-2 font-medium">Describe what you want changed:</p>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="e.g. 'make the character look more like Unreal Engine render, less photographic' or 'the lighting is too dark, brighten it up' or 'wrong uniform, should be navy blue flight suit'"
                className="w-full h-20 text-xs rounded-xl border border-white/10 bg-black/30 text-white px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary/40 placeholder:text-white/25 transition-all duration-200"
                autoFocus
              />
              <div className="flex gap-2 mt-2">
                <button
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold gradient-btn text-white border-0 transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
                  onClick={() => { onRegenerateImage(selectedImage.id, feedbackText); setShowFeedback(false); setFeedbackText(""); }}
                  disabled={!feedbackText.trim()}
                >
                  <Send className="w-3 h-3" />Apply & Regenerate (~{formatCost(costPerImage)})
                </button>
                <button
                  className="px-3.5 py-1.5 rounded-xl text-xs text-white/50 hover:text-white/70 transition-colors"
                  onClick={() => { setShowFeedback(false); setFeedbackText(""); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {showVideoFeedback && (
            <div className="mt-3 p-3.5 rounded-xl bg-amber-900/10 border border-amber-400/15 backdrop-blur-sm w-full">
              <p className="text-amber-300/70 text-xs mb-2 font-medium">Describe what's wrong with the motion:</p>
              <textarea
                value={videoFeedbackText}
                onChange={(e) => setVideoFeedbackText(e.target.value)}
                placeholder="e.g. 'the jet design keeps changing mid-clip' or 'too static, needs more cloud movement' or 'camera is too shaky' or 'the aircraft morphs into a different design'"
                className="w-full h-20 text-xs rounded-xl border border-amber-400/15 bg-black/30 text-white px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400/40 focus:border-amber-400/30 placeholder:text-white/25 transition-all duration-200"
                autoFocus
              />
              <div className="flex gap-2 mt-2">
                <button
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/20 transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
                  onClick={() => { onRegenerateVideoWithFeedback(selectedImage.id, videoFeedbackText, lightboxModel); setShowVideoFeedback(false); setVideoFeedbackText(""); }}
                  disabled={!videoFeedbackText.trim() || videoGeneratingImageId === selectedImage.id}
                >
                  <Send className="w-3 h-3" />Regenerate Motion with Feedback (~{formatCost(currentModel.costPerClip)})
                </button>
                <button
                  className="px-3.5 py-1.5 rounded-xl text-xs text-white/50 hover:text-white/70 transition-colors"
                  onClick={() => { setShowVideoFeedback(false); setVideoFeedbackText(""); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {showVideoPrompt && (
            <div className="mt-3 p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm text-white/70 text-xs max-h-48 overflow-y-auto">
              {(selectedImage as any).videoPromptSent ? (
                <>
                  <p className="text-white/40 text-[10px] font-medium mb-1">Prompt sent to video API:</p>
                  <p className="whitespace-pre-wrap leading-relaxed">{(selectedImage as any).videoPromptSent}</p>
                </>
              ) : selectedImage.videoPrompt ? (
                <>
                  <p className="text-white/40 text-[10px] font-medium mb-1">Motion direction prompt:</p>
                  <p className="whitespace-pre-wrap leading-relaxed">{selectedImage.videoPrompt}</p>
                </>
              ) : (
                <p className="text-white/30 italic">No video prompt available. Generate a video first to see the prompt.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

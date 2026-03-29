import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, ChevronRight, Clapperboard, Loader2, Trash2, Image, Video, DollarSign, Sparkles, ArrowRight, Film, Zap, Layers } from "lucide-react";
import type { Project } from "@shared/schema";
import { useState, useEffect } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ApiKeySettings } from "@/components/api-key-settings";

export default function Dashboard() {
  const [hasAnalyzing, setHasAnalyzing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const { toast } = useToast();
  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    refetchInterval: hasAnalyzing ? 5000 : false,
  });
  useEffect(() => {
    setHasAnalyzing(projects?.some((p) => p.status === "analyzing") || false);
  }, [projects]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project deleted" });
      setDeleteTarget(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete project", description: err.message, variant: "destructive" });
    },
  });

  const totalProjects = projects?.length || 0;
  const completedProjects = projects?.filter(p => p.status === "completed").length || 0;
  const totalSpent = projects?.reduce((sum, p) => {
    return sum + ((p as any).analysisCost || 0) + ((p as any).imageGenerationCost || 0) + ((p as any).videoGenerationCost || 0);
  }, 0) || 0;

  return (
    <div className="min-h-screen relative">
      {/* Ambient glow effects */}
      <div className="hero-glow" />

      <div className="relative z-10 p-6 md:p-10 lg:p-12">
        <div className="max-w-6xl mx-auto">

          {/* Top bar */}
          <div className="flex items-center justify-end gap-3 mb-12">
            <ApiKeySettings />
            <Link href="/new">
              <button className="flat-btn-primary group" data-testid="button-new-project">
                <Plus className="w-4 h-4" />
                New Project
                <ArrowRight className="w-3.5 h-3.5 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all duration-200" />
              </button>
            </Link>
          </div>

          {/* Hero Section */}
          <div className="mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] mb-6">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[11px] font-medium text-white/50 tracking-wide uppercase">AI-Powered Storyboarding</span>
              <span className="text-[10px] font-semibold text-blue-400/70 bg-blue-400/10 px-1.5 py-0.5 rounded-md tracking-wide">v1.1</span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-[56px] font-bold tracking-tight leading-[1.1] mb-5">
              <span className="text-white">Script</span>{" "}
              <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">Projects</span>
            </h1>
            <p className="text-white/35 text-base md:text-lg max-w-xl leading-relaxed">
              Transform your scripts into cinematic storyboards. AI analyzes every scene and generates stunning visuals.
            </p>
          </div>

          {/* Stats Row */}
          {totalProjects > 0 && (
            <div className="grid grid-cols-3 gap-4 mb-12">
              <div className="stat-card group">
                <div className="stat-card-icon bg-blue-500/10 group-hover:bg-blue-500/15">
                  <Clapperboard className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums text-white">{totalProjects}</p>
                  <p className="text-[11px] text-white/30 font-medium tracking-wide uppercase mt-0.5">Total Projects</p>
                </div>
              </div>
              <div className="stat-card group">
                <div className="stat-card-icon bg-emerald-500/10 group-hover:bg-emerald-500/15">
                  <Image className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums text-white">{completedProjects}</p>
                  <p className="text-[11px] text-white/30 font-medium tracking-wide uppercase mt-0.5">Completed</p>
                </div>
              </div>
              <div className="stat-card group">
                <div className="stat-card-icon bg-amber-500/10 group-hover:bg-amber-500/15">
                  <DollarSign className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums text-white">${totalSpent.toFixed(2)}</p>
                  <p className="text-[11px] text-white/30 font-medium tracking-wide uppercase mt-0.5">Total Spent</p>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="p-6 bg-white/[0.02] border-white/[0.06]">
                  <Skeleton className="h-5 w-3/4 mb-4 rounded-lg bg-white/[0.04]" />
                  <Skeleton className="h-4 w-full mb-2 rounded-lg bg-white/[0.04]" />
                  <Skeleton className="h-4 w-2/3 rounded-lg bg-white/[0.04]" />
                </Card>
              ))}
            </div>
          )}

          {/* Empty State - The Premium Showpiece */}
          {!isLoading && projects && projects.length === 0 && (
            <div className="empty-state-wrapper">
              <div className="empty-state-container">
                {/* Floating decorative orbs */}
                <div className="empty-state-orb-1" />
                <div className="empty-state-orb-2" />

                <div className="relative z-10 flex flex-col items-center text-center py-20 px-8">
                  {/* Animated icon cluster */}
                  <div className="relative mb-10">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500/20 via-indigo-500/20 to-purple-500/20 border border-white/[0.08] flex items-center justify-center backdrop-blur-sm">
                      <Film className="w-9 h-9 text-blue-400/80" />
                    </div>
                    <div className="absolute -top-3 -right-3 w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500/30 to-pink-500/30 border border-white/[0.08] flex items-center justify-center floating-badge">
                      <Zap className="w-4 h-4 text-purple-300" />
                    </div>
                    <div className="absolute -bottom-2 -left-3 w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500/25 to-cyan-500/25 border border-white/[0.08] flex items-center justify-center floating-badge-delayed">
                      <Layers className="w-3.5 h-3.5 text-emerald-300" />
                    </div>
                  </div>

                  <h2 className="text-2xl font-bold text-white mb-3 tracking-tight">Start Your First Project</h2>
                  <p className="text-white/30 text-sm mb-10 max-w-sm leading-relaxed">
                    Paste any script and watch AI transform it into a complete cinematic storyboard with scene-by-scene visuals.
                  </p>

                  {/* Feature highlights */}
                  <div className="grid grid-cols-3 gap-6 mb-10 w-full max-w-lg">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                        <Sparkles className="w-4.5 h-4.5 text-blue-400/70" />
                      </div>
                      <span className="text-[11px] text-white/25 font-medium">AI Analysis</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                        <Film className="w-4.5 h-4.5 text-indigo-400/70" />
                      </div>
                      <span className="text-[11px] text-white/25 font-medium">Scene Breakdown</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                        <Image className="w-4.5 h-4.5 text-purple-400/70" />
                      </div>
                      <span className="text-[11px] text-white/25 font-medium">Image Gen</span>
                    </div>
                  </div>

                  <Link href="/new">
                    <button className="create-first-btn group" data-testid="button-empty-new-project">
                      <span className="relative z-10 flex items-center gap-2.5">
                        <Plus className="w-4 h-4" />
                        Create First Project
                        <ArrowRight className="w-4 h-4 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300" />
                      </span>
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Project Grid */}
          {!isLoading && projects && projects.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onDelete={() => setDeleteTarget(project)}
                />
              ))}
            </div>
          )}

          <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
            <AlertDialogContent className="bg-[#0d1117] border-white/[0.08] shadow-2xl shadow-black/50">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-white">Delete project?</AlertDialogTitle>
                <AlertDialogDescription className="text-white/40">
                  This will permanently delete "{deleteTarget?.title}" and all its scenes, images, and videos.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-delete" className="rounded-xl bg-white/[0.05] border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.08]">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  data-testid="button-confirm-delete"
                  className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/20 rounded-xl"
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
    </div>
  );
}

function ProjectCard({ project, onDelete }: { project: Project; onDelete: () => void }) {
  const spent = ((project as any).analysisCost || 0) + ((project as any).imageGenerationCost || 0) + ((project as any).videoGenerationCost || 0);
  const sceneCount = project.script.split(/[.!?]+/).filter(Boolean).length;

  return (
    <div
      className="project-card group relative overflow-hidden rounded-2xl cursor-pointer"
      data-testid={`card-project-${project.id}`}
    >
      <Link href={`/project/${project.id}`}>
        <div className="p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <h3 className="font-semibold text-[14px] leading-snug line-clamp-2 text-white/90 group-hover:text-white transition-colors" data-testid={`text-project-title-${project.id}`}>
              {project.title}
            </h3>
            <StatusBadge status={project.status} />
          </div>

          <p className="text-[13px] text-white/25 line-clamp-2 leading-relaxed mb-5">
            {project.script.substring(0, 120)}...
          </p>

          <div className="flex items-center gap-4 text-[11px] text-white/20">
            <span className="flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5" />
              {sceneCount} scenes
            </span>
            {spent > 0 && (
              <span className="flex items-center gap-1.5 text-emerald-400/60">
                <DollarSign className="w-3.5 h-3.5" />
                {spent.toFixed(2)}
              </span>
            )}
            <ChevronRight className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-100 group-hover:translate-x-0 -translate-x-1 transition-all duration-300 text-white/30" />
          </div>
        </div>
      </Link>

      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 h-7 w-7 opacity-0 group-hover:opacity-100 transition-all duration-200 text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded-lg z-10"
        data-testid={`button-delete-project-${project.id}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    draft: "bg-white/[0.04] text-white/30 border-white/[0.06]",
    analyzing: "bg-blue-500/10 text-blue-400 border-blue-500/15",
    analyzed: "bg-indigo-500/10 text-indigo-400 border-indigo-500/15",
    generating: "bg-amber-500/10 text-amber-400 border-amber-500/15",
    completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/15",
  };
  return (
    <Badge variant="outline" className={`text-[10px] capitalize rounded-lg font-medium px-2.5 py-1 shrink-0 ${variants[status] || ""}`} data-testid={`badge-status-${status}`}>
      {status === "analyzing" && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
      {status === "generating" && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
      {status}
    </Badge>
  );
}

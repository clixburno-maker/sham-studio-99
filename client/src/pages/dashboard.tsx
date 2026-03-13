import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Film, ChevronRight, Plane, Crosshair, Loader2, Trash2, PenTool, BookOpen, FileText, Mic } from "lucide-react";
import type { Project } from "@shared/schema";
import { useState, useEffect } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ApiKeySettings } from "@/components/api-key-settings";

const toolCards = [
  {
    title: "AI Script Writer",
    subtitle: "Topic in, cinematic script + voiceover out",
    icon: PenTool,
    href: "/write",
    btnLabel: "Write with AI",
    gradient: "from-purple-500/15 to-violet-500/10",
    ring: "ring-purple-500/20 group-hover:ring-purple-400/35",
    iconColor: "text-purple-400",
    primary: true,
  },
  {
    title: "Niche Training",
    subtitle: "Clone any channel's writing style with AI",
    icon: BookOpen,
    href: "/niches",
    btnLabel: "Manage Niches",
    gradient: "from-orange-500/15 to-amber-500/10",
    ring: "ring-orange-500/20 group-hover:ring-orange-400/35",
    iconColor: "text-orange-400",
  },
  {
    title: "Saved Scripts",
    subtitle: "All your generated scripts & voiceovers",
    icon: FileText,
    href: "/scripts",
    btnLabel: "View Scripts",
    gradient: "from-emerald-500/15 to-teal-500/10",
    ring: "ring-emerald-500/20 group-hover:ring-emerald-400/35",
    iconColor: "text-emerald-400",
  },
  {
    title: "Voiceover",
    subtitle: "AI voice generation for your scripts",
    icon: Mic,
    href: "/voiceover",
    btnLabel: "Generate Voiceover",
    gradient: "from-blue-500/15 to-cyan-500/10",
    ring: "ring-blue-500/20 group-hover:ring-blue-400/35",
    iconColor: "text-blue-400",
  },
];

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

  return (
    <div className="min-h-full p-6 md:p-10">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-end mb-4">
          <ApiKeySettings />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-14">
          {toolCards.map((card) => (
            <Card key={card.title} className="glass-card rounded-2xl p-5 shimmer-border group transition-all duration-300 hover:scale-[1.01]">
              <div className="flex flex-col gap-3.5">
                <div className="flex items-center gap-3">
                  <div className={`icon-box bg-gradient-to-br ${card.gradient} ${card.ring} w-10 h-10 rounded-xl`}>
                    <card.icon className={`w-[18px] h-[18px] ${card.iconColor}`} />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold tracking-tight">{card.title}</h2>
                    <p className="text-muted-foreground text-xs mt-0.5">{card.subtitle}</p>
                  </div>
                </div>
                <Link href={card.href}>
                  {card.primary ? (
                    <button className="w-full ios-btn ios-btn-primary justify-center">
                      <card.icon className="w-4 h-4" />
                      {card.btnLabel}
                    </button>
                  ) : (
                    <button className="w-full ios-btn ios-btn-secondary justify-center">
                      <card.icon className="w-4 h-4" />
                      {card.btnLabel}
                    </button>
                  )}
                </Link>
              </div>
            </Card>
          ))}
        </div>

        <div className="flex flex-row items-end justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight gradient-text" data-testid="text-dashboard-title">
              Script Projects
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Paste your aviation script and generate cinematic visuals
            </p>
          </div>
          <Link href="/new">
            <button className="ios-btn ios-btn-primary"
              data-testid="button-new-project">
              <Plus className="w-4 h-4" />
              New Project
            </button>
          </Link>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="p-5 glass-card rounded-2xl">
                <Skeleton className="h-5 w-3/4 mb-3 rounded-lg" />
                <Skeleton className="h-4 w-full mb-2 rounded-lg" />
                <Skeleton className="h-4 w-2/3 rounded-lg" />
              </Card>
            ))}
          </div>
        )}

        {!isLoading && projects && projects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-28">
            <div className="w-14 h-14 rounded-2xl glass-card flex items-center justify-center mb-4">
              <Film className="w-6 h-6 text-muted-foreground" />
            </div>
            <h2 className="text-base font-semibold mb-1">No projects yet</h2>
            <p className="text-muted-foreground text-sm mb-5 text-center max-w-sm leading-relaxed">
              Create your first project by pasting an aviation script to start generating cinematic visuals.
            </p>
            <Link href="/new">
              <button className="ios-btn ios-btn-primary"
                data-testid="button-empty-new-project">
                <Plus className="w-4 h-4" />
                Create First Project
              </button>
            </Link>
          </div>
        )}

        {!isLoading && projects && projects.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="p-4 glass-card rounded-2xl cursor-pointer group transition-all duration-300 relative hover:scale-[1.01]"
                data-testid={`card-project-${project.id}`}
              >
                <Link href={`/project/${project.id}`}>
                  <div className="flex flex-row items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="icon-box bg-gradient-to-br from-primary/15 to-primary/5 ring-primary/20 group-hover:ring-primary/35 w-8 h-8 rounded-lg">
                        <Plane className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <h3 className="font-semibold text-sm truncate" data-testid={`text-project-title-${project.id}`}>
                        {project.title}
                      </h3>
                    </div>
                    <StatusBadge status={project.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2.5 line-clamp-2 leading-relaxed">
                    {project.script.substring(0, 150)}...
                  </p>
                  <div className="flex items-center gap-1 mt-2.5 text-xs text-muted-foreground">
                    <Crosshair className="w-3 h-3" />
                    <span>
                      {project.script.split(/[.!?]+/).filter(Boolean).length} scenes
                    </span>
                    <ChevronRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-0.5" />
                  </div>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-3 right-3 h-7 w-7 opacity-0 group-hover:opacity-100 transition-all duration-200 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                  data-testid={`button-delete-project-${project.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDeleteTarget(project);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </Card>
            ))}
          </div>
        )}

        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent className="glass-card rounded-2xl border-[var(--glass-border)]">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete project?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete "{deleteTarget?.title}" and all its scenes, images, and videos. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete" className="rounded-xl">Cancel</AlertDialogCancel>
              <AlertDialogAction
                data-testid="button-confirm-delete"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
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

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    draft: "bg-muted/40 text-muted-foreground border-muted-foreground/15 backdrop-blur-sm",
    analyzing: "bg-blue-500/10 text-blue-500 dark:text-blue-400 border-blue-500/20 backdrop-blur-sm",
    analyzed: "bg-primary/10 text-primary border-primary/20 backdrop-blur-sm",
    generating: "bg-chart-3/10 text-chart-3 border-chart-3/20 backdrop-blur-sm",
    completed: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 backdrop-blur-sm",
  };
  return (
    <Badge variant="outline" className={`text-[10px] capitalize rounded-lg font-medium px-2 py-0.5 ${variants[status] || ""}`} data-testid={`badge-status-${status}`}>
      {status === "analyzing" && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
      {status}
    </Badge>
  );
}

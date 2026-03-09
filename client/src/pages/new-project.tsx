import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Sparkles, FileText, Plane } from "lucide-react";
import { Link } from "wouter";

export default function NewProject() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");

  const createProject = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/projects", { title, script, status: "draft" });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project created", description: "Now analyzing your script..." });
      navigate(`/project/${data.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0;
  const sentenceCount = (() => {
    if (!script.trim()) return 0;
    const cleaned = script.replace(/(\d)\.(\d)/g, "$1_$2");
    return cleaned.split(/[.!?]+/).filter((s) => s.trim()).length;
  })();

  return (
    <div className="min-h-full p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        <Link href="/">
          <Button variant="ghost" className="mb-5 -ml-2 text-muted-foreground hover:text-foreground transition-colors duration-200 rounded-xl" data-testid="button-back-dashboard">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Projects
          </Button>
        </Link>

        <div className="flex items-center gap-3 mb-7">
          <div className="icon-box bg-gradient-to-br from-primary/15 to-primary/5 ring-primary/20 w-10 h-10 glow-sm">
            <Plane className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight gradient-text" data-testid="text-new-project-title">
              New Visual Project
            </h1>
            <p className="text-muted-foreground text-sm">
              Paste your aviation script to generate cinematic visuals
            </p>
          </div>
        </div>

        <Card className="glass-card p-6 md:p-8 rounded-2xl">
          <div className="space-y-6">
            <div className="space-y-2.5">
              <Label htmlFor="title" className="text-sm font-medium tracking-wide">Project Title</Label>
              <Input
                id="title"
                placeholder="e.g. Top Gun: Maverick - Scene Breakdown"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="glass-input rounded-xl h-11"
                data-testid="input-project-title"
              />
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label htmlFor="script" className="text-sm font-medium tracking-wide">Video Script</Label>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="glass-badge px-2.5 py-1 rounded-lg" data-testid="text-word-count">{wordCount} words</span>
                  <span className="glass-badge px-2.5 py-1 rounded-lg" data-testid="text-sentence-count">{sentenceCount} sentences</span>
                </div>
              </div>
              <Textarea
                id="script"
                placeholder="Paste your full aviation/military jet video script here...&#10;&#10;Example:&#10;The F-22 Raptor banks sharply against the sunset sky. Colonel James Mitchell grips the throttle as the jet accelerates through Mach 1.5. Two enemy Su-57s appear on radar, closing fast from the north..."
                className="min-h-[300px] text-sm leading-relaxed glass-input rounded-xl"
                value={script}
                onChange={(e) => setScript(e.target.value)}
                data-testid="input-project-script"
              />
            </div>

            <div className="flex items-center gap-2.5 p-4 rounded-xl glass-panel">
              <FileText className="w-4 h-4 text-primary/60 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                The tool will analyze every sentence, identify characters, jets, locations, and generate
                4 Unreal Engine 3D render images per sentence with full visual consistency.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Link href="/">
                <button className="ghost-btn" data-testid="button-cancel">
                  Cancel
                </button>
              </Link>
              <button
                onClick={() => createProject.mutate()}
                disabled={!title.trim() || !script.trim() || createProject.isPending}
                className={`ios-btn ${title.trim() && script.trim()
                    ? "ios-btn-primary glow-sm hover:glow-md"
                    : "ios-btn-secondary cursor-not-allowed opacity-60"
                  }`}
                data-testid="button-create-project"
              >
                {createProject.isPending ? (
                  <>Analyzing...</>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Create & Analyze Script
                  </>
                )}
              </button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

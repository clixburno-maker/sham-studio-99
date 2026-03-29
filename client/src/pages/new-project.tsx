import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Sparkles, FileText, Type, AlignLeft, Loader2 } from "lucide-react";
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
      toast({ title: "Project created", description: "Your project is ready. Click Analyze to begin." });
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
  const isReady = title.trim().length > 0 && script.trim().length > 0;

  return (
    <div className="min-h-full p-5 md:p-8 lg:p-10">
      <div className="max-w-2xl mx-auto">

        <Link href="/">
          <button className="flat-btn-ghost mb-6" data-testid="button-back-dashboard">
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </Link>

        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-[#e5e5e5]" data-testid="text-new-project-title">
            New Project
          </h1>
          <p className="text-[#737373] text-sm mt-1">
            Paste your script and the AI will break it into cinematic scenes
          </p>
        </div>

        <div className="space-y-5">

          <Card className="p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="icon-box">
                <Type className="w-3.5 h-3.5 text-[#a3a3a3]" />
              </div>
              <Label htmlFor="title" className="text-sm font-semibold text-[#e5e5e5]">Project Title</Label>
            </div>
            <Input
              id="title"
              placeholder="e.g. The Battle of Midway — Scene Breakdown"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="surface-input rounded-lg h-11"
              data-testid="input-project-title"
            />
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="icon-box">
                  <AlignLeft className="w-3.5 h-3.5 text-[#a3a3a3]" />
                </div>
                <Label htmlFor="script" className="text-sm font-semibold text-[#e5e5e5]">Script</Label>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#737373]">
                <span className="bg-[#1a1a1a] border border-[#262626] px-2 py-0.5 rounded-md tabular-nums" data-testid="text-word-count">{wordCount} words</span>
                <span className="bg-[#1a1a1a] border border-[#262626] px-2 py-0.5 rounded-md tabular-nums" data-testid="text-sentence-count">{sentenceCount} sentences</span>
              </div>
            </div>
            <Textarea
              id="script"
              placeholder={"Paste your full video script here...\n\nExample:\nThe F-22 Raptor banks sharply against the sunset sky. Colonel James Mitchell grips the throttle as the jet accelerates through Mach 1.5. Two enemy Su-57s appear on radar, closing fast from the north..."}
              className="min-h-[280px] text-sm leading-relaxed surface-input rounded-lg resize-y"
              value={script}
              onChange={(e) => setScript(e.target.value)}
              data-testid="input-project-script"
            />
          </Card>

          <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg surface-elevated">
            <FileText className="w-4 h-4 text-[#525252] shrink-0" />
            <p className="text-xs text-[#737373] leading-relaxed">
              Each sentence becomes a visual scene with 4+ AI-generated storyboard images. Characters, locations, and objects are tracked for consistency.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Link href="/">
              <button className="flat-btn-ghost" data-testid="button-cancel">Cancel</button>
            </Link>
            <button
              onClick={() => createProject.mutate()}
              disabled={!isReady || createProject.isPending}
              className={`flat-btn-primary ${!isReady ? "opacity-40 cursor-not-allowed" : ""}`}
              data-testid="button-create-project"
            >
              {createProject.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Creating...</>
              ) : (
                <><Sparkles className="w-4 h-4" />Create Project</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

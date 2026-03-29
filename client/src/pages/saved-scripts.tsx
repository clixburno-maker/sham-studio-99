import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft,
  FileText,
  Clock,
  GraduationCap,
  Mic,
  Clapperboard,
  Trash2,
  Play,
  Pause,
  ExternalLink,
  Copy,
} from "lucide-react";
import { Link } from "wouter";
import { useState, useRef } from "react";

interface SavedScript {
  id: string;
  topic: string;
  script: string;
  wordCount: number | null;
  durationMinutes: number | null;
  nicheId: string | null;
  nicheName: string | null;
  voiceoverUrl: string | null;
  voiceId: string | null;
  voiceName: string | null;
  projectId: string | null;
  createdAt: string | null;
}

export default function SavedScriptsPage() {
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data: scripts, isLoading } = useQuery<SavedScript[]>({
    queryKey: ["/api/saved-scripts"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/saved-scripts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-scripts"] });
      toast({ title: "Script deleted" });
    },
  });

  const togglePlay = (script: SavedScript) => {
    if (playingId === script.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(script.voiceoverUrl!);
      audio.onended = () => setPlayingId(null);
      audio.play();
      audioRef.current = audio;
      setPlayingId(script.id);
    }
  };

  const copyScript = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Script copied to clipboard" });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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

        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20 flex items-center justify-center">
            <FileText className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#e5e5e5]">Saved Scripts</h1>
            <p className="text-muted-foreground text-sm">
              {scripts?.length || 0} scripts generated
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : !scripts?.length ? (
          <Card className="p-12 rounded-lg text-center">
            <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="font-semibold text-lg mb-2">No scripts yet</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Scripts you generate will be automatically saved here
            </p>
            <Link href="/write">
              <Button className="bg-primary text-white">Write a Script</Button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-3">
            {scripts.map((script) => (
              <Card
                key={script.id}
                className="rounded-xl overflow-hidden transition-all duration-200 hover:border-[var(--glass-border-hover)]"
              >
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === script.id ? null : script.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium text-sm truncate">{script.topic}</h3>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(script.createdAt)}
                        </span>
                        {script.wordCount && (
                          <span className="text-xs text-muted-foreground">
                            {script.wordCount.toLocaleString()} words
                          </span>
                        )}
                        {script.durationMinutes && (
                          <span className="text-xs text-muted-foreground">
                            {script.durationMinutes} min
                          </span>
                        )}
                        {script.nicheName && (
                          <span className="text-xs text-purple-400 flex items-center gap-1">
                            <GraduationCap className="w-3 h-3" />
                            {script.nicheName}
                          </span>
                        )}
                        {script.voiceoverUrl && (
                          <span className="text-xs text-blue-400 flex items-center gap-1">
                            <Mic className="w-3 h-3" />
                            Voiceover
                          </span>
                        )}
                        {script.projectId && (
                          <Link href={`/project/${script.projectId}`}>
                            <span className="text-xs text-green-400 flex items-center gap-1 hover:underline">
                              <Clapperboard className="w-3 h-3" />
                              Project
                              <ExternalLink className="w-2.5 h-2.5" />
                            </span>
                          </Link>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {script.voiceoverUrl && (
                        <button
                          onClick={(e) => { e.stopPropagation(); togglePlay(script); }}
                          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                        >
                          {playingId === script.id ? (
                            <Pause className="w-4 h-4 text-blue-400" />
                          ) : (
                            <Play className="w-4 h-4 text-muted-foreground" />
                          )}
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); copyScript(script.script); }}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                      >
                        <Copy className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(script.id); }}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-muted-foreground hover:text-red-400" />
                      </button>
                    </div>
                  </div>
                </div>

                {expandedId === script.id && (
                  <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="border-t border-[#1a1a1a] pt-3">
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto font-sans">
                        {script.script}
                      </pre>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useRef, useEffect, useCallback } from "react";
import { useChat, type AssistantAction } from "@/lib/chat-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  MessageSquare, Send, X, Bot, User, Loader2,
  CheckCircle, Sparkles, Trash2, ChevronRight,
  Image, Film, Pencil, RefreshCw, Users, Play,
  Wand2, BookOpen, FileText, Zap, Video, Mic,
  ScanSearch, Layers, XCircle, Settings2, DollarSign,
  Paperclip, ImagePlus
} from "lucide-react";

const ACTION_ICONS: Record<string, typeof Image> = {
  analyze_project: BookOpen,
  generate_all_images: Layers,
  regenerate_image: Image,
  edit_prompt: Pencil,
  regenerate_scene: RefreshCw,
  regenerate_scene_prompts: Wand2,
  delete_image: XCircle,
  retry_failed_images: Zap,
  smart_regenerate: ScanSearch,
  edit_character: Users,
  regenerate_character_refs: Users,
  edit_script: FileText,
  update_scene: Settings2,
  generate_video: Play,
  regenerate_video: Video,
  animate_scene_videos: Film,
  animate_all_videos: Film,
  remove_video: XCircle,
  generate_voiceover: Mic,
};

const ACTION_COLORS: Record<string, string> = {
  analyze_project: "text-purple-400",
  generate_all_images: "text-emerald-400",
  regenerate_image: "text-blue-400",
  edit_prompt: "text-amber-400",
  regenerate_scene: "text-blue-400",
  regenerate_scene_prompts: "text-violet-400",
  delete_image: "text-red-400",
  retry_failed_images: "text-yellow-400",
  smart_regenerate: "text-cyan-400",
  edit_character: "text-pink-400",
  regenerate_character_refs: "text-pink-400",
  edit_script: "text-orange-400",
  update_scene: "text-slate-400",
  generate_video: "text-green-400",
  regenerate_video: "text-green-400",
  animate_scene_videos: "text-emerald-400",
  animate_all_videos: "text-emerald-400",
  remove_video: "text-red-400",
  generate_voiceover: "text-indigo-400",
};

function ActionCard({
  actions,
  executed,
  onExecute,
  executing,
}: {
  actions: AssistantAction[];
  executed: boolean;
  onExecute: () => void;
  executing: boolean;
}) {
  const hasCostActions = actions.some(a =>
    ["generate_all_images", "regenerate_image", "regenerate_scene", "generate_video",
     "regenerate_video", "animate_scene_videos", "animate_all_videos", "smart_regenerate",
     "retry_failed_images", "edit_prompt", "regenerate_character_refs"].includes(a.type)
  );

  return (
    <div className="mt-3 rounded-xl border border-blue-500/20 bg-gradient-to-b from-blue-500/5 to-purple-500/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-blue-400 uppercase tracking-wider">
          <Sparkles className="w-3 h-3" />
          {actions.length === 1 ? "Proposed Action" : `${actions.length} Proposed Actions`}
        </div>
        {hasCostActions && (
          <div className="flex items-center gap-1 text-[10px] text-amber-400/70">
            <DollarSign className="w-3 h-3" />
            API cost applies
          </div>
        )}
      </div>
      {actions.map((action, i) => {
        const Icon = ACTION_ICONS[action.type] || ChevronRight;
        const color = ACTION_COLORS[action.type] || "text-blue-400";
        return (
          <div key={i} className="flex items-start gap-2 text-[13px] text-white/70 bg-white/[0.02] rounded-lg px-2.5 py-2">
            <Icon className={`w-3.5 h-3.5 mt-0.5 ${color} shrink-0`} />
            <div className="flex-1">
              <span>{action.description}</span>
              <span className="ml-2 text-[10px] text-white/30 font-mono">{action.type}</span>
            </div>
          </div>
        );
      })}
      {!executed ? (
        <div className="flex gap-2 pt-1">
          <button
            onClick={onExecute}
            disabled={executing}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-[12px] font-semibold transition-all disabled:opacity-50 shadow-lg shadow-blue-600/20"
          >
            {executing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Executing...
              </>
            ) : (
              <>
                <CheckCircle className="w-3.5 h-3.5" />
                Confirm & Execute
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[12px] text-emerald-400 font-medium pt-1">
          <CheckCircle className="w-3.5 h-3.5" />
          Actions executed successfully
        </div>
      )}
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ImageThumbnail({ src, onRemove }: { src: string; onRemove?: () => void }) {
  return (
    <div className="relative group w-16 h-16 rounded-lg overflow-hidden border border-white/10 shrink-0">
      <img src={src} alt="" className="w-full h-full object-cover" />
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute top-0 right-0 w-5 h-5 bg-black/70 rounded-bl-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="w-3 h-3 text-white" />
        </button>
      )}
    </div>
  );
}

export function ChatSidebar() {
  const {
    isOpen, setIsOpen, messages, addMessage, clearMessages,
    markActionsExecuted, projectId, focusedSceneId, isLoading, setIsLoading,
  } = useChat();
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const addImageFiles = useCallback(async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    if (attachedImages.length + imageFiles.length > 5) {
      toast({ title: "Too many images", description: "Maximum 5 images per message", variant: "destructive" });
      return;
    }
    const dataUrls = await Promise.all(imageFiles.map(f => fileToDataUrl(f)));
    setAttachedImages(prev => [...prev, ...dataUrls]);
  }, [attachedImages.length, toast]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      addImageFiles(imageFiles);
    }
  }, [addImageFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      addImageFiles(e.dataTransfer.files);
    }
  }, [addImageFiles]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    const images = [...attachedImages];
    if ((!text && images.length === 0) || isLoading) return;

    const messageText = text || (images.length > 0 ? "Please analyze this image and tell me what issues you see." : "");

    setInput("");
    setAttachedImages([]);
    addMessage({ role: "user", content: messageText, imageUrls: images.length > 0 ? images : undefined });
    setIsLoading(true);

    try {
      const allMessages = [
        ...messages.map(m => ({
          role: m.role,
          content: m.content,
          ...(m.imageUrls ? { imageUrls: m.imageUrls } : {}),
        })),
        {
          role: "user" as const,
          content: messageText,
          ...(images.length > 0 ? { imageUrls: images } : {}),
        },
      ];

      const url = projectId
        ? `/api/projects/${projectId}/assistant/chat`
        : "/api/assistant/chat";

      const res = await apiRequest("POST", url, {
        messages: allMessages,
        focusedSceneId,
      });

      const data = await res.json();

      addMessage({
        role: "assistant",
        content: data.reply,
        actions: data.hasActions ? data.actions : undefined,
      });
    } catch (err: any) {
      addMessage({
        role: "assistant",
        content: `Sorry, I encountered an error: ${err.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  }, [input, attachedImages, isLoading, messages, projectId, focusedSceneId, addMessage, setIsLoading]);

  const executeActions = useCallback(async (messageId: string, actions: AssistantAction[]) => {
    if (!projectId) {
      toast({ title: "No project", description: "Open a project to execute actions", variant: "destructive" });
      return;
    }

    setExecutingId(messageId);
    try {
      const res = await apiRequest("POST", `/api/projects/${projectId}/assistant/execute`, { actions });
      const data = await res.json();

      markActionsExecuted(messageId);

      const allDetails: string[] = [];
      let errorCount = 0;

      for (const r of data.results) {
        if (r.status === "frontend_action") {
          try {
            const frontendAction = JSON.parse(r.detail);
            await apiRequest(frontendAction.method, frontendAction.endpoint, frontendAction.body);
            allDetails.push(frontendAction.message);
          } catch (fe: any) {
            allDetails.push(`Failed: ${fe.message}`);
            errorCount++;
          }
        } else if (r.status === "error") {
          allDetails.push(`Error: ${r.detail}`);
          errorCount++;
        } else {
          allDetails.push(r.detail);
        }
      }

      addMessage({
        role: "assistant",
        content: errorCount > 0
          ? `Completed with ${errorCount} error(s):\n${allDetails.join("\n")}`
          : `Done! ${allDetails.join(" | ")}`,
      });

      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/images`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scenes`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/character-references`] });
    } catch (err: any) {
      toast({ title: "Execution failed", description: err.message, variant: "destructive" });
    } finally {
      setExecutingId(null);
    }
  }, [projectId, markActionsExecuted, addMessage, toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const canSend = (input.trim().length > 0 || attachedImages.length > 0) && !isLoading;

  if (!isOpen) return null;

  const suggestions = projectId
    ? [
        "Analyze this project",
        "Generate all storyboard images",
        "Regenerate scene 1 with more dramatic lighting",
        "Animate all images with Veo 3.1",
        "How many failed images do I have?",
        "Retry all failed images",
        "Make the pilot look older and more weathered",
        "Change scene 2 mood to tense and dark",
      ]
    : [
        "What can you help me with?",
        "How do I create a new project?",
        "What video models are available?",
      ];

  return (
    <div
      className="fixed right-0 top-0 bottom-0 w-[420px] z-50 flex flex-col chat-sidebar-panel"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <div className="absolute inset-0 bg-[#0a0d14]/95 backdrop-blur-xl border-l border-white/[0.06]" />

      {isDragging && (
        <div className="absolute inset-0 z-10 bg-blue-500/10 border-2 border-dashed border-blue-500/40 rounded-lg flex items-center justify-center backdrop-blur-sm">
          <div className="text-center">
            <ImagePlus className="w-10 h-10 text-blue-400 mx-auto mb-2" />
            <p className="text-blue-400 font-semibold text-sm">Drop image here</p>
          </div>
        </div>
      )}

      <div className="relative flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-white">AI Director</h3>
              <p className="text-[11px] text-white/40">
                {projectId ? (
                  <>
                    <span className="text-emerald-400">Project mode</span>
                    {focusedSceneId && <span className="text-blue-400"> • Scene focused</span>}
                    <span> • Full control</span>
                  </>
                ) : (
                  "General mode • Open a project for full power"
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={clearMessages}
              className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-colors"
              title="Clear chat"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scroll-smooth scrollbar-thin">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-600/20 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/10">
                <Bot className="w-8 h-8 text-blue-400" />
              </div>
              <h4 className="text-[16px] font-semibold text-white mb-2">AI Director</h4>
              <p className="text-[13px] text-white/40 leading-relaxed mb-1">
                {projectId
                  ? "I have full control over your project — storyboard, story bible, images, videos, characters, script, and more."
                  : "Open a project to unlock full control over storyboard, images, video clips, and more."}
              </p>
              {projectId && (
                <div className="flex flex-wrap gap-1.5 mt-2 mb-4">
                  {["Images", "Videos", "Script", "Characters", "Story Bible", "Analysis"].map(cap => (
                    <span key={cap} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      {cap}
                    </span>
                  ))}
                </div>
              )}
              <div className="space-y-1.5 w-full mt-2">
                {suggestions.slice(0, 5).map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                    className="w-full text-left px-3 py-2 rounded-xl border border-white/[0.06] text-[12px] text-white/50 hover:text-white/70 hover:bg-white/[0.03] hover:border-white/[0.1] transition-all"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-600/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-blue-400" />
                </div>
              )}
              <div className={`max-w-[85%] ${msg.role === "user" ? "order-first" : ""}`}>
                {msg.imageUrls && msg.imageUrls.length > 0 && (
                  <div className={`flex gap-1.5 mb-1.5 ${msg.role === "user" ? "justify-end" : "justify-start"} flex-wrap`}>
                    {msg.imageUrls.map((url, i) => (
                      <div key={i} className="w-28 h-28 rounded-xl overflow-hidden border border-white/10 shadow-lg">
                        <img src={url} alt={`Attached ${i + 1}`} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
                <div className={`rounded-2xl px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-br-md"
                    : "bg-white/[0.04] text-white/80 rounded-bl-md border border-white/[0.06]"
                }`}>
                  {msg.content}
                </div>
                {msg.actions && msg.actions.length > 0 && (
                  <ActionCard
                    actions={msg.actions}
                    executed={!!msg.actionsExecuted}
                    onExecute={() => executeActions(msg.id, msg.actions!)}
                    executing={executingId === msg.id}
                  />
                )}
              </div>
              {msg.role === "user" && (
                <div className="w-7 h-7 rounded-lg bg-white/[0.08] flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5 text-white/50" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-600/20 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex items-center gap-2 text-[13px] text-white/50">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Thinking...
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-4 pb-4 pt-2 border-t border-white/[0.06]">
          {attachedImages.length > 0 && (
            <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
              {attachedImages.map((url, i) => (
                <ImageThumbnail key={i} src={url} onRemove={() => setAttachedImages(prev => prev.filter((_, idx) => idx !== i))} />
              ))}
            </div>
          )}
          <div className="relative flex items-end gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-xl px-2 py-2 focus-within:border-blue-500/30 transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files) addImageFiles(e.target.files); e.target.value = ""; }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors shrink-0"
              title="Attach image (or paste/drop)"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={attachedImages.length > 0 ? "Describe the issue..." : (projectId ? "Analyze, generate, attach image..." : "Ask me anything...")}
              rows={1}
              className="flex-1 bg-transparent text-[13px] text-white placeholder-white/30 resize-none outline-none max-h-[120px] py-1 leading-relaxed"
              style={{ minHeight: "24px", height: "auto" }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 120) + "px";
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!canSend}
              className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-blue-600/20 disabled:opacity-30 disabled:hover:bg-transparent transition-colors shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-white/20 mt-2 text-center">
            Powered by Claude Sonnet • Paste or drop images • Uses your API key
          </p>
        </div>
      </div>
    </div>
  );
}

export function ChatToggleButton() {
  const { isOpen, setIsOpen, messages, projectId } = useChat();
  const pendingActions = messages.filter(m => m.role === "assistant" && m.actions && m.actions.length > 0 && !m.actionsExecuted).length;

  return (
    <button
      onClick={() => setIsOpen(!isOpen)}
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 shadow-2xl transition-all duration-300 group ${
        isOpen
          ? "w-12 h-12 rounded-full bg-white/10 backdrop-blur-lg border border-white/10 scale-90 opacity-50 hover:opacity-100"
          : "h-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-400 hover:to-purple-500 hover:scale-105 hover:shadow-blue-500/30 px-4"
      }`}
    >
      {isOpen ? (
        <X className="w-5 h-5 text-white mx-auto" />
      ) : (
        <>
          <Bot className="w-5 h-5 text-white" />
          <span className="text-white text-[13px] font-semibold pr-1">
            {projectId ? "AI Director" : "Assistant"}
          </span>
          {pendingActions > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
              {pendingActions}
            </span>
          )}
        </>
      )}
    </button>
  );
}

import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { analyzeFullStory, generateSequencePrompts, analyzeAndImprovePrompt, applyFeedbackToPrompt, rewriteSafePrompt, generateSmartMotionPrompt, generateMotionPromptWithFeedback, type VisualScene, type StoryBible, splitIntoSentences, buildFullStoryParams, parseFullStoryResult, buildStoryBibleParams, parseStoryBibleResult, buildVisualScenesChunkParams, parseVisualScenesChunkResult, validateAndFillSentenceCoverage, buildSequencePromptParams, parseSequencePromptResult, sceneChatResponse, applySceneChatFeedback, type SceneChatMessage, analyzeStoryBibleOnly, analyzeVisualScenesChunk, generateDirectorsShotPlan, type DirectorsShotPlanEntry, checkImageQuality, assistantChat, type AssistantMessage, type ProjectContext } from "./ai-analyzer";
import { streamSingleRequest, streamParallelRequests } from "./ai-streaming";
import { submitBatch, pollBatchUntilDone, formatElapsed, type BatchRequest } from "./anthropic-batch";
import { generateImage, checkImageStatus, generateVideo, checkVideoStatus, VIDEO_MODELS, getVideoModelConfig, IMAGE_MODELS, getImageModelConfig, type VideoModelId, type ImageModelId, ContentPolicyError, sanitizePromptForGemini } from "./nanobanana";
import { insertProjectSchema, insertNicheSchema, type ScriptAnalysis, type CharacterFacePhoto } from "@shared/schema";
import multer from "multer";
import { extractChannelTranscripts, extractSelectedVideoTranscripts, getChannelVideos } from "./youtube";
import { streamExportPDF, streamStoryBiblePDF } from "./pdf-export";
import archiver from "archiver";
import Anthropic from "@anthropic-ai/sdk";
import { generateVoiceover, getVoices } from "./elevenlabs";
import * as fs from "fs";
import * as path from "path";

interface UserApiKeys {
  anthropic?: string;
  elevenlabs?: string;
  evolink?: string;
}

function extractUserKeys(req: any): UserApiKeys {
  return {
    anthropic: req.headers["x-user-anthropic-key"] as string | undefined,
    elevenlabs: req.headers["x-user-elevenlabs-key"] as string | undefined,
    evolink: req.headers["x-user-evolink-key"] as string | undefined,
  };
}

function stripDialogue(text: string): string {
  let cleaned = text.replace(/"[^"]*"/g, "");
  cleaned = cleaned.replace(/'[^']*'/g, "");
  cleaned = cleaned.replace(/\b(says?|said|speaks?|spoke|shouts?|shouted|whispers?|whispered|yells?|yelled|calls?|called|replies?|replied|asks?|asked|tells?|told|announces?|announced|orders?|ordered|commands?|commanded|screams?|screamed|cries?|cried|murmurs?|murmured|mutters?|muttered|exclaims?|exclaimed)\b[^.!,;]*/gi, "");
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  return cleaned;
}

function buildVideoPrompt(motionPrompt: string | null | undefined, imagePrompt: string): string {
  if (motionPrompt) {
    const cleaned = stripDialogue(motionPrompt);
    return `${cleaned} Maintain exact subject appearance and design throughout. Smooth continuous motion, no morphing or transformation.`;
  }
  const { subjectLock, cameraMove, envMotion } = analyzeImageForFallback(imagePrompt);
  return `${subjectLock}${cameraMove} ${envMotion} Maintain exact subject design and proportions throughout.`;
}

function analyzeImageForFallback(imagePrompt: string): { subjectLock: string; cameraMove: string; envMotion: string } {
  const lower = imagePrompt.toLowerCase();

  let subjectLock = "";
  if (lower.includes("aircraft") || lower.includes("fighter") || lower.includes("bomber") || lower.includes("plane") || lower.includes("jet") || lower.includes("mustang") || lower.includes("spitfire") || lower.includes("messerschmitt") || lower.includes("p-51") || lower.includes("p-47") || lower.includes("f4u") || lower.includes("b-17") || lower.includes("b-29") || lower.includes("zero") || lower.includes("corsair")) {
    subjectLock = "Aircraft maintains exact design, wing shape, and markings. ";
  } else if (lower.includes("ship") || lower.includes("carrier") || lower.includes("destroyer") || lower.includes("battleship") || lower.includes("submarine") || lower.includes("vessel") || lower.includes("cruiser")) {
    subjectLock = "Vessel maintains exact hull shape and superstructure. ";
  } else if (lower.includes("tank") || lower.includes("vehicle") || lower.includes("truck") || lower.includes("jeep") || lower.includes("halftrack")) {
    subjectLock = "Vehicle maintains exact design and proportions. ";
  } else if (lower.includes("portrait") || lower.includes("face") || lower.includes("close-up") || lower.includes("closeup") || lower.includes("pilot") || lower.includes("soldier") || lower.includes("officer")) {
    subjectLock = "Subject maintains exact facial features and expression. ";
  }

  let cameraMove = "Slow cinematic push-in with steady framing.";
  if (lower.includes("wide shot") || lower.includes("establishing") || lower.includes("panoram") || lower.includes("landscape") || lower.includes("aerial view")) {
    cameraMove = "Slow sweeping lateral drift across the vista.";
  } else if (lower.includes("close-up") || lower.includes("closeup") || lower.includes("detail") || lower.includes("macro") || lower.includes("portrait")) {
    cameraMove = "Extremely slow push-in with shallow depth-of-field drift.";
  } else if (lower.includes("battle") || lower.includes("combat") || lower.includes("explosion") || lower.includes("chaos") || lower.includes("attack")) {
    cameraMove = "Subtle handheld drift with slight instability conveying intensity.";
  } else if (lower.includes("silhouette") || lower.includes("sunset") || lower.includes("dawn") || lower.includes("dusk") || lower.includes("sunrise")) {
    cameraMove = "Nearly static with subtle upward crane revealing light.";
  } else if (lower.includes("underwater") || lower.includes("beneath the surface") || lower.includes("submerged")) {
    cameraMove = "Gentle floating drift with organic underwater sway.";
  }

  let envMotion = "Subtle atmospheric movement, soft light shifts.";
  if (lower.includes("ocean") || lower.includes("sea") || lower.includes("water") || lower.includes("wave") || lower.includes("naval")) {
    envMotion = "Ocean swells rise and fall, spray mists catch the light, reflections shimmer across the water surface.";
  } else if (lower.includes("cloud") || lower.includes("sky") || lower.includes("altitude") || lower.includes("flying")) {
    envMotion = "Clouds drift past slowly, exhaust shimmer trails behind, light rays shift through the atmosphere.";
  } else if (lower.includes("fire") || lower.includes("flame") || lower.includes("burn") || lower.includes("explosion") || lower.includes("smoke")) {
    envMotion = "Flames flicker and billow, smoke curls upward, embers and sparks drift through the air.";
  } else if (lower.includes("rain") || lower.includes("storm") || lower.includes("lightning")) {
    envMotion = "Rain streaks past, puddles ripple, distant lightning flickers through dark clouds.";
  } else if (lower.includes("snow") || lower.includes("winter") || lower.includes("blizzard") || lower.includes("frost")) {
    envMotion = "Snowflakes drift down gently, frost glistens, cold breath mists in the air.";
  } else if (lower.includes("jungle") || lower.includes("forest") || lower.includes("tree") || lower.includes("vegetation")) {
    envMotion = "Leaves rustle gently, dappled light shifts through the canopy, insects and particles float.";
  } else if (lower.includes("desert") || lower.includes("sand") || lower.includes("dust") || lower.includes("arid")) {
    envMotion = "Heat haze shimmers above the ground, fine dust particles drift, sand grains shift in the wind.";
  } else if (lower.includes("night") || lower.includes("darkness") || lower.includes("moonlight")) {
    envMotion = "Shadows shift subtly, ambient light breathes, distant points of light flicker.";
  }

  return { subjectLock, cameraMove, envMotion };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  (async () => {
    try {
      const allProjects = await storage.getProjects();
      const staleGenerating = allProjects.filter(p => p.status === "generating");
      for (const p of staleGenerating) {
        const images = await storage.getImagesByProject(p.id);
        const generating = images.filter(img => img.status === "generating" && img.taskId);
        if (generating.length > 0) {
          console.log(`[startup-recovery] Project ${p.id}: checking status of ${generating.length} in-flight images before marking failed...`);
          let recovered = 0;
          let markedFailed = 0;
          for (const img of generating) {
            try {
              const result = await checkImageStatus(img.taskId!);
              if (result.status === "completed" && result.imageUrl) {
                await storage.updateImage(img.id, { status: "completed", imageUrl: result.imageUrl });
                recovered++;
              } else if (result.status === "failed") {
                await storage.updateImage(img.id, { status: "failed", error: result.error || "Failed during server restart" });
                markedFailed++;
              } else {
                await storage.updateImage(img.id, { status: "failed", error: "Server restarted while generating" });
                markedFailed++;
              }
            } catch {
              await storage.updateImage(img.id, { status: "failed", error: "Could not verify status after server restart" });
              markedFailed++;
            }
            await new Promise(r => setTimeout(r, 300));
          }
          console.log(`[startup-recovery] Project ${p.id}: recovered ${recovered} completed, ${markedFailed} marked failed`);
        }
        const noTaskImages = images.filter(img => img.status === "generating" && !img.taskId);
        for (const img of noTaskImages) {
          await storage.updateImage(img.id, { status: "failed", error: "No task ID — server restarted before submission completed" });
        }
        const updatedImages = await storage.getImagesByProject(p.id);
        const completed = updatedImages.filter(img => img.status === "completed").length;
        const finalStatus = completed > 0 ? "completed" : "analyzed";
        await storage.updateProject(p.id, { status: finalStatus });
        console.log(`[startup-recovery] Project ${p.id} final: ${completed} completed, status → ${finalStatus}`);
      }

      const stale = allProjects.filter(p => p.status === "analyzing");
      for (const p of stale) {
        const progress = p.analysisProgress as any;
        const hasScenes = (await storage.getScenesByProject(p.id)).length > 0;
        if (hasScenes && p.analysis) {
          await storage.updateProject(p.id, {
            status: "analyzed",
            analysisProgress: { step: "complete", detail: "Analysis recovered after restart.", current: 1, total: 1 } as any,
          });
          console.log(`Recovered stale project ${p.id} — has scenes, marked as analyzed.`);
        } else {
          await storage.deleteImagesByProject(p.id);
          await storage.deleteScenesByProject(p.id);
          await storage.updateProject(p.id, {
            status: "draft",
            analysis: null,
            analysisProgress: { step: "error", detail: "Analysis was interrupted. Please re-analyze.", current: 0, total: 1 } as any,
          });
          console.log(`Reset stale project ${p.id} — incomplete, cleaned up and marked as draft.`);
        }
      }
    } catch (e: any) {
      console.error("Failed to recover stale projects:", e.message);
    }
  })();

  app.get("/api/niches", async (_req, res) => {
    try {
      const allNiches = await storage.getNiches();
      res.json(allNiches);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/niches/:id", async (req, res) => {
    try {
      const niche = await storage.getNiche(req.params.id);
      if (!niche) return res.status(404).json({ error: "Niche not found" });
      res.json(niche);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/niches/:id/videos", async (req, res) => {
    try {
      const videos = await storage.getNicheVideos(req.params.id);
      res.json(videos);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/niches/:id", async (req, res) => {
    try {
      await storage.deleteNiche(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const nicheTrainingProgress = new Map<string, { step: string; detail: string; current: number; total: number; extractedVideos?: Array<{ videoId: string; title: string; wordCount: number }>; channelName?: string; analysisSteps?: Array<{ label: string; status: "pending" | "active" | "done" }> }>();

  app.post("/api/niches/preview", async (req, res) => {
    try {
      const { channelUrl } = req.body;
      if (!channelUrl) {
        return res.status(400).json({ error: "Channel URL is required" });
      }
      const { channelName, videos } = await getChannelVideos(channelUrl, 30);
      res.json({ channelName, videos });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/niches/create", async (req, res) => {
    try {
      const { channelUrl, name, channelName, videos } = req.body;
      if (!channelUrl || !name) {
        return res.status(400).json({ error: "Channel URL and name are required" });
      }
      const niche = await storage.createNiche({
        name,
        channelUrl,
        channelName: channelName || null,
        status: "preview",
        videoCount: videos?.length || 0,
        sampleTranscripts: videos ? videos.map((v: any) => ({ videoId: v.videoId, title: v.title })) as any : null,
      });
      res.json(niche);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/niches/:id/extract", async (req, res) => {
    try {
      const niche = await storage.getNiche(req.params.id);
      if (!niche) return res.status(404).json({ error: "Niche not found" });
      if (!niche.channelUrl) return res.status(400).json({ error: "No channel URL set for this niche" });

      const selectedVideos: Array<{ videoId: string; title: string }> | undefined =
        Array.isArray(req.body?.videoIds) && req.body.videoIds.length > 0
          ? req.body.videoIds.map((id: string) => {
              const sample = Array.isArray(niche.sampleTranscripts)
                ? (niche.sampleTranscripts as any[]).find((s: any) => s.videoId === id)
                : null;
              return { videoId: id, title: sample?.title || `Video ${id}` };
            })
          : undefined;

      await storage.deleteNicheVideos(niche.id);
      await storage.updateNiche(niche.id, { status: "extracting" as any });

      const extractCount = selectedVideos?.length || 30;
      nicheTrainingProgress.set(niche.id, { step: "extracting", detail: "Fetching transcripts for selected videos...", current: 0, total: extractCount, extractedVideos: [] });
      res.json({ success: true });

      (async () => {
        const extractedVideosList: Array<{ videoId: string; title: string; wordCount: number }> = [];
        const onProgress = (current: number, total: number, title: string) => {
          nicheTrainingProgress.set(niche.id, {
            step: "extracting",
            detail: `Extracting transcript ${current}/${total}: ${title}`,
            current,
            total,
            extractedVideos: [...extractedVideosList],
            channelName: niche.channelName || undefined,
          });
        };
        const onVideoExtracted = (video: { videoId: string; title: string; wordCount: number }) => {
          extractedVideosList.push(video);
          const prev = nicheTrainingProgress.get(niche.id);
          if (prev) {
            nicheTrainingProgress.set(niche.id, { ...prev, extractedVideos: [...extractedVideosList] });
          }
        };

        try {
          let channelName: string;
          let transcripts: Array<{ videoId: string; title: string; transcript: string }>;

          if (selectedVideos && selectedVideos.length > 0) {
            const result = await extractSelectedVideoTranscripts(
              selectedVideos,
              niche.channelName || "Unknown",
              onProgress,
              onVideoExtracted,
            );
            channelName = result.channelName;
            transcripts = result.transcripts;
          } else {
            const result = await extractChannelTranscripts(
              niche.channelUrl!,
              extractCount,
              onProgress,
              onVideoExtracted,
            );
            channelName = result.channelName;
            transcripts = result.transcripts;
          }

          if (transcripts.length === 0) {
            await storage.updateNiche(niche.id, { status: "failed", channelName });
            nicheTrainingProgress.set(niche.id, { step: "error", detail: "No transcripts could be extracted from this channel.", current: 0, total: 1, extractedVideos: [] });
            setTimeout(() => nicheTrainingProgress.delete(niche.id), 60000);
            return;
          }

          await storage.updateNiche(niche.id, {
            channelName,
            videoCount: transcripts.length,
            sampleTranscripts: transcripts.map(t => ({ videoId: t.videoId, title: t.title, wordCount: t.transcript.split(/\s+/).length })) as any,
            status: "extracted",
          });

          await storage.createNicheVideos(transcripts.map(t => ({
            nicheId: niche.id,
            videoId: t.videoId,
            title: t.title,
            transcript: t.transcript,
            wordCount: t.transcript.split(/\s+/).length,
          })));

          nicheTrainingProgress.set(niche.id, { step: "extracted", detail: `Extracted ${transcripts.length} transcripts. Ready for analysis.`, current: transcripts.length, total: transcripts.length, extractedVideos: extractedVideosList, channelName });
          setTimeout(() => nicheTrainingProgress.delete(niche.id), 60000);

        } catch (err: any) {
          console.error(`Niche extraction error for ${niche.id}:`, err);
          await storage.updateNiche(niche.id, { status: "failed" });
          nicheTrainingProgress.set(niche.id, { step: "error", detail: err.message, current: 0, total: 1, extractedVideos: extractedVideosList });
          setTimeout(() => nicheTrainingProgress.delete(niche.id), 60000);
        }
      })();

    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/niches/:id/analyze", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const anthropicKey = userKeys.anthropic || process.env.ANTHROPIC_API_KEY;
      if (!anthropicKey) {
        return res.status(400).json({
          error: "No Anthropic API key found. Please enter your API key in Settings (gear icon) or set the ANTHROPIC_API_KEY environment variable.",
        });
      }

      const niche = await storage.getNiche(req.params.id);
      if (!niche) return res.status(404).json({ error: "Niche not found" });

      const videos = await storage.getNicheVideos(niche.id);
      if (videos.length === 0) return res.status(400).json({ error: "No transcripts extracted yet. Please extract transcripts first." });

      await storage.updateNiche(niche.id, { status: "analyzing" as any });

      const analysisStepsList: Array<{ label: string; status: "pending" | "active" | "done" }> = [
        { label: "Reading transcripts", status: "active" },
        { label: "Identifying tone & pacing", status: "pending" },
        { label: "Analyzing vocabulary & sentence structure", status: "pending" },
        { label: "Extracting hook & transition patterns", status: "pending" },
        { label: "Detecting signature phrases", status: "pending" },
        { label: "Building writing instructions", status: "pending" },
      ];

      nicheTrainingProgress.set(niche.id, {
        step: "analyzing",
        detail: "Reading transcripts...",
        current: 0,
        total: 1,
        channelName: niche.channelName || undefined,
        analysisSteps: [...analysisStepsList],
      });
      res.json({ success: true });

      const advanceAnalysisStep = (stepIndex: number, detail: string) => {
        for (let i = 0; i < analysisStepsList.length; i++) {
          if (i < stepIndex) analysisStepsList[i].status = "done";
          else if (i === stepIndex) analysisStepsList[i].status = "active";
          else analysisStepsList[i].status = "pending";
        }
        nicheTrainingProgress.set(niche.id, {
          step: "analyzing",
          detail,
          current: 0,
          total: 1,
          channelName: niche.channelName || undefined,
          analysisSteps: [...analysisStepsList],
        });
      };

      (async () => {
        try {
          const usedVideos = videos.slice(0, 15);
          const totalWords = usedVideos.reduce((sum, v) => sum + (v.transcript || "").split(/\s+/).length, 0);
          const combinedSamples = usedVideos.map((t, i) =>
            `--- TRANSCRIPT ${i + 1}: "${t.title}" ---\n${(t.transcript || "").substring(0, 4000)}\n`
          ).join("\n");

          advanceAnalysisStep(0, `Reading ${usedVideos.length} transcripts (${totalWords.toLocaleString()} words)...`);
          await new Promise(r => setTimeout(r, 800));

          advanceAnalysisStep(1, `Feeding ${usedVideos.length} scripts to AI for tone & pacing analysis...`);

          const anthropic = new Anthropic({ apiKey: userKeys.anthropic || process.env.ANTHROPIC_API_KEY });

          const stylePromptContent = `You are a writing style analyst. Analyze these YouTube video transcripts from the same creator/channel and extract a detailed writing style profile. These are all from the channel "${niche.channelName}".

${combinedSamples}

Create a comprehensive style profile as JSON with these exact fields:
{
  "tone": "description of the overall tone (dramatic, conversational, educational, etc.)",
  "pacing": "how the script paces information (fast cuts, slow build, etc.)",
  "vocabulary": "vocabulary level and style (technical, casual, poetic, etc.)",
  "sentenceStructure": "typical sentence patterns (short punchy, long flowing, mixed, etc.)",
  "hookStyle": "how they open/hook the viewer in the first 30 seconds",
  "transitionStyle": "how they move between topics or scenes",
  "dramaticTechniques": "specific dramatic or storytelling techniques used",
  "narrativeVoice": "first person, third person, omniscient narrator, etc.",
  "signaturePhrases": ["list of recurring phrases or verbal patterns"],
  "structurePattern": "typical video structure (intro → build → climax → resolution, etc.)",
  "emotionalRange": "range of emotions conveyed (intense, measured, etc.)",
  "audienceEngagement": "how they engage the audience (questions, cliffhangers, etc.)",
  "uniqueQualities": "what makes this creator's writing style distinctive",
  "writingInstructions": "A detailed paragraph that could be given to another writer to replicate this exact style. Be very specific about word choices, sentence rhythms, how to open and close, how to build tension, etc."
}

Output ONLY the JSON object, no other text.`;

          let responseText = "";

          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const stream = anthropic.messages.stream({
                model: "claude-sonnet-4-20250514",
                max_tokens: 4096,
                messages: [{ role: "user", content: stylePromptContent }],
              });

              let charCount = 0;
              const fieldMarkers = [
                { field: "tone", step: 1, label: "Analyzing tone & pacing..." },
                { field: "vocabulary", step: 2, label: "Analyzing vocabulary & sentence structure..." },
                { field: "hookStyle", step: 3, label: "Extracting hook & transition patterns..." },
                { field: "signaturePhrases", step: 4, label: "Detecting signature phrases..." },
                { field: "writingInstructions", step: 5, label: "Building writing instructions..." },
              ];
              let lastStepTriggered = 1;

              stream.on("text", (text) => {
                responseText += text;
                charCount += text.length;

                for (const marker of fieldMarkers) {
                  if (marker.step > lastStepTriggered && responseText.includes(`"${marker.field}"`)) {
                    lastStepTriggered = marker.step;
                    advanceAnalysisStep(marker.step, marker.label);
                  }
                }
              });

              const finalMessage = await stream.finalMessage();
              responseText = (finalMessage.content[0] as any).text;
              break;
            } catch (retryErr: any) {
              responseText = "";
              if (attempt < 2 && (retryErr.status === 529 || retryErr.status === 503 || retryErr.status === 500)) {
                nicheTrainingProgress.set(niche.id, {
                  step: "analyzing",
                  detail: `AI temporarily unavailable, retrying (${attempt + 2}/3)...`,
                  current: 0,
                  total: 1,
                  channelName: niche.channelName || undefined,
                  analysisSteps: [...analysisStepsList],
                });
                await new Promise(r => setTimeout(r, 5000 * (attempt + 1)));
              } else {
                throw retryErr;
              }
            }
          }

          if (!responseText) throw new Error("Failed to get AI response after 3 attempts");

          advanceAnalysisStep(5, "Finalizing writing instructions...");

          let styleProfile;
          try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            styleProfile = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
          } catch {
            styleProfile = { raw: responseText, writingInstructions: responseText };
          }

          for (const s of analysisStepsList) s.status = "done";
          nicheTrainingProgress.set(niche.id, {
            step: "analyzing",
            detail: "Saving style profile...",
            current: 0,
            total: 1,
            channelName: niche.channelName || undefined,
            analysisSteps: [...analysisStepsList],
          });

          await storage.updateNiche(niche.id, {
            status: "ready",
            styleProfile: styleProfile as any,
          });

          nicheTrainingProgress.set(niche.id, {
            step: "complete",
            detail: "Style profile ready!",
            current: 1,
            total: 1,
            channelName: niche.channelName || undefined,
            analysisSteps: [...analysisStepsList],
          });
          setTimeout(() => nicheTrainingProgress.delete(niche.id), 60000);

        } catch (err: any) {
          console.error(`Niche analysis error for ${niche.id}:`, err);
          await storage.updateNiche(niche.id, { status: "failed" });
          nicheTrainingProgress.set(niche.id, { step: "error", detail: err.message, current: 0, total: 1 });
          setTimeout(() => nicheTrainingProgress.delete(niche.id), 60000);
        }
      })();

    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/niches/:id/retrain", async (req, res) => {
    try {
      const niche = await storage.getNiche(req.params.id);
      if (!niche) return res.status(404).json({ error: "Niche not found" });
      if (!niche.channelUrl) return res.status(400).json({ error: "No channel URL set for this niche" });

      await storage.deleteNicheVideos(niche.id);
      await storage.updateNiche(niche.id, { status: "preview" as any, styleProfile: null, sampleTranscripts: null });

      res.json(niche);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/niches/:id/progress", async (req, res) => {
    const progress = nicheTrainingProgress.get(req.params.id);
    if (progress) {
      res.json(progress);
    } else {
      const niche = await storage.getNiche(req.params.id);
      if (niche?.status === "ready") {
        res.json({ step: "complete", detail: "Style profile ready!", current: 1, total: 1 });
      } else if (niche?.status === "extracted") {
        res.json({ step: "extracted", detail: "Transcripts extracted. Ready for analysis.", current: 1, total: 1 });
      } else if (niche?.status === "failed") {
        res.json({ step: "error", detail: "Training failed.", current: 0, total: 1 });
      } else {
        res.json({ step: "unknown", detail: "No progress data available.", current: 0, total: 1 });
      }
    }
  });

  app.get("/api/projects", async (_req, res) => {
    try {
      const projects = await storage.getProjects();
      res.json(projects);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });
      res.json(project);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });
      await storage.deleteProject(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/generate-script", async (req, res) => {
    try {
      const { topic, length, minutes, nicheId } = req.body;
      if (!topic) {
        return res.status(400).json({ error: "Topic is required" });
      }

      let wordMin: number, wordMax: number, lengthLabel: string;

      if (minutes && typeof minutes === "number") {
        wordMin = Math.round(minutes * 130);
        wordMax = Math.round(minutes * 160);
        lengthLabel = `${minutes}-minute video (~${wordMin}-${wordMax} words)`;
      } else {
        const wordTargets: Record<string, { min: number; max: number; label: string }> = {
          short: { min: 300, max: 500, label: "Short (300-500 words)" },
          medium: { min: 800, max: 1200, label: "Medium (800-1,200 words)" },
          long: { min: 1500, max: 2500, label: "Long (1,500-2,500 words)" },
          epic: { min: 3000, max: 5000, label: "Epic (3,000-5,000 words)" },
        };
        const target = wordTargets[length] || wordTargets.medium;
        wordMin = target.min;
        wordMax = target.max;
        lengthLabel = target.label;
      }

      let styleInstructions = "";
      if (nicheId) {
        const niche = await storage.getNiche(nicheId);
        if (niche?.styleProfile) {
          const profile = niche.styleProfile as any;
          styleInstructions = `\n\nCRITICAL STYLE INSTRUCTIONS — You MUST write in this specific style:
Channel: ${niche.channelName || niche.name}
Tone: ${profile.tone || ""}
Pacing: ${profile.pacing || ""}
Vocabulary: ${profile.vocabulary || ""}
Sentence Structure: ${profile.sentenceStructure || ""}
Hook Style: ${profile.hookStyle || ""}
Transition Style: ${profile.transitionStyle || ""}
Dramatic Techniques: ${profile.dramaticTechniques || ""}
Narrative Voice: ${profile.narrativeVoice || ""}
Structure Pattern: ${profile.structurePattern || ""}
Emotional Range: ${profile.emotionalRange || ""}
Audience Engagement: ${profile.audienceEngagement || ""}
${profile.signaturePhrases?.length ? `Signature Phrases to use: ${profile.signaturePhrases.join(", ")}` : ""}

DETAILED WRITING GUIDE: ${profile.writingInstructions || ""}

You MUST match this writing style exactly. Mimic the tone, sentence rhythm, vocabulary choices, and storytelling techniques described above.`;
        }
      }

      const maxTokens = Math.max(8192, Math.min(Math.round(wordMax * 2), 32000));

      const userKeys = extractUserKeys(req);
      const anthropic = new Anthropic({ apiKey: userKeys.anthropic || process.env.ANTHROPIC_API_KEY });

      const message = await anthropic.messages.create({
        model: "claude-opus-4-6",
        max_tokens: maxTokens,
        messages: [
          {
            role: "user",
            content: `You are a world-class YouTube video script writer specializing in military aviation, naval warfare, and military history documentaries. Write a compelling, cinematic narration script about the following topic:

TOPIC: ${topic}

TARGET LENGTH: ${wordMin}-${wordMax} words (${lengthLabel})
${styleInstructions}

IMPORTANT RULES:
1. Write ONLY the narration script — no headers, no scene directions, no timestamps, no "[Narrator:]" labels
2. Write in a dramatic, documentary-style narrative voice
3. Use vivid, visual language that paints pictures — describe what the viewer would see
4. Include specific details: aircraft names, ship names, dates, locations, technical specifications
5. Build tension and drama naturally through the story
6. Use short, punchy sentences for action moments and longer flowing sentences for context
7. Include dialogue where historically appropriate (in quotes)
8. End with a powerful, memorable closing line
9. Make every sentence visually interesting — imagine each one becoming a film frame
10. The script should flow naturally when read aloud as a voiceover
11. You MUST hit the target word count. For a ${lengthLabel}, the script should be ${wordMin}-${wordMax} words. Do NOT write less.

Write the script now. Output ONLY the script text, nothing else.`,
          },
        ],
      });

      const scriptText = (message.content[0] as any).text;
      const scriptWordCount = scriptText.trim().split(/\s+/).length;

      const saved = await storage.createSavedScript({
        topic,
        script: scriptText,
        wordCount: scriptWordCount,
        durationMinutes: minutes || null,
        nicheId: nicheId || null,
        nicheName: nicheId ? (await storage.getNiche(nicheId))?.channelName || null : null,
        voiceoverUrl: null,
        voiceId: null,
        voiceName: null,
        projectId: null,
      });

      res.json({ script: scriptText, savedScriptId: saved.id });
    } catch (err: any) {
      console.error("Script generation error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/voices", async (_req, res) => {
    try {
      const presetVoices = await getVoices();
      const customVoiceRecords = await storage.getCustomVoices();
      const customVoiceItems = customVoiceRecords.map(cv => ({
        voice_id: cv.voiceId,
        name: cv.name,
        category: "custom" as const,
        description: cv.description || "Custom ElevenLabs voice",
        customId: cv.id,
      }));
      res.json([...presetVoices, ...customVoiceItems]);
    } catch (err: any) {
      console.error("Get voices error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/voices/custom", async (req, res) => {
    try {
      const { name, voiceId, description } = req.body;
      if (!name || !voiceId) {
        return res.status(400).json({ error: "Name and voice ID are required" });
      }
      const voice = await storage.createCustomVoice({ name, voiceId, description: description || null });
      res.json(voice);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/voices/custom/:id", async (req, res) => {
    try {
      await storage.deleteCustomVoice(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/generate-voiceover", async (req, res) => {
    try {
      const { text, voiceId, savedScriptId } = req.body;
      const userKeys = extractUserKeys(req);
      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }

      const audioBuffer = await generateVoiceover(text, voiceId, userKeys.elevenlabs);

      const uploadsDir = path.join(process.cwd(), "uploads", "voiceovers");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const filename = `voiceover_${Date.now()}.mp3`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, audioBuffer);

      const url = `/uploads/voiceovers/${filename}`;

      if (savedScriptId) {
        try {
          await storage.updateSavedScript(savedScriptId, {
            voiceoverUrl: url,
            voiceId: voiceId || null,
          });
        } catch (e) {}
      }

      res.json({ url, filename });
    } catch (err: any) {
      console.error("Voiceover generation error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/saved-scripts", async (_req, res) => {
    try {
      const scripts = await storage.getSavedScripts();
      res.json(scripts);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/saved-scripts/:id", async (req, res) => {
    try {
      const script = await storage.getSavedScript(req.params.id);
      if (!script) return res.status(404).json({ error: "Script not found" });
      res.json(script);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/saved-scripts/:id", async (req, res) => {
    try {
      const updated = await storage.updateSavedScript(req.params.id, req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/saved-scripts/:id", async (req, res) => {
    try {
      await storage.deleteSavedScript(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const parsed = insertProjectSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Title and script are required", details: parsed.error.errors });
      }
      const project = await storage.createProject(parsed.data);

      if (req.body.savedScriptId) {
        try {
          await storage.updateSavedScript(req.body.savedScriptId, { projectId: project.id });
        } catch (e) {}
      }

      res.json(project);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/projects/:id/scenes", async (req, res) => {
    try {
      const scenes = await storage.getScenesByProject(req.params.id);
      scenes.sort((a, b) => a.sentenceIndex - b.sentenceIndex);
      res.json(scenes);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/projects/:id/images", async (req, res) => {
    try {
      const images = await storage.getImagesByProject(req.params.id);
      res.json(images);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/projects/:id/character-references", async (req, res) => {
    try {
      const refs = await storage.getCharacterReferencesByProject(req.params.id);
      res.json(refs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/character-references/:refId/regenerate", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const ref = await storage.getCharacterReference(req.params.refId);
      if (!ref) return res.status(404).json({ error: "Character reference not found" });
      if (ref.projectId !== req.params.id) return res.status(400).json({ error: "Reference does not belong to this project" });

      const { feedback, imageModel } = req.body || {};
      const imgModel = (imageModel as ImageModelId) || undefined;

      await storage.updateCharacterReference(ref.id, { status: "generating", taskId: null, imageUrl: null });
      res.json({ status: "generating" });

      const stylizedFaceUrl = await getStylizedFaceUrl(ref.projectId, ref.characterName);
      const refImageUrls = stylizedFaceUrl ? [stylizedFaceUrl] : undefined;

      (async () => {
        try {
          let finalPrompt = ref.prompt;
          if (feedback && feedback.trim()) {
            console.log(`[char-ref] Applying feedback to portrait ${ref.characterName}: "${feedback}"`);
            finalPrompt = await applyFeedbackToPrompt(ref.prompt, feedback, true, undefined, userKeys.anthropic);
            console.log(`[char-ref] Modified prompt generated (${finalPrompt.length} chars)`);
          }
          const { taskId } = await generateImage(finalPrompt, refImageUrls, imgModel, userKeys.evolink, "9:16");
          await storage.updateCharacterReference(ref.id, { status: "generating", taskId, prompt: finalPrompt });
        } catch (err: any) {
          console.error(`[char-ref] Feedback regeneration failed for ${ref.characterName}:`, err.message);
          try {
            const { taskId } = await generateImage(ref.prompt, refImageUrls, imgModel, userKeys.evolink, "9:16");
            await storage.updateCharacterReference(ref.id, { status: "generating", taskId });
          } catch {
            await storage.updateCharacterReference(ref.id, { status: "failed" });
          }
        }
      })().catch(err => {
        console.error(`[char-ref-regen] Unhandled error for ${ref.characterName}:`, err);
        storage.updateCharacterReference(ref.id, { status: "failed" }).catch(() => {});
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/characters/:name/regenerate-all-portraits", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });
      const analysis = project.analysis as ScriptAnalysis;
      if (!analysis?.characters?.length) return res.status(400).json({ error: "No characters found" });

      const characterName = decodeURIComponent(req.params.name);
      const char = analysis.characters.find((c: any) => c.name.toLowerCase() === characterName.toLowerCase());
      if (!char) return res.status(404).json({ error: `Character "${characterName}" not found in analysis` });

      const imgModel = (req.body?.imageModel as ImageModelId) || undefined;
      const mode: string = req.body?.mode || "default";

      const existingRefs = await storage.getCharacterReferencesByProject(project.id);
      const charOldRefs = existingRefs.filter(r => r.characterName.toLowerCase() === characterName.toLowerCase());
      for (const old of charOldRefs) {
        await storage.updateCharacterReference(old.id, { status: "pending", imageUrl: null, taskId: null } as any);
      }

      const angles: { key: string; label: string; poseInstruction: string; isCloseup?: boolean }[] = [
        { key: "front", label: "Front View", poseInstruction: "facing directly toward camera, symmetrical straight-on front view, direct eye contact, arms relaxed at sides" },
        { key: "three-quarter", label: "Three-Quarter View", poseInstruction: "facing three-quarter angle toward camera (45 degrees turned), face clearly visible with direct eye contact, natural relaxed pose" },
        { key: "closeup", label: "Face Close-Up", poseInstruction: "extreme close-up of the face filling most of the frame, showing every facial detail — eyes, eyebrows, nose, lips, jawline, skin texture, facial hair if any, from a straight-on front angle with direct eye contact", isCloseup: true },
      ];

      const stylizedFaceUrl = await getStylizedFaceUrl(project.id, char.name);

      const useFaceRef = mode !== "different" && !!stylizedFaceUrl;
      const isDifferentLook = mode === "different";

      const likenessAnchor = useFaceRef
        ? `LIKENESS REFERENCE: This character's face MUST match the reference image — preserve the exact facial structure, eye shape, nose, jawline, brow, cheekbones, and all distinguishing facial features from the reference. `
        : "";

      const variationSeed = Math.floor(Math.random() * 9000) + 1000;
      const differentLookInstruction = isDifferentLook
        ? `IMPORTANT: Generate a COMPLETELY DIFFERENT and UNIQUE facial appearance for this character — different face shape, different eye shape, different nose, different jawline, different bone structure than any previous version. This is variation #${variationSeed}. Create a fresh, distinctive look while still matching the character description. `
        : "";

      console.log(`[char-regen-all] Regenerating ${char.name} mode=${mode} useFaceRef=${useFaceRef} isDifferentLook=${isDifferentLook}`);

      res.json({ started: true, character: char.name, count: 3, mode });

      (async () => {
        for (const angle of angles) {
          const sigFeatures = char.signatureFeatures ? `SIGNATURE FEATURES (these MUST be visible and accurate): ${char.signatureFeatures}.` : "";

          const prompt = angle.isCloseup
            ? `Unreal Engine 5 cinematic 3D render, high-fidelity CGI character portrait, ultra-detailed, 9:16 vertical frame. ${likenessAnchor}${differentLookInstruction}EXTREME FACE CLOSE-UP of ${char.name} — head and shoulders filling the frame, face as the sole focus. ${char.appearance}. ${sigFeatures} Shot type: ${angle.poseInstruction}. Clean solid neutral dark gray background with soft cinematic studio lighting — bright key light from upper right at 45 degrees, warm fill from left, subtle rim light on hair and jawline. Expression: neutral-confident, conveying personality and presence. Ultra-detailed facial rendering: visible pores, subsurface scattering on skin, individual eyelashes, precise iris color and pattern, accurate lip texture, every facial mark and scar rendered. This is a FACE REFERENCE IMAGE — the purpose is to lock down this character's exact facial identity for visual consistency in later scenes. No text, no watermarks, no UI elements, no extra fingers or distorted features.`
            : `Unreal Engine 5 cinematic 3D render, high-fidelity CGI character reference with slight stylization, ultra-detailed, 9:16 vertical portrait frame. ${likenessAnchor}${differentLookInstruction}FULL BODY STANDING PORTRAIT of ${char.name} — ${angle.label} — showing head to feet, entire body visible in vertical composition. ${char.appearance}. ${sigFeatures} Shot type: full-body standing pose, ${angle.poseInstruction}. The ENTIRE body from head to boots/shoes must be visible — do NOT crop at waist or chest. Clean solid neutral dark gray background with soft cinematic studio lighting — bright key light from upper right at 45 degrees, cool fill from left, strong rim light outlining the full body silhouette. Expression: neutral-confident, conveying authority and presence. High-fidelity CGI skin with subsurface scattering, highly detailed facial features clearly visible, detailed fabric textures on clothing/uniform with every button, insignia, pocket and accessory rendered accurately, detailed hands and footwear. This is a CHARACTER REFERENCE IMAGE (${angle.label}) — the purpose is to establish exactly what this character looks like from this specific angle for visual consistency in later scenes. No text, no watermarks, no UI elements, no extra fingers or distorted features.`;

          const refImageUrls = useFaceRef ? [stylizedFaceUrl!] : undefined;

          try {
            const { taskId } = await generateImageWithAutoRetry(prompt, refImageUrls, imgModel, userKeys.evolink, userKeys.anthropic);
            const existingRef = charOldRefs.find(r => (r.angle || "front") === angle.key);
            if (existingRef) {
              await storage.updateCharacterReference(existingRef.id, { status: "generating", taskId, prompt, imageUrl: null });
            } else {
              await storage.createCharacterReference({
                projectId: project.id, characterName: char.name, description: char.appearance,
                prompt, status: "generating", taskId, imageUrl: null, angle: angle.key,
              });
            }
          } catch (err: any) {
            console.error(`[char-regen-all] Failed ${char.name} ${angle.key}:`, err.message);
            const existingRef = charOldRefs.find(r => (r.angle || "front") === angle.key);
            if (existingRef) {
              await storage.updateCharacterReference(existingRef.id, { status: "failed" });
            }
          }
        }
      })().catch(err => {
        console.error(`[char-regen-all] Unhandled error for ${char.name}:`, err);
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/character-references/poll", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const refs = await storage.getCharacterReferencesByProject(req.params.id);
      let updated = 0;
      for (const ref of refs) {
        if (ref.status === "generating" && ref.taskId) {
          try {
            const result = await checkImageStatus(ref.taskId, userKeys.evolink);
            if (result.status === "completed" && result.imageUrl) {
              await storage.updateCharacterReference(ref.id, { status: "completed", imageUrl: result.imageUrl });
              updated++;
            } else if (result.status === "failed") {
              await storage.updateCharacterReference(ref.id, { status: "failed" });
              updated++;
            }
          } catch {}
        }
      }
      const latest = await storage.getCharacterReferencesByProject(req.params.id);
      res.json(latest);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/projects/:id/location-references", async (req, res) => {
    try {
      const refs = await storage.getLocationReferencesByProject(req.params.id);
      res.json(refs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/location-references/poll", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const refs = await storage.getLocationReferencesByProject(req.params.id);
      for (const ref of refs) {
        if (ref.status === "generating" && ref.taskId) {
          try {
            const result = await checkImageStatus(ref.taskId, userKeys.evolink);
            if (result.status === "completed" && result.imageUrl) {
              await storage.updateLocationReference(ref.id, { status: "completed", imageUrl: result.imageUrl });
            } else if (result.status === "failed") {
              await storage.updateLocationReference(ref.id, { status: "failed" });
            }
          } catch {}
        }
      }
      const latest = await storage.getLocationReferencesByProject(req.params.id);
      res.json(latest);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Face Photo Upload & Style Transfer ──────────────────────────────

  const faceUploadDir = path.join(process.cwd(), "uploads", "face-references");
  if (!fs.existsSync(faceUploadDir)) fs.mkdirSync(faceUploadDir, { recursive: true });

  const faceUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, faceUploadDir),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname) || ".jpg";
        cb(null, `face-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith("image/")) cb(null, true);
      else cb(new Error("Only image files are allowed"));
    },
  });

  app.get("/api/projects/:id/face-photos", async (req, res) => {
    try {
      const photos = await storage.getFacePhotosByProject(req.params.id);
      res.json(photos);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/characters/:name/face-photo", faceUpload.single("photo"), async (req, res) => {
    try {
      const file = (req as any).file;
      if (!file) return res.status(400).json({ error: "No image file provided" });

      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const characterName = decodeURIComponent(req.params.name);
      const existing = await storage.getFacePhotoByCharacter(project.id, characterName);
      if (existing) {
        try { fs.unlinkSync(path.join(faceUploadDir, path.basename(existing.originalPhotoUrl))); } catch {}
        await storage.deleteFacePhoto(existing.id);
      }

      const imageUrl = `/uploads/face-references/${file.filename}`;
      const photo = await storage.createFacePhoto({
        projectId: project.id,
        characterName,
        originalPhotoUrl: imageUrl,
        stylizedPhotoUrl: null,
        stylizedTaskId: null,
        status: "uploaded",
        originalFilename: file.originalname,
      });

      res.json(photo);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/projects/:id/characters/:name/face-photo", async (req, res) => {
    try {
      const characterName = decodeURIComponent(req.params.name);
      const photo = await storage.getFacePhotoByCharacter(req.params.id, characterName);
      if (!photo) return res.status(404).json({ error: "No face photo found for this character" });

      try { fs.unlinkSync(path.join(faceUploadDir, path.basename(photo.originalPhotoUrl))); } catch {}
      await storage.deleteFacePhoto(photo.id);
      res.json({ deleted: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/characters/:name/stylize-face", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const characterName = decodeURIComponent(req.params.name);
      const photo = await storage.getFacePhotoByCharacter(project.id, characterName);
      if (!photo) return res.status(404).json({ error: "No face photo found. Upload one first." });

      const analysis = project.analysis as ScriptAnalysis | null;
      const charData = analysis?.characters?.find(c => c.name.toLowerCase() === characterName.toLowerCase());

      const appearanceContext = charData
        ? `This character is ${charData.name} — ${charData.role}. ${charData.appearance}. ${charData.signatureFeatures ? `Signature features: ${charData.signatureFeatures}.` : ""}`
        : `This character is ${characterName}.`;

      const stylizePrompt = `Unreal Engine 5 cinematic 3D render, high-fidelity CGI character portrait with slight stylization — NOT a photograph. Convert the person in the reference photo into a UE5 cinematic 3D rendered character while PRESERVING their EXACT facial identity — same face shape, bone structure, eye shape, eye color, nose shape and size, jawline, brow structure, lip shape, cheekbones, skin tone, facial hair (if any), hairstyle and hair color. The result MUST be instantly recognizable as the same person, rendered in stylized high-fidelity CGI. ${appearanceContext} Front-facing portrait, 9:16 vertical frame, head and upper body visible. Clean solid neutral dark gray background with soft cinematic studio lighting — bright key light from upper right at 45 degrees, warm fill from left, subtle rim light on hair and jawline. Ultra-detailed CGI skin with subsurface scattering, visible pores, individual eyelashes, precise iris rendering. Expression: neutral-confident. No text, no watermarks, no UI elements.`;

      const apiKey = userKeys.evolink || process.env.NANOBANANA_API_KEY;
      if (!apiKey) throw new Error("EvoLink API key is required for style transfer.");

      let refImageUrl: string;
      const originalUrl = photo.originalPhotoUrl;
      if (originalUrl.startsWith("http")) {
        refImageUrl = originalUrl;
      } else {
        const filePath = path.join(process.cwd(), originalUrl.startsWith("/") ? originalUrl.slice(1) : originalUrl);
        const fileBuffer = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase().replace(".", "");
        const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg";
        const base64Data = `data:${mime};base64,${fileBuffer.toString("base64")}`;

        console.log(`[face-stylize] Uploading face photo to EvoLink file storage (${(fileBuffer.length / 1024).toFixed(0)}KB)...`);
        const uploadRes = await fetch("https://files-api.evolink.ai/api/v1/files/upload/base64", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ base64_data: base64Data, upload_path: "face-references" }),
        });
        if (!uploadRes.ok) {
          const errText = await uploadRes.text();
          throw new Error(`Failed to upload face photo to EvoLink: ${uploadRes.status} ${errText.substring(0, 200)}`);
        }
        const uploadData = await uploadRes.json();
        if (!uploadData.success || !uploadData.data?.file_url) {
          throw new Error(`Face photo upload returned unexpected response: ${JSON.stringify(uploadData).substring(0, 200)}`);
        }
        refImageUrl = uploadData.data.file_url;
        console.log(`[face-stylize] Face photo uploaded: ${refImageUrl}`);
      }

      const imgModel = (req.body?.imageModel as ImageModelId) || undefined;
      const { taskId } = await generateImage(stylizePrompt, [refImageUrl], imgModel, userKeys.evolink, "9:16");

      const updated = await storage.updateFacePhoto(photo.id, {
        status: "converting",
        stylizedTaskId: taskId,
        stylizedPhotoUrl: null,
      });

      res.json(updated);
    } catch (err: any) {
      console.error("[face-stylize] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/face-photos/poll", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const photos = await storage.getFacePhotosByProject(req.params.id);
      for (const photo of photos) {
        if (photo.status === "converting" && photo.stylizedTaskId) {
          try {
            const result = await checkImageStatus(photo.stylizedTaskId, userKeys.evolink);
            if (result.status === "completed" && result.imageUrl) {
              await storage.updateFacePhoto(photo.id, { status: "ready", stylizedPhotoUrl: result.imageUrl });
            } else if (result.status === "failed") {
              await storage.updateFacePhoto(photo.id, { status: "failed" });
            }
          } catch {}
        }
      }
      const latest = await storage.getFacePhotosByProject(req.params.id);
      res.json(latest);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Helper: get stylized face URL for a character ──────────────────

  async function getStylizedFaceUrl(projectId: string, characterName: string): Promise<string | undefined> {
    const photo = await storage.getFacePhotoByCharacter(projectId, characterName);
    if (photo && photo.status === "ready" && photo.stylizedPhotoUrl) {
      return photo.stylizedPhotoUrl;
    }
    return undefined;
  }

  app.post("/api/projects/:id/generate-character-references", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });
      const analysis = project.analysis as ScriptAnalysis;
      if (!analysis || !analysis.characters || analysis.characters.length === 0) {
        return res.status(400).json({ error: "No characters found. Analyze the project first." });
      }

      const imgModel = (req.body?.imageModel as ImageModelId) || undefined;

      await storage.deleteCharacterReferencesByProject(project.id);

      const angles: { key: string; label: string; poseInstruction: string; isCloseup?: boolean }[] = [
        {
          key: "front",
          label: "Front View",
          poseInstruction: "facing directly toward camera, symmetrical straight-on front view, direct eye contact, arms relaxed at sides",
        },
        {
          key: "three-quarter",
          label: "Three-Quarter View",
          poseInstruction: "facing three-quarter angle toward camera (45 degrees turned), face clearly visible with direct eye contact, natural relaxed pose",
        },
        {
          key: "closeup",
          label: "Face Close-Up",
          poseInstruction: "extreme close-up of the face filling most of the frame, showing every facial detail — eyes, eyebrows, nose, lips, jawline, skin texture, facial hair if any, from a straight-on front angle with direct eye contact",
          isCloseup: true,
        },
      ];

      const allFacePhotos = await storage.getFacePhotosByProject(project.id);
      const facePhotoMap = new Map<string, string>();
      for (const fp of allFacePhotos) {
        if (fp.status === "ready" && fp.stylizedPhotoUrl) {
          facePhotoMap.set(fp.characterName.toLowerCase(), fp.stylizedPhotoUrl);
        }
      }

      const refs = [];
      for (const char of analysis.characters) {
        const stylizedFaceUrl = facePhotoMap.get(char.name.toLowerCase());
        const likenessAnchor = stylizedFaceUrl
          ? `LIKENESS REFERENCE: This character's face MUST match the reference image — preserve the exact facial structure, eye shape, nose, jawline, brow, cheekbones, and all distinguishing facial features from the reference. `
          : "";

        for (const angle of angles) {
          const sigFeatures = char.signatureFeatures ? `SIGNATURE FEATURES (these MUST be visible and accurate): ${char.signatureFeatures}.` : "";

          const prompt = angle.isCloseup
            ? `Unreal Engine 5 cinematic 3D render, high-fidelity CGI character portrait, ultra-detailed, 9:16 vertical frame. ${likenessAnchor}EXTREME FACE CLOSE-UP of ${char.name} — head and shoulders filling the frame, face as the sole focus. ${char.appearance}. ${sigFeatures} Shot type: ${angle.poseInstruction}. Clean solid neutral dark gray background with soft cinematic studio lighting — bright key light from upper right at 45 degrees, warm fill from left, subtle rim light on hair and jawline. Expression: neutral-confident, conveying personality and presence. Ultra-detailed facial rendering: visible pores, subsurface scattering on skin, individual eyelashes, precise iris color and pattern, accurate lip texture, every facial mark and scar rendered. This is a FACE REFERENCE IMAGE — the purpose is to lock down this character's exact facial identity for visual consistency in later scenes. No text, no watermarks, no UI elements, no extra fingers or distorted features.`
            : `Unreal Engine 5 cinematic 3D render, high-fidelity CGI character reference with slight stylization, ultra-detailed, 9:16 vertical portrait frame. ${likenessAnchor}FULL BODY STANDING PORTRAIT of ${char.name} — ${angle.label} — showing head to feet, entire body visible in vertical composition. ${char.appearance}. ${sigFeatures} Shot type: full-body standing pose, ${angle.poseInstruction}. The ENTIRE body from head to boots/shoes must be visible — do NOT crop at waist or chest. Clean solid neutral dark gray background with soft cinematic studio lighting — bright key light from upper right at 45 degrees, cool fill from left, strong rim light outlining the full body silhouette. Expression: neutral-confident, conveying authority and presence. High-fidelity CGI skin with subsurface scattering, highly detailed facial features clearly visible, detailed fabric textures on clothing/uniform with every button, insignia, pocket and accessory rendered accurately, detailed hands and footwear. This is a CHARACTER REFERENCE IMAGE (${angle.label}) — the purpose is to establish exactly what this character looks like from this specific angle for visual consistency in later scenes. No text, no watermarks, no UI elements, no extra fingers or distorted features.`;

          const refImageUrls = stylizedFaceUrl ? [stylizedFaceUrl] : undefined;
          const { taskId } = await generateImage(prompt, refImageUrls, imgModel, userKeys.evolink, "9:16");
          const ref = await storage.createCharacterReference({
            projectId: project.id,
            characterName: char.name,
            description: char.appearance,
            prompt,
            status: "generating",
            taskId,
            imageUrl: null,
            angle: angle.key,
          });
          refs.push(ref);
        }
      }

      res.json({ started: true, count: refs.length, refs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  async function getCharacterReferenceUrlsForScene(projectId: string, scene: { context?: string | null; characters?: any; location?: string | null }): Promise<string[]> {
    let charactersPresent: string[] = [];
    let sceneLocation = "";
    if (scene.context) {
      try {
        const ctx = JSON.parse(scene.context as string);
        charactersPresent = ctx.charactersPresent || [];
      } catch {}
    }
    if (charactersPresent.length === 0 && Array.isArray(scene.characters)) {
      charactersPresent = scene.characters;
    }
    if (scene.location) sceneLocation = scene.location;

    const refs = await storage.getCharacterReferencesByProject(projectId);
    const locationRefs = await storage.getLocationReferencesByProject(projectId);
    const angleOrder = ["front", "closeup", "three-quarter"];
    const maxTotal = 3;

    let locationRefUrl: string | null = null;
    if (sceneLocation && locationRefs.length > 0) {
      const locMatch = locationRefs.find(lr =>
        lr.status === "completed" && lr.imageUrl &&
        lr.locationName.toLowerCase() === sceneLocation.toLowerCase()
      );
      if (locMatch) locationRefUrl = locMatch.imageUrl;
    }

    const maxCharRefs = locationRefUrl ? 2 : maxTotal;

    const charRefMap: Map<string, string[]> = new Map();
    for (const charName of charactersPresent) {
      const charRefs = refs
        .filter(r => r.status === "completed" && r.imageUrl && r.characterName.toLowerCase() === charName.toLowerCase())
        .sort((a, b) => angleOrder.indexOf(a.angle || "front") - angleOrder.indexOf(b.angle || "front"));
      if (charRefs.length > 0) {
        charRefMap.set(charName, charRefs.map(r => r.imageUrl!));
      }
    }

    const urls: string[] = [];
    for (const [, charUrls] of charRefMap) {
      if (urls.length < maxCharRefs && charUrls.length > 0) {
        urls.push(charUrls[0]);
      }
    }
    if (urls.length < maxCharRefs) {
      for (const [, charUrls] of charRefMap) {
        for (const url of charUrls) {
          if (!urls.includes(url) && urls.length < maxCharRefs) {
            urls.push(url);
          }
        }
      }
    }

    if (locationRefUrl) {
      urls.push(locationRefUrl);
    }

    return urls.slice(0, maxTotal);
  }

  const storyBibleCache = new Map<string, StoryBible>();
  const visualScenesCache = new Map<string, VisualScene[]>();

  async function getStoryBible(projectId: string): Promise<StoryBible | null> {
    const cached = storyBibleCache.get(projectId);
    if (cached) return cached;
    const project = await storage.getProject(projectId);
    if (project?.analysis && typeof project.analysis === "object") {
      const analysis = project.analysis as any;
      const reconstructed: StoryBible = {
        analysis,
        narrativeArc: { opening: "", rising: "", climax: "", resolution: "" },
        moodTimeline: [],
      };
      storyBibleCache.set(projectId, reconstructed);
      return reconstructed;
    }
    return null;
  }

  function runVisionCheckAsync(
    imageId: string,
    imageUrl: string,
    prompt: string,
    projectId: string,
    sceneId: string,
    userAnthropicKey: string | undefined,
  ) {
    (async () => {
      try {
        const scene = await storage.getScene(sceneId);
        const storyBible = await getStoryBible(projectId);
        let sceneDescription = "";
        let characterSignatures: Array<{ name: string; signatureFeatures: string }> = [];

        if (scene?.sceneDescription) sceneDescription = scene.sceneDescription;

        if (storyBible?.analysis?.characters && scene?.context) {
          try {
            const ctx = JSON.parse(scene.context);
            const present = ctx.charactersPresent || [];
            characterSignatures = (storyBible.analysis.characters || [])
              .filter((c: any) => present.some((p: string) => c.name?.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(c.name?.toLowerCase())))
              .map((c: any) => ({ name: c.name, signatureFeatures: c.signatureFeatures || "" }))
              .filter((c: any) => c.signatureFeatures);
          } catch { /* ignore parse errors */ }
        }

        const result = await checkImageQuality(imageUrl, prompt, characterSignatures, sceneDescription, userAnthropicKey);
        if (result.score === "flagged" && result.feedback) {
          await storage.updateImage(imageId, {
            qualityScore: "flagged",
            qualityFeedback: result.feedback,
          } as any);
          console.log(`[quality-check] Image ${imageId} FLAGGED: ${result.feedback}`);
        } else {
          await storage.updateImage(imageId, {
            qualityScore: "pass",
            qualityFeedback: null,
          } as any);
        }
      } catch (err: any) {
        console.warn(`[quality-check] Vision check failed for image ${imageId}: ${err.message}`);
      }
    })();
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
  const generationProgressMap = new Map<string, GenerationProgress>();
  const analysisRunning = new Set<string>();

  const MAX_CONTENT_POLICY_RETRIES = 3;

  async function generateImageWithAutoRetry(
    prompt: string,
    referenceImageUrls: string[] | undefined,
    imgModel: ImageModelId | undefined,
    userEvolinkKey: string | undefined,
    userAnthropicKey: string | undefined,
  ): Promise<{ taskId: string; finalPrompt: string }> {
    let currentPrompt = prompt;

    for (let attempt = 0; attempt <= MAX_CONTENT_POLICY_RETRIES; attempt++) {
      try {
        const { taskId } = await generateImage(currentPrompt, referenceImageUrls, imgModel, userEvolinkKey);
        return { taskId, finalPrompt: currentPrompt };
      } catch (err: any) {
        if (!(err instanceof ContentPolicyError)) {
          throw err;
        }

        if (attempt >= MAX_CONTENT_POLICY_RETRIES) {
          console.error(`[auto-retry] All ${MAX_CONTENT_POLICY_RETRIES + 1} attempts exhausted for content policy. Giving up.`);
          throw err;
        }

        const retryNum = attempt + 1;
        console.log(`[auto-retry] Content policy rejection #${retryNum}, rewriting prompt (attempt ${retryNum}/${MAX_CONTENT_POLICY_RETRIES})...`);

        if (attempt === 0) {
          currentPrompt = sanitizePromptForGemini(currentPrompt);
          console.log(`[auto-retry] Applied term-level sanitization, retrying...`);
        } else {
          try {
            currentPrompt = await rewriteSafePrompt(currentPrompt, err.message, userAnthropicKey);
            console.log(`[auto-retry] AI rewrote prompt for safety (attempt ${retryNum}), retrying...`);
          } catch (rewriteErr: any) {
            console.error(`[auto-retry] AI rewrite failed: ${rewriteErr.message}, applying deeper sanitization...`);
            currentPrompt = sanitizePromptForGemini(prompt);
          }
        }

        await new Promise(r => setTimeout(r, 2000));
      }
    }

    throw new Error("Image generation failed: content policy retries exhausted");
  }

  const MAX_VIDEO_CONTENT_RETRIES = 3;

  async function generateVideoWithAutoRetry(
    imageUrl: string,
    prompt: string,
    modelId: VideoModelId | undefined,
    durationOverride: number | undefined,
    userEvolinkKey: string | undefined,
    userAnthropicKey: string | undefined,
  ): Promise<{ taskId: string; videoUrl?: string; finalPrompt: string }> {
    let currentPrompt = prompt;

    for (let attempt = 0; attempt <= MAX_VIDEO_CONTENT_RETRIES; attempt++) {
      try {
        const result = await generateVideo(imageUrl, currentPrompt, modelId, durationOverride, userEvolinkKey);
        return { ...result, finalPrompt: currentPrompt };
      } catch (err: any) {
        if (!(err instanceof ContentPolicyError)) {
          throw err;
        }

        if (attempt >= MAX_VIDEO_CONTENT_RETRIES) {
          console.error(`[video-auto-retry] All ${MAX_VIDEO_CONTENT_RETRIES + 1} attempts exhausted for video content policy. Giving up.`);
          throw err;
        }

        const retryNum = attempt + 1;
        console.log(`[video-auto-retry] Content policy rejection #${retryNum}, rewriting video prompt...`);

        if (attempt === 0) {
          currentPrompt = sanitizePromptForGemini(currentPrompt);
          console.log(`[video-auto-retry] Applied term-level sanitization, retrying...`);
        } else {
          try {
            currentPrompt = await rewriteSafePrompt(currentPrompt, err.message, userAnthropicKey);
            console.log(`[video-auto-retry] AI rewrote video prompt for safety (attempt ${retryNum}), retrying...`);
          } catch (rewriteErr: any) {
            console.error(`[video-auto-retry] AI rewrite failed: ${rewriteErr.message}, applying deeper sanitization...`);
            currentPrompt = sanitizePromptForGemini(prompt);
          }
        }

        await new Promise(r => setTimeout(r, 2000));
      }
    }

    throw new Error("Video generation failed: content policy retries exhausted");
  }

  async function setProgressDb(projectId: string, step: string, detail: string, current: number, total: number) {
    try {
      await storage.updateProject(projectId, {
        analysisProgress: { step, detail, current, total } as any,
      });
    } catch (e: any) {
      console.error(`Failed to persist progress for ${projectId}: ${e.message}`);
    }
  }

  app.get("/api/projects/:id/analyze-progress", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) return res.json(null);
      res.json(project.analysisProgress || null);
    } catch {
      res.json(null);
    }
  });

  app.post("/api/projects/:id/analyze", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const anthropicKey = userKeys.anthropic || process.env.ANTHROPIC_API_KEY;
      if (!anthropicKey) {
        return res.status(400).json({
          error: "No Anthropic API key found. Please enter your API key in Settings (gear icon) or set the ANTHROPIC_API_KEY environment variable.",
        });
      }

      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });

      if (analysisRunning.has(project.id)) {
        return res.json({ status: "already_running", message: "Analysis is already in progress." });
      }
      if (project.status === "analyzing" && !analysisRunning.has(project.id)) {
        await storage.updateProject(project.id, { status: "draft" });
      }

      const analysisMode = req.body?.mode === "budget" ? "budget" : "fast";

      analysisRunning.add(project.id);

      await storage.updateProject(project.id, { status: "analyzing" });
      await setProgressDb(project.id, "reading", "Reading and parsing your complete story...", 1, 6);

      res.json({ status: "started", message: "Analysis started. Poll progress for updates.", mode: analysisMode });

      (async () => {
        try {
          const sentences = splitIntoSentences(project.script);
          const CHUNK_THRESHOLD = 150;
          const isLongScript = sentences.length > CHUNK_THRESHOLD;
          let storyBible: StoryBible;
          let visualScenes: VisualScene[];

          if (analysisMode === "fast") {
            // --- FAST MODE: streaming API, no batch queue wait ---
            if (isLongScript) {
              await setProgressDb(project.id, "comprehending", `Streaming Story Bible analysis (${sentences.length} sentences)...`, 1, 6);
              storyBible = await analyzeStoryBibleOnly(project.script, userKeys.anthropic);

              const CHUNK_SIZE = 50;
              const chunks: { start: number; end: number }[] = [];
              for (let i = 0; i < sentences.length; i += CHUNK_SIZE) {
                chunks.push({ start: i, end: Math.min(i + CHUNK_SIZE, sentences.length) });
              }

              await setProgressDb(project.id, "comprehending", `Streaming ${chunks.length} visual scene chunks in parallel...`, 2, 6);
              const pLimit = (await import("p-limit")).default;
              const limit = pLimit(50);
              let chunksCompleted = 0;
              const chunkResults = await Promise.all(
                chunks.map((chunk, c) => limit(async () => {
                  try {
                    const scenes = await analyzeVisualScenesChunk(project.script, sentences, chunk.start, chunk.end, storyBible, c + 1, chunks.length, userKeys.anthropic);
                    chunksCompleted++;
                    await setProgressDb(project.id, "comprehending", `Visual scene chunks: ${chunksCompleted}/${chunks.length} complete`, 2, 6);
                    return { index: c, scenes, success: true as const };
                  } catch (err: any) {
                    console.error(`Visual scenes chunk ${c} failed: ${err.message}`);
                    chunksCompleted++;
                    await setProgressDb(project.id, "comprehending", `Visual scene chunks: ${chunksCompleted}/${chunks.length} complete (chunk ${c + 1} failed)`, 2, 6);
                    return { index: c, scenes: [] as VisualScene[], success: false as const };
                  }
                }))
              );

              let allVisualScenes: VisualScene[] = [];
              for (const result of chunkResults.sort((a, b) => a.index - b.index)) {
                allVisualScenes = allVisualScenes.concat(result.scenes);
              }
              visualScenes = validateAndFillSentenceCoverage(allVisualScenes, sentences, storyBible.analysis);

            } else {
              await setProgressDb(project.id, "comprehending", `Streaming full script analysis (${sentences.length} sentences)...`, 1, 6);
              const fullStoryParams = buildFullStoryParams(project.script);
              const text = await streamSingleRequest(fullStoryParams, userKeys.anthropic);
              const parsed = parseFullStoryResult(text, sentences);
              storyBible = parsed.storyBible;
              visualScenes = parsed.visualScenes;
            }

          } else {
            // --- BUDGET MODE: batch API with 50% cost savings ---
            if (isLongScript) {
              await setProgressDb(project.id, "comprehending", `Long script (${sentences.length} sentences). Submitting Story Bible batch to Anthropic for 50% cost savings...`, 1, 6);
              const storyBibleParams = buildStoryBibleParams(project.script);
              const sbBatch = await submitBatch([{ custom_id: "story-bible", params: storyBibleParams }], userKeys.anthropic);
              await setProgressDb(project.id, "comprehending", `Story Bible batch submitted (${sbBatch.batchId}). Waiting for Anthropic to process — you can navigate away and return later...`, 1, 6);

              const sbResults = await pollBatchUntilDone(sbBatch.batchId, userKeys.anthropic, async (status, elapsed) => {
                const counts = status.requestCounts;
                const detail = counts
                  ? `Story Bible batch ${sbBatch.batchId} — processing: ${counts.processing}, done: ${counts.succeeded}, elapsed: ${formatElapsed(elapsed)}`
                  : `Story Bible batch ${sbBatch.batchId} — waiting... elapsed: ${formatElapsed(elapsed)}`;
                await setProgressDb(project.id, "comprehending", detail, 1, 6);
              });

              const sbResult = sbResults.find(r => r.custom_id === "story-bible");
              if (!sbResult?.success || !sbResult.text) throw new Error(sbResult?.error || "Story Bible batch failed");
              storyBible = parseStoryBibleResult(sbResult.text);

              const CHUNK_SIZE = 50;
              const chunks: { start: number; end: number }[] = [];
              for (let i = 0; i < sentences.length; i += CHUNK_SIZE) {
                chunks.push({ start: i, end: Math.min(i + CHUNK_SIZE, sentences.length) });
              }

              const vsRequests: BatchRequest[] = chunks.map((chunk, c) => ({
                custom_id: `visual-scenes-chunk-${c}`,
                params: buildVisualScenesChunkParams(project.script, sentences, chunk.start, chunk.end, storyBible, c + 1, chunks.length),
              }));

              await setProgressDb(project.id, "comprehending", `Submitting ${chunks.length} visual scene chunks as batch...`, 2, 6);
              const vsBatch = await submitBatch(vsRequests, userKeys.anthropic);
              await setProgressDb(project.id, "comprehending", `Visual scenes batch submitted (${vsBatch.batchId}). Processing ${chunks.length} chunks — you can navigate away...`, 2, 6);

              const vsResults = await pollBatchUntilDone(vsBatch.batchId, userKeys.anthropic, async (status, elapsed) => {
                const counts = status.requestCounts;
                const detail = counts
                  ? `Visual scenes batch ${vsBatch.batchId} — done: ${counts.succeeded}/${chunks.length}, elapsed: ${formatElapsed(elapsed)}`
                  : `Visual scenes batch ${vsBatch.batchId} — waiting... elapsed: ${formatElapsed(elapsed)}`;
                await setProgressDb(project.id, "comprehending", detail, 2, 6);
              });

              let allVisualScenes: VisualScene[] = [];
              for (let c = 0; c < chunks.length; c++) {
                const chunk = chunks[c];
                const vsResult = vsResults.find(r => r.custom_id === `visual-scenes-chunk-${c}`);
                if (!vsResult?.success || !vsResult.text) {
                  console.error(`Visual scenes chunk ${c} failed: ${vsResult?.error || "no result"}`);
                  continue;
                }
                const chunkScenes = parseVisualScenesChunkResult(vsResult.text, sentences, chunk.start, chunk.end, storyBible, `Chunk ${c + 1}`);
                allVisualScenes = allVisualScenes.concat(chunkScenes);
              }
              visualScenes = validateAndFillSentenceCoverage(allVisualScenes, sentences, storyBible.analysis);

            } else {
              await setProgressDb(project.id, "comprehending", `Submitting script analysis batch to Anthropic for 50% cost savings (${sentences.length} sentences)...`, 1, 6);
              const fullParams = buildFullStoryParams(project.script);
              const fullBatch = await submitBatch([{ custom_id: "full-story", params: fullParams }], userKeys.anthropic);
              await setProgressDb(project.id, "comprehending", `Analysis batch submitted (${fullBatch.batchId}). Waiting for Anthropic — you can navigate away and return later...`, 1, 6);

              const fullResults = await pollBatchUntilDone(fullBatch.batchId, userKeys.anthropic, async (status, elapsed) => {
                const counts = status.requestCounts;
                const detail = counts
                  ? `Analysis batch ${fullBatch.batchId} — processing: ${counts.processing}, done: ${counts.succeeded}, elapsed: ${formatElapsed(elapsed)}`
                  : `Analysis batch ${fullBatch.batchId} — waiting... elapsed: ${formatElapsed(elapsed)}`;
                await setProgressDb(project.id, "comprehending", detail, 1, 6);
              });

              const fullResult = fullResults.find(r => r.custom_id === "full-story");
              if (!fullResult?.success || !fullResult.text) throw new Error(fullResult?.error || "Full story batch failed");
              const parsed = parseFullStoryResult(fullResult.text, sentences);
              storyBible = parsed.storyBible;
              visualScenes = parsed.visualScenes;
            }
          }

          storyBibleCache.set(project.id, storyBible);
          visualScenesCache.set(project.id, visualScenes);

          const analysis = storyBible.analysis;
          const charCount = analysis.characters?.length || 0;
          const jetCount = analysis.jets?.length || 0;
          const locCount = analysis.locations?.length || 0;
          const sceneCount = visualScenes.filter(s => s.isVisual).length;
          await setProgressDb(project.id, "analyzed", `Story understood: ${charCount} characters, ${jetCount} aircraft, ${locCount} locations, ${sceneCount} visual beats identified`, 3, 6);

          await storage.updateProject(project.id, { analysis: analysis as any });

          await storage.deleteImagesByProject(project.id);
          await storage.deleteScenesByProject(project.id);
          await storage.deleteCharacterReferencesByProject(project.id);
          await storage.deleteLocationReferencesByProject(project.id);

          const visualOnlyScenes = visualScenes.filter(s => s.isVisual);
          const totalPromptSteps = visualOnlyScenes.length;

          if (totalPromptSteps === 0) {
            await storage.updateProject(project.id, { status: "analyzed" });
            await setProgressDb(project.id, "complete", "Analysis complete — no visual scenes found in script.", 0, 0);
            console.log(`Analysis complete for project ${project.id}: 0 visual scenes`);
            return;
          }

          await setProgressDb(project.id, "directing", `Director planning shot variety across ${totalPromptSteps} scenes...`, 3, 6);
          let directorsPlan: DirectorsShotPlanEntry[] | undefined;
          try {
            directorsPlan = await generateDirectorsShotPlan(visualOnlyScenes, storyBible, userKeys.anthropic);
            console.log(`[analyze] Director's Shot Plan generated: ${directorsPlan.length} scene entries`);
          } catch (planErr: any) {
            console.warn(`[analyze] Director's Shot Plan failed (non-fatal): ${planErr.message}. Proceeding without it.`);
            directorsPlan = undefined;
          }

          const promptRequests = visualOnlyScenes.map((vs, index) => {
            const prevVs = index > 0 ? visualOnlyScenes[index - 1] : null;
            const nextVs = index < visualOnlyScenes.length - 1 ? visualOnlyScenes[index + 1] : null;
            const planEntry = directorsPlan?.[index];
            return {
              custom_id: `scene-prompt-${index}`,
              params: buildSequencePromptParams(vs, index, visualOnlyScenes.length, storyBible, prevVs, nextVs, visualOnlyScenes, planEntry),
            };
          });

          let promptResults: Array<{ custom_id: string; success: boolean; text?: string; error?: string }>;

          if (analysisMode === "fast") {
            await setProgressDb(project.id, "prompts", `Streaming ${totalPromptSteps} scene prompts in parallel...`, 0, totalPromptSteps);
            promptResults = await streamParallelRequests(
              promptRequests,
              userKeys.anthropic,
              50,
              async (completed, total, _customId) => {
                await setProgressDb(project.id, "prompts", `Scene prompts: ${completed}/${total} complete`, completed, total);
              },
            );
          } else {
            const batchRequests: BatchRequest[] = promptRequests;
            await setProgressDb(project.id, "prompts", `Submitting ${totalPromptSteps} scene prompts as batch for 50% savings...`, 0, totalPromptSteps);
            const promptBatch = await submitBatch(batchRequests, userKeys.anthropic);
            await setProgressDb(project.id, "prompts", `Scene prompts batch submitted (${promptBatch.batchId}). Processing ${totalPromptSteps} prompts — you can navigate away...`, 0, totalPromptSteps);

            promptResults = await pollBatchUntilDone(promptBatch.batchId, userKeys.anthropic, async (status, elapsed) => {
              const counts = status.requestCounts;
              const succeeded = counts?.succeeded || 0;
              const detail = counts
                ? `Prompts batch ${promptBatch.batchId} — done: ${succeeded}/${totalPromptSteps}, elapsed: ${formatElapsed(elapsed)}`
                : `Prompts batch ${promptBatch.batchId} — waiting... elapsed: ${formatElapsed(elapsed)}`;
              await setProgressDb(project.id, "prompts", detail, succeeded, totalPromptSteps);
            });
          }

          let createdCount = 0;
          for (let index = 0; index < visualOnlyScenes.length; index++) {
            const vs = visualOnlyScenes[index];
            const promptResult = promptResults.find(r => r.custom_id === `scene-prompt-${index}`);

            let seqResult;
            if (promptResult?.success && promptResult.text) {
              try {
                seqResult = parseSequencePromptResult(promptResult.text, vs, index);
              } catch (parseErr: any) {
                console.error(`Scene ${index + 1} prompt parse failed: ${parseErr.message}. Using fallback.`);
                seqResult = null;
              }
            } else {
              console.error(`Scene ${index + 1} batch failed: ${promptResult?.error || "no result"}. Using fallback.`);
              seqResult = null;
            }

            if (!seqResult) {
              const fallbackPrompt = `Unreal Engine 5 cinematic 3D render, high-fidelity CGI with slight stylization — NOT a photograph, cinematic 8K, 16:9 widescreen aspect ratio. ${vs.visualBeat}. ${vs.mood} mood, ${vs.timeOfDay}, ${vs.location}. Cinematic military aviation CGI, Unreal Engine 5 quality, volumetric lighting, motion blur where appropriate, film grain, no text, no watermarks, no UI elements, no cartoons.`;
              seqResult = {
                prompts: [fallbackPrompt, fallbackPrompt],
                shotLabels: ["Wide Establishing", "Medium Shot"],
                sceneDescription: vs.sceneDescription || vs.visualBeat,
                mood: vs.mood,
                timeOfDay: vs.timeOfDay,
                cameraAngle: "Cinematic sequence",
                transitionNote: "",
              };
            }

            await storage.createScene({
              projectId: project.id,
              sentenceIndex: index,
              sentence: vs.sentences.join(" "),
              context: JSON.stringify({
                visualBeat: vs.visualBeat,
                sentenceIndices: vs.sentenceIndices,
                charactersPresent: vs.charactersPresent,
                aircraftPresent: vs.aircraftPresent,
                vehiclesPresent: vs.vehiclesPresent || [],
                keyObjectsPresent: vs.keyObjectsPresent || [],
                lightingNote: vs.lightingNote,
                weatherConditions: vs.weatherConditions || "",
                transitionNote: seqResult.transitionNote,
                dramaticPurpose: vs.dramaticPurpose || "",
                emotionalState: vs.emotionalState || "",
                emotionalIntensity: 5,
                environmentalContinuity: vs.environmentalContinuity || "",
                characterStates: vs.characterStates || {},
                objectStates: vs.objectStates || {},
              }),
              sceneDescription: seqResult.sceneDescription,
              promptBase: JSON.stringify(seqResult.prompts),
              shotLabels: JSON.stringify(seqResult.shotLabels),
              expectedImages: seqResult.prompts.length,
              characters: vs.charactersPresent as any,
              objects: vs.aircraftPresent as any,
              location: vs.location,
              timeOfDay: seqResult.timeOfDay,
              mood: seqResult.mood,
              cameraAngle: seqResult.cameraAngle,
            });
            createdCount++;
          }

          const scriptWordCount = project.script.split(/\s+/).length;
          const costMultiplier = analysisMode === "budget" ? 0.5 : 1.0;
          const estimatedAnalysisCost = Math.max(0.05, ((scriptWordCount / 1000) * 0.15 + createdCount * 0.05) * costMultiplier);
          storage.addProjectCost(project.id, "analysisCost", parseFloat(estimatedAnalysisCost.toFixed(4))).catch(() => {});
          // #region agent log
          fetch('http://127.0.0.1:7650/ingest/052faa48-3566-4ba0-8498-06374a0a8865',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c358ba'},body:JSON.stringify({sessionId:'c358ba',hypothesisId:'E',location:'routes.ts:analysis-cost:1602',message:'Server analysis cost vs client formula',data:{projectId:project.id,serverCost:parseFloat(estimatedAnalysisCost.toFixed(4)),scriptWordCount,scenesCreated:createdCount,analysisMode,costMultiplier,clientWouldShow:0.50+(createdCount*0.30),discrepancy:(0.50+(createdCount*0.30))-parseFloat(estimatedAnalysisCost.toFixed(4))},timestamp:Date.now()})}).catch(()=>{});
          // #endregion

          await storage.updateProject(project.id, {
            status: "analyzed",
          });
          await setProgressDb(project.id, "complete", `Analysis complete! ${createdCount} scenes created.`, totalPromptSteps, totalPromptSteps);
          console.log(`Analysis complete for project ${project.id}: ${createdCount} scenes, est. analysis cost: $${estimatedAnalysisCost.toFixed(4)}`);

          if (analysis.characters && analysis.characters.length > 0) {
            try {
              const existingRefs = await storage.getCharacterReferencesByProject(project.id);
              if (existingRefs.length === 0) {
                const autoAngles: { key: string; label: string; poseInstruction: string; isCloseup?: boolean }[] = [
                  { key: "front", label: "Front View", poseInstruction: "facing directly toward camera, symmetrical straight-on front view, direct eye contact, arms relaxed at sides" },
                  { key: "three-quarter", label: "Three-Quarter View", poseInstruction: "facing three-quarter angle toward camera (45 degrees turned), face clearly visible with direct eye contact, natural relaxed pose" },
                  { key: "closeup", label: "Face Close-Up", poseInstruction: "extreme close-up of the face filling most of the frame, showing every facial detail — eyes, eyebrows, nose, lips, jawline, skin texture, facial hair if any, from a straight-on front angle with direct eye contact", isCloseup: true },
                ];
                const allAutoFacePhotos = await storage.getFacePhotosByProject(project.id);
                const autoFaceMap = new Map<string, string>();
                for (const fp of allAutoFacePhotos) {
                  if (fp.status === "ready" && fp.stylizedPhotoUrl) {
                    autoFaceMap.set(fp.characterName.toLowerCase(), fp.stylizedPhotoUrl);
                  }
                }

                const totalPortraits = analysis.characters.length * autoAngles.length;
                console.log(`[auto-portraits] Generating ${totalPortraits} character portraits (${analysis.characters.length} chars × ${autoAngles.length} angles) for project ${project.id}`);
                for (const char of analysis.characters) {
                  const autoStylizedFace = autoFaceMap.get(char.name.toLowerCase());
                  const autoLikenessAnchor = autoStylizedFace
                    ? `LIKENESS REFERENCE: This character's face MUST match the reference image — preserve the exact facial structure, eye shape, nose, jawline, brow, cheekbones, and all distinguishing facial features from the reference. `
                    : "";
                  const autoRefUrls = autoStylizedFace ? [autoStylizedFace] : undefined;
                  for (const angle of autoAngles) {
                    const sigFeatures = char.signatureFeatures ? `SIGNATURE FEATURES (these MUST be visible and accurate): ${char.signatureFeatures}.` : "";
                    const portraitPrompt = angle.isCloseup
                      ? `Unreal Engine 5 cinematic 3D render, high-fidelity CGI character portrait, ultra-detailed, 9:16 vertical frame. ${autoLikenessAnchor}EXTREME FACE CLOSE-UP of ${char.name} — head and shoulders filling the frame, face as the sole focus. ${char.appearance}. ${sigFeatures} Shot type: ${angle.poseInstruction}. Clean solid neutral dark gray background with soft cinematic studio lighting — bright key light from upper right at 45 degrees, warm fill from left, subtle rim light on hair and jawline. Expression: neutral-confident, conveying personality and presence. Ultra-detailed facial rendering: visible pores, subsurface scattering on skin, individual eyelashes, precise iris color and pattern, accurate lip texture, every facial mark and scar rendered. Anatomically correct human proportions — no extra fingers, no distorted limbs, no fused or deformed features. This is a FACE REFERENCE IMAGE — the purpose is to lock down this character's exact facial identity for visual consistency in later scenes. No text, no watermarks, no UI elements.`
                      : `Unreal Engine 5 cinematic 3D render, high-fidelity CGI character reference with slight stylization, ultra-detailed, 9:16 vertical portrait frame. ${autoLikenessAnchor}FULL BODY STANDING PORTRAIT of ${char.name} — ${angle.label} — showing head to feet, entire body visible in vertical composition. ${char.appearance}. ${sigFeatures} Shot type: full-body standing pose, ${angle.poseInstruction}. The ENTIRE body from head to boots/shoes must be visible — do NOT crop at waist or chest. Clean solid neutral dark gray background with soft cinematic studio lighting — bright key light from upper right at 45 degrees, cool fill from left, strong rim light outlining the full body silhouette. Expression: neutral-confident, conveying authority and presence. High-fidelity CGI skin with subsurface scattering, highly detailed facial features clearly visible, detailed fabric textures on clothing/uniform with every button, insignia, pocket and accessory rendered accurately. Anatomically correct human proportions — exactly five fingers per hand, no extra digits, no distorted or fused limbs, proper hand and foot anatomy. This is a CHARACTER REFERENCE IMAGE (${angle.label}) — the purpose is to establish exactly what this character looks like from this specific angle for visual consistency in later scenes. No text, no watermarks, no UI elements.`;
                    try {
                      const portraitModelConfig = getImageModelConfig();
                      const { taskId } = await generateImage(portraitPrompt, autoRefUrls, undefined, userKeys.evolink, "9:16");
                      storage.addProjectCost(project.id, "imageGenerationCost", portraitModelConfig.costPerImage).catch(() => {});
                      await storage.createCharacterReference({
                        projectId: project.id,
                        characterName: char.name,
                        description: char.appearance,
                        prompt: portraitPrompt,
                        status: "generating",
                        taskId,
                        imageUrl: null,
                        angle: angle.key,
                      });
                    } catch (portraitErr: any) {
                      console.error(`[auto-portraits] Failed to generate ${angle.label} portrait for ${char.name}:`, portraitErr.message);
                    }
                  }
                }
                console.log(`[auto-portraits] Character portrait generation initiated for project ${project.id}`);
              } else {
                console.log(`[auto-portraits] Skipping — project ${project.id} already has ${existingRefs.length} character references`);
              }
            } catch (autoPortraitErr: any) {
              console.error(`[auto-portraits] Error during auto portrait generation:`, autoPortraitErr.message);
            }

          }

          try {
            const existingLocRefs = await storage.getLocationReferencesByProject(project.id);
            if (existingLocRefs.length === 0 && analysis.locations && analysis.locations.length > 0) {
              const locationFrequency = new Map<string, number>();
              for (const vs of visualOnlyScenes) {
                const locName = (vs.location || "").toLowerCase();
                if (locName) locationFrequency.set(locName, (locationFrequency.get(locName) || 0) + 1);
              }
              const sortedLocations = analysis.locations
                .map((loc: any) => ({ ...loc, freq: locationFrequency.get(loc.name?.toLowerCase() || "") || 0 }))
                .sort((a: any, b: any) => b.freq - a.freq)
                .slice(0, 3);

              console.log(`[auto-locations] Generating reference images for top ${sortedLocations.length} locations`);
              for (const loc of sortedLocations) {
                const locPrompt = `Unreal Engine 5 cinematic 3D render, ultra-detailed environment establishing shot, 16:9 widescreen. WIDE ESTABLISHING VIEW of ${loc.name}. ${loc.visualDetails || loc.description || ""}. ${loc.signatureFeatures ? `KEY VISUAL FEATURES: ${loc.signatureFeatures}.` : ""} Cinematic landscape photography style — bright, vivid, properly exposed. Volumetric lighting, atmospheric haze, rich environmental detail in foreground, midground, and background layers. This is a LOCATION REFERENCE IMAGE — the purpose is to lock down this environment's exact visual identity for consistency across all scenes set here. No characters, no text, no watermarks, no UI elements.`;
                try {
                  const locModelConfig = getImageModelConfig();
                  const { taskId } = await generateImage(locPrompt, undefined, undefined, userKeys.evolink);
                  storage.addProjectCost(project.id, "imageGenerationCost", locModelConfig.costPerImage).catch(() => {});
                  await storage.createLocationReference({
                    projectId: project.id,
                    locationName: loc.name,
                    description: loc.visualDetails || loc.description || "",
                    prompt: locPrompt,
                    status: "generating",
                    taskId,
                    imageUrl: null,
                  });
                } catch (locErr: any) {
                  console.error(`[auto-locations] Failed to generate ref for ${loc.name}:`, locErr.message);
                }
              }
              console.log(`[auto-locations] Location reference generation initiated for project ${project.id}`);
            }
          } catch (autoLocErr: any) {
            console.error(`[auto-locations] Error during location ref generation:`, autoLocErr.message);
          }
        } catch (err: any) {
          console.error("Analysis error:", err);
          await setProgressDb(project.id, "error", err.message || "Analysis failed unexpectedly.", 0, 6);
          try {
            await storage.updateProject(project.id, { status: "draft" });
          } catch {}
        } finally {
          analysisRunning.delete(project.id);
        }
      })().catch(err => {
        console.error("[analyze] Unhandled background error:", err);
        analysisRunning.delete(project.id);
        storage.updateProject(project.id, { status: "draft" }).catch(() => {});
        setProgressDb(project.id, "error", err.message || "Analysis failed unexpectedly.", 0, 6).catch(() => {});
      });

    } catch (err: any) {
      console.error("Analysis startup error:", err);
      analysisRunning.delete(req.params.id);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/scenes/:sceneId/generate", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) return res.status(404).json({ error: "Scene not found" });

      const analysis = project.analysis as ScriptAnalysis;
      if (!analysis) return res.status(400).json({ error: "Project must be analyzed first" });

      const imgModel = (req.body?.imageModel as ImageModelId) || undefined;

      await storage.deleteImagesByScene(scene.id);

      let prompts: string[] = [];
      let motionPrompts: string[] = [];
      if (scene.promptBase) {
        try {
          prompts = JSON.parse(scene.promptBase);
        } catch {
          prompts = [];
        }
      }

      if (prompts.length < 3) {
        const scenes = await storage.getScenesByProject(project.id);
        scenes.sort((a, b) => a.sentenceIndex - b.sentenceIndex);
        const sceneIndex = scenes.findIndex((s) => s.id === scene.id);

        const storyBible = await getStoryBible(project.id);
        const cachedVisualScenes = visualScenesCache.get(project.id);

        if (storyBible && cachedVisualScenes && cachedVisualScenes[sceneIndex]) {
          const vs = cachedVisualScenes[sceneIndex];
          const prevVs = sceneIndex > 0 ? cachedVisualScenes[sceneIndex - 1] : null;
          const nextVs = sceneIndex < cachedVisualScenes.length - 1 ? cachedVisualScenes[sceneIndex + 1] : null;

          const seqResult = await generateSequencePrompts(
            vs, sceneIndex, cachedVisualScenes.length, storyBible, prevVs, nextVs, cachedVisualScenes,
          userKeys.anthropic,
        );
          prompts = seqResult.prompts;
          motionPrompts = seqResult.motionPrompts;
          await storage.updateScene(scene.id, {
            promptBase: JSON.stringify(prompts),
            shotLabels: JSON.stringify(seqResult.shotLabels),
            expectedImages: prompts.length,
          });
        } else {
          const prevSentence = sceneIndex > 0 ? scenes[sceneIndex - 1].sentence : null;
          const nextSentence = sceneIndex < scenes.length - 1 ? scenes[sceneIndex + 1].sentence : null;

          const sceneContext = scene.context ? JSON.parse(scene.context as string) : {};
          const fallbackScene: VisualScene = {
            sentenceIndices: [sceneIndex],
            sentences: [scene.sentence],
            visualBeat: scene.sceneDescription || scene.sentence,
            isVisual: true,
            sceneDescription: scene.sceneDescription || scene.sentence,
            dramaticPurpose: "NARRATIVE",
            emotionalState: scene.mood || "Continuing",
            mood: scene.mood || "Intense",
            timeOfDay: scene.timeOfDay || "Day",
            location: scene.location || "Unspecified",
            charactersPresent: (scene.characters as string[]) || [],
            aircraftPresent: (scene.objects as string[]) || [],
            vehiclesPresent: sceneContext.vehiclesPresent || [],
            keyObjectsPresent: sceneContext.keyObjectsPresent || [],
            lightingNote: analysis.visualStyle.lighting,
            weatherConditions: sceneContext.weatherConditions || "",
            environmentalContinuity: "",
            characterStates: {},
            objectStates: {},
          };

          const fallbackBible: StoryBible = {
            analysis: analysis as any,
            narrativeArc: { opening: "", rising: "", climax: "", resolution: "" },
            moodTimeline: [],
          };

          const prevVs = prevSentence ? {
            ...fallbackScene,
            sentences: [prevSentence],
            visualBeat: prevSentence,
          } : null;
          const nextVs = nextSentence ? {
            ...fallbackScene,
            sentences: [nextSentence],
            visualBeat: nextSentence,
          } : null;

          const seqResult = await generateSequencePrompts(
            fallbackScene, sceneIndex, scenes.length, fallbackBible, prevVs, nextVs, [fallbackScene],
          userKeys.anthropic,
        );
          prompts = seqResult.prompts;
          motionPrompts = seqResult.motionPrompts;
          await storage.updateScene(scene.id, {
            promptBase: JSON.stringify(prompts),
            shotLabels: JSON.stringify(seqResult.shotLabels),
            expectedImages: prompts.length,
          });
        }
      }

      const charRefUrls = await getCharacterReferenceUrlsForScene(project.id, scene);
      if (charRefUrls.length > 0) {
        console.log(`[scene-gen] Using ${charRefUrls.length} character reference(s) for scene ${scene.id}`);
      }

      const imageRecords = [];
      let lastGenerationError = "";
      const totalVariants = prompts.length;
      for (let variant = 1; variant <= totalVariants; variant++) {
        const prompt = prompts[variant - 1];
        const briefCtx = prompt ? prompt.substring(0, 120).replace(/[.,;:]$/, "") : "";
        const videoPromptText = motionPrompts[variant - 1] || (briefCtx
          ? `Scene depicting: ${briefCtx}... — Gentle cinematic camera motion with subtle atmospheric movement suited to this moment.`
          : "Cinematic slow camera motion with subtle parallax depth, smooth atmospheric movement");

        try {
          const sceneGenModelConfig = getImageModelConfig(imgModel);
          const { taskId, finalPrompt } = await generateImageWithAutoRetry(prompt, charRefUrls.length > 0 ? charRefUrls : undefined, imgModel, userKeys.evolink, userKeys.anthropic);
          storage.addProjectCost(project.id, "imageGenerationCost", sceneGenModelConfig.costPerImage).catch(() => {});
          const img = await storage.createImage({
            sceneId: scene.id,
            projectId: project.id,
            variant,
            prompt: finalPrompt,
            status: "generating",
            taskId,
            imageUrl: null,
            videoPrompt: videoPromptText,
          });
          imageRecords.push(img);
        } catch (genErr: any) {
          console.error(`Failed to generate variant ${variant}:`, genErr.message);
          lastGenerationError = genErr.message;
          const img = await storage.createImage({
            sceneId: scene.id,
            projectId: project.id,
            variant,
            prompt,
            status: "failed",
            taskId: null,
            imageUrl: null,
            videoPrompt: videoPromptText,
          });
          imageRecords.push(img);
        }
      }

      const hasGenerating = imageRecords.some((img) => img.status === "generating");
      if (hasGenerating) {
        await storage.updateProject(project.id, { status: "generating" });
      }

      const allFailed = imageRecords.every((img) => img.status === "failed");
      const failError = allFailed ? (lastGenerationError || "All image generations failed.") : undefined;
      res.json({ images: imageRecords, allFailed, error: failError });
    } catch (err: any) {
      console.error("Generation error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/generate-all", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const analysis = project.analysis as ScriptAnalysis;
      if (!analysis) return res.status(400).json({ error: "Project must be analyzed first" });

      const imgModel = (req.body?.imageModel as ImageModelId) || undefined;
      const forceRegenerate = req.body?.forceRegenerate === true;

      if (generationProgressMap.has(project.id)) {
        const existing = generationProgressMap.get(project.id)!;
        if (existing.status === "submitting" || existing.status === "polling") {
          return res.json({ started: true, message: "Generation already in progress", progress: existing });
        }
        generationProgressMap.delete(project.id);
      }

      const lockProgress: GenerationProgress = {
        status: "submitting", totalImages: 0, submitted: 0, completed: 0,
        failed: 0, currentBatch: 0, totalBatches: 0,
        detail: "Preparing scenes...", startedAt: Date.now(),
      };
      generationProgressMap.set(project.id, lockProgress);

      const scenes = await storage.getScenesByProject(project.id);
      scenes.sort((a, b) => a.sentenceIndex - b.sentenceIndex);

      const allJobs: Array<{ scene: typeof scenes[0]; sceneIndex: number; prompts: string[]; motionPrompts: string[] }> = [];
      for (let si = 0; si < scenes.length; si++) {
        const scene = scenes[si];

        const existingImages = await storage.getImagesByScene(scene.id);
        if (!forceRegenerate) {
          const hasCompleted = existingImages.some((img) => img.status === "completed");
          if (hasCompleted) {
            continue;
          }
        }

        let prompts: string[] = [];
        let motionPrompts: string[] = [];
        if (scene.promptBase) {
          try {
            prompts = JSON.parse(scene.promptBase);
          } catch {
            prompts = [];
          }
          if (prompts.length > 0 && existingImages.length > 0) {
            const sorted = [...existingImages].sort((a, b) => a.variant - b.variant);
            motionPrompts = sorted.map(img => img.videoPrompt || "");
          }
        }

        if (prompts.length < 3) {
          const storyBible = await getStoryBible(project.id);
          const cachedVisualScenes = visualScenesCache.get(project.id);

          if (storyBible && cachedVisualScenes && cachedVisualScenes[si]) {
            const vs = cachedVisualScenes[si];
            const prevVs = si > 0 ? cachedVisualScenes[si - 1] : null;
            const nextVs = si < cachedVisualScenes.length - 1 ? cachedVisualScenes[si + 1] : null;

            try {
              const seqResult = await generateSequencePrompts(
                vs, si, cachedVisualScenes.length, storyBible, prevVs, nextVs, cachedVisualScenes,
                userKeys.anthropic,
              );
              prompts = seqResult.prompts;
              motionPrompts = seqResult.motionPrompts;
              await storage.updateScene(scene.id, {
                promptBase: JSON.stringify(prompts),
                shotLabels: JSON.stringify(seqResult.shotLabels),
                expectedImages: prompts.length,
              });
            } catch (seqErr: any) {
              console.error(`[generate-all] Failed to generate prompts for scene ${scene.id}:`, seqErr.message);
            }
          }
        }

        if (prompts.length < 3) {
          console.warn(`[generate-all] Scene ${scene.id} has only ${prompts.length} prompts (need >=3), skipping — may need re-analysis`);
          continue;
        }
        await storage.deleteImagesByScene(scene.id);
        allJobs.push({ scene, sceneIndex: si, prompts, motionPrompts });
      }

      const charRefs = await storage.getCharacterReferencesByProject(project.id);
      const completedCharRefs = charRefs.filter(r => r.status === "completed" && r.imageUrl);

      const sceneCharRefMap = new Map<string, string[]>();
      for (const job of allJobs) {
        let charactersPresent: string[] = [];
        if (job.scene.context) {
          try {
            const ctx = JSON.parse(job.scene.context as string);
            charactersPresent = ctx.charactersPresent || [];
          } catch {}
        }
        if (charactersPresent.length === 0 && Array.isArray(job.scene.characters)) {
          charactersPresent = job.scene.characters as string[];
        }
        const urls: string[] = [];
        for (const charName of charactersPresent) {
          const ref = completedCharRefs.find(r => r.characterName.toLowerCase() === charName.toLowerCase());
          if (ref && ref.imageUrl) urls.push(ref.imageUrl);
        }
        sceneCharRefMap.set(job.scene.id, urls);
      }

      if (completedCharRefs.length > 0) {
        const scenesWithRefs = Array.from(sceneCharRefMap.values()).filter(u => u.length > 0).length;
        console.log(`[generate-all] ${completedCharRefs.length} character references available, ${scenesWithRefs}/${allJobs.length} scenes will use them`);
      }

      const imageQueue: Array<{ sceneId: string; projectId: string; variant: number; prompt: string; videoPrompt: string; charRefUrls: string[] }> = [];
      for (const job of allJobs) {
        const refUrls = sceneCharRefMap.get(job.scene.id) || [];
        for (let variant = 1; variant <= job.prompts.length; variant++) {
          imageQueue.push({
            sceneId: job.scene.id,
            projectId: project.id,
            variant,
            prompt: job.prompts[variant - 1],
            videoPrompt: job.motionPrompts[variant - 1] || (() => {
              const bc = job.prompts[variant - 1]?.substring(0, 120).replace(/[.,;:]$/, "") || "";
              return bc
                ? `Scene depicting: ${bc}... — Gentle cinematic camera motion with subtle atmospheric movement suited to this moment.`
                : "Cinematic slow camera motion with subtle parallax depth, smooth atmospheric movement";
            })(),
            charRefUrls: refUrls,
          });
        }
      }

      if (imageQueue.length === 0) {
        generationProgressMap.delete(project.id);
        return res.json({ started: false, message: "No images to generate. All scenes already have completed images." });
      }

      const CONCURRENT_SLOTS = 25;
      const SUBMIT_GAP_MS = 1200;
      const POLL_INTERVAL_MS = 6000;
      const PER_IMAGE_TIMEOUT_MS = 5 * 60 * 1000;
      const totalBatches = Math.ceil(imageQueue.length / CONCURRENT_SLOTS);

      const progress: GenerationProgress = {
        status: "submitting",
        totalImages: imageQueue.length,
        submitted: 0,
        completed: 0,
        failed: 0,
        currentBatch: 0,
        totalBatches,
        detail: `Starting generation of ${imageQueue.length} images (${CONCURRENT_SLOTS} at a time)...`,
        startedAt: Date.now(),
      };
      generationProgressMap.set(project.id, progress);
      await storage.updateProject(project.id, { status: "generating" });

      res.json({ started: true, total: imageQueue.length, batches: totalBatches, progress });

      (async () => {
        let consecutiveFailCount = 0;
        const MAX_CONSECUTIVE_FAILS = 8;
        let shouldStop = false;
        let stopReason = "";
        let isCriticalError = false;

        console.log(`[generate-all] Processing ${imageQueue.length} images, ${CONCURRENT_SLOTS} at a time, ${SUBMIT_GAP_MS}ms between submissions`);

        for (let batchStart = 0; batchStart < imageQueue.length; batchStart += CONCURRENT_SLOTS) {
          if (shouldStop) break;

          const batch = imageQueue.slice(batchStart, batchStart + CONCURRENT_SLOTS);
          const batchNum = Math.floor(batchStart / CONCURRENT_SLOTS) + 1;
          progress.currentBatch = batchNum;
          progress.status = "submitting";
          progress.detail = `Batch ${batchNum}/${totalBatches}: Submitting ${batch.length} images...`;

          const batchImageIds: string[] = [];

          for (let i = 0; i < batch.length; i++) {
            if (shouldStop || isCriticalError) {
              const item = batch[i];
              await storage.createImage({
                sceneId: item.sceneId, projectId: item.projectId, variant: item.variant,
                prompt: item.prompt, status: "pending", taskId: null, imageUrl: null, videoPrompt: item.videoPrompt,
              });
              continue;
            }

            if (i > 0) {
              await new Promise(r => setTimeout(r, SUBMIT_GAP_MS));
            }

            const item = batch[i];
            try {
              const modelConfig = getImageModelConfig(imgModel);
              const { taskId, finalPrompt } = await generateImageWithAutoRetry(item.prompt, item.charRefUrls.length > 0 ? item.charRefUrls : undefined, imgModel, userKeys.evolink, userKeys.anthropic);
              const img = await storage.createImage({
                sceneId: item.sceneId, projectId: item.projectId, variant: item.variant,
                prompt: finalPrompt, status: "generating", taskId, imageUrl: null, videoPrompt: item.videoPrompt,
              });
              batchImageIds.push(img.id);
              progress.submitted++;
              consecutiveFailCount = 0;
              storage.addProjectCost(item.projectId, "imageGenerationCost", modelConfig.costPerImage).catch(() => {});
              // #region agent log
              fetch('http://127.0.0.1:7650/ingest/052faa48-3566-4ba0-8498-06374a0a8865',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c358ba'},body:JSON.stringify({sessionId:'c358ba',hypothesisId:'C',location:'routes.ts:generate-all:2057',message:'Cost added on image SUBMIT (not completion)',data:{projectId:item.projectId,imageId:img.id,taskId,model:imgModel,hardcodedCost:modelConfig.costPerImage,status:'submitted-not-yet-completed'},timestamp:Date.now()})}).catch(()=>{});
              // #endregion
            } catch (genErr: any) {
              const errMsg = genErr.message || "";
              console.error(`[generate-all] Submit failed:`, errMsg);

              const isQuotaError = errMsg.toLowerCase().includes("insufficient") || errMsg.toLowerCase().includes("quota");
              const isAuthError = errMsg.toLowerCase().includes("api key") && (errMsg.toLowerCase().includes("invalid") || errMsg.toLowerCase().includes("expired"));

              if (isQuotaError || isAuthError) {
                isCriticalError = true;
                shouldStop = true;
                stopReason = isQuotaError
                  ? "Insufficient credits on your EvoLink account. Please top up at evolink.ai."
                  : "API key is invalid or expired. Please check your EvoLink API key.";
                console.log(`[generate-all] CRITICAL ERROR - stopping: ${stopReason}`);
              }

              await storage.createImage({
                sceneId: item.sceneId, projectId: item.projectId, variant: item.variant,
                prompt: item.prompt, status: isCriticalError ? "pending" : "failed",
                taskId: null, imageUrl: null, videoPrompt: item.videoPrompt,
              });
              if (!isCriticalError) {
                progress.failed++;
                consecutiveFailCount++;
                if (consecutiveFailCount >= MAX_CONSECUTIVE_FAILS) {
                  shouldStop = true;
                  stopReason = "Too many consecutive submission failures.";
                }
              }
            }
          }

          // Save remaining as pending if stopping
          if (shouldStop) {
            for (let remaining = batchStart + CONCURRENT_SLOTS; remaining < imageQueue.length; remaining++) {
              const item = imageQueue[remaining];
              await storage.createImage({
                sceneId: item.sceneId, projectId: item.projectId, variant: item.variant,
                prompt: item.prompt, status: "pending", taskId: null, imageUrl: null, videoPrompt: item.videoPrompt,
              });
            }
            break;
          }

          // WAIT FOR THIS BATCH TO COMPLETE before submitting next
          if (batchImageIds.length > 0) {
            progress.status = "polling";
            progress.detail = `Batch ${batchNum}/${totalBatches}: Waiting for ${batchImageIds.length} images to render...`;
            console.log(`[generate-all] Batch ${batchNum}: waiting for ${batchImageIds.length} images to complete...`);

            const batchPollStart = Date.now();
            const pollFailureCounts = new Map<string, number>();
            const MAX_POLL_FAILURES = 5;

            while (Date.now() - batchPollStart < PER_IMAGE_TIMEOUT_MS) {
              const allImages = await storage.getImagesByProject(project.id);
              const totalCompleted = allImages.filter(img => img.status === "completed").length;
              const totalFailed = allImages.filter(img => img.status === "failed").length;
              progress.completed = totalCompleted;
              progress.failed = totalFailed;

              const stillGenerating = allImages.filter(img => batchImageIds.includes(img.id) && img.status === "generating" && img.taskId);

              if (stillGenerating.length === 0) {
                const batchCompleted = allImages.filter(img => batchImageIds.includes(img.id) && img.status === "completed").length;
                const batchFailed = allImages.filter(img => batchImageIds.includes(img.id) && img.status === "failed").length;
                console.log(`[generate-all] Batch ${batchNum} done: ${batchCompleted} completed, ${batchFailed} failed`);
                break;
              }

              progress.detail = `Batch ${batchNum}/${totalBatches}: ${totalCompleted} done, ${stillGenerating.length} rendering...`;

              await Promise.all(
                stillGenerating.map(async (img) => {
                  try {
                    const result = await checkImageStatus(img.taskId!, userKeys.evolink);
                    if (result.status === "completed" && result.imageUrl) {
                      await storage.updateImage(img.id, { status: "completed", imageUrl: result.imageUrl });
                      pollFailureCounts.delete(img.id);
                      runVisionCheckAsync(img.id, result.imageUrl, img.prompt, project.id, img.sceneId, userKeys.anthropic);
                    } else if (result.status === "failed") {
                      const failError = (result.error || "").toLowerCase();
                      const isContentPolicy = failError.includes("content_policy") || failError.includes("safety") || failError.includes("blocked") || failError.includes("policy violation");

                      if (isContentPolicy && img.prompt) {
                        console.log(`[generate-all] Image ${img.id} failed content policy during rendering, auto-retrying with safe prompt...`);
                        try {
                          const retryCharRefUrls = sceneCharRefMap.get(img.sceneId) || [];
                          const { taskId: newTaskId, finalPrompt } = await generateImageWithAutoRetry(
                            img.prompt, retryCharRefUrls.length > 0 ? retryCharRefUrls : undefined, imgModel, userKeys.evolink, userKeys.anthropic,
                          );
                          await storage.updateImage(img.id, { status: "generating", taskId: newTaskId, prompt: finalPrompt, error: null } as any);
                          console.log(`[generate-all] Image ${img.id} resubmitted with safe prompt, new task: ${newTaskId}`);
                        } catch (retryErr: any) {
                          console.error(`[generate-all] Auto-retry for ${img.id} also failed: ${retryErr.message}`);
                          await storage.updateImage(img.id, { status: "failed", error: result.error || "Image generation failed (content policy — auto-retry exhausted)" });
                        }
                      } else {
                        await storage.updateImage(img.id, { status: "failed", error: result.error || "Image generation failed" });
                      }
                      pollFailureCounts.delete(img.id);
                      // #region agent log
                      fetch('http://127.0.0.1:7650/ingest/052faa48-3566-4ba0-8498-06374a0a8865',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c358ba'},body:JSON.stringify({sessionId:'c358ba',hypothesisId:'C',location:'routes.ts:generate-all-poll-failed',message:'Image FAILED after cost was already tracked on submit',data:{imageId:img.id,taskId:img.taskId,error:result.error,costAlreadyCharged:true},timestamp:Date.now()})}).catch(()=>{});
                      // #endregion
                    }
                  } catch (pollErr: any) {
                    const failures = (pollFailureCounts.get(img.id) || 0) + 1;
                    pollFailureCounts.set(img.id, failures);
                    console.warn(`[generate-all] Poll error #${failures} for ${img.id}: ${pollErr.message}`);
                    if (failures >= MAX_POLL_FAILURES) {
                      await storage.updateImage(img.id, { status: "failed", error: `Poll failed ${failures} times` });
                      pollFailureCounts.delete(img.id);
                    }
                  }
                })
              );

              await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
            }

            // Timeout: final check before failing
            if (Date.now() - batchPollStart >= PER_IMAGE_TIMEOUT_MS) {
              const allImages = await storage.getImagesByProject(project.id);
              const stuckImages = allImages.filter(img => batchImageIds.includes(img.id) && img.status === "generating");
              for (const img of stuckImages) {
                try {
                  const finalCheck = await checkImageStatus(img.taskId!, userKeys.evolink);
                  if (finalCheck.status === "completed" && finalCheck.imageUrl) {
                    await storage.updateImage(img.id, { status: "completed", imageUrl: finalCheck.imageUrl });
                  } else {
                    await storage.updateImage(img.id, { status: "failed", error: finalCheck.error || "Timed out after 5 minutes" });
                  }
                } catch {
                  await storage.updateImage(img.id, { status: "failed", error: "Timed out after 5 minutes" });
                }
              }
            }
          }

          // Brief pause between batches per EvoLink recommendation
          if (batchStart + CONCURRENT_SLOTS < imageQueue.length && !shouldStop) {
            await new Promise(r => setTimeout(r, 2000));
          }
        }

        if (isCriticalError) {
          progress.status = "error";
          progress.detail = `${stopReason} ${progress.submitted} images were submitted before the error.`;
          console.log(`[generate-all] Critical error stopped generation: ${stopReason}`);
          if (progress.submitted === 0) {
            await storage.updateProject(project.id, { status: "analyzed" });
            setTimeout(() => generationProgressMap.delete(project.id), 30000);
            return;
          }
        }

        const allImages = await storage.getImagesByProject(project.id);
        const finalCompleted = allImages.filter(img => img.status === "completed").length;
        const finalFailed = allImages.filter(img => img.status === "failed").length;
        progress.completed = finalCompleted;
        progress.failed = finalFailed;
        progress.status = "complete";
        progress.detail = `Generation complete! ${finalCompleted} images ready, ${finalFailed} failed.`;
        const finalStatus = finalCompleted > 0 ? "completed" : "analyzed";
        await storage.updateProject(project.id, { status: finalStatus });
        console.log(`[generate-all] Complete: ${finalCompleted} completed, ${finalFailed} failed`);

        setTimeout(() => generationProgressMap.delete(project.id), 60000);
      })().catch(err => {
        console.error("[generate-all] Background error:", err);
        const p = generationProgressMap.get(project.id);
        if (p) {
          p.status = "error";
          p.detail = `Error: ${err.message}`;
        }
        storage.updateProject(project.id, { status: "analyzed" }).catch(() => {});
        setTimeout(() => generationProgressMap.delete(project.id), 60000);
      });

    } catch (err: any) {
      console.error("Generate all error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/projects/:id/generation-progress", async (req, res) => {
    try {
      const progress = generationProgressMap.get(req.params.id);
      if (!progress) {
        const images = await storage.getImagesByProject(req.params.id);
        if (images.length === 0) {
          return res.json(null);
        }
        const completed = images.filter(img => img.status === "completed").length;
        const failed = images.filter(img => img.status === "failed").length;
        const generating = images.filter(img => img.status === "generating").length;
        const pending = images.filter(img => img.status === "pending").length;
        const inProgress = generating + pending;
        if (inProgress > 0) {
          return res.json({
            status: "polling",
            totalImages: images.length,
            submitted: images.length,
            completed,
            failed,
            currentBatch: 0,
            totalBatches: 0,
            detail: `${completed} completed, ${inProgress} still rendering, ${failed} failed.`,
            startedAt: 0,
          });
        }
        return res.json(null);
      }
      res.json(progress);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/images/:imageId/check", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const img = await storage.getImageById(req.params.imageId);
      if (!img) return res.status(404).json({ error: "Image not found" });
      if (!img.taskId) return res.json(img);
      if (img.status === "completed" || img.status === "failed") return res.json(img);

      const result = await checkImageStatus(img.taskId, userKeys.evolink);
      if (result.status === "completed" && result.imageUrl) {
        const updated = await storage.updateImage(img.id, {
          status: "completed",
          imageUrl: result.imageUrl,
        });
        runVisionCheckAsync(img.id, result.imageUrl, img.prompt, img.projectId, img.sceneId, userKeys.anthropic);
        return res.json(updated);
      } else if (result.status === "failed") {
        const failError = (result.error || "").toLowerCase();
        const isContentPolicy = failError.includes("content_policy") || failError.includes("safety") || failError.includes("blocked") || failError.includes("policy violation");

        if (isContentPolicy && img.prompt) {
          console.log(`[image-check] Image ${img.id} failed content policy, auto-retrying with safe prompt...`);
          try {
            const checkScene = img.sceneId ? await storage.getScene(img.sceneId) : null;
            const checkCharRefUrls = checkScene && img.projectId ? await getCharacterReferenceUrlsForScene(img.projectId, checkScene) : [];
            const { taskId: newTaskId, finalPrompt } = await generateImageWithAutoRetry(
              img.prompt, checkCharRefUrls.length > 0 ? checkCharRefUrls : undefined, undefined, userKeys.evolink, userKeys.anthropic,
            );
            const updated = await storage.updateImage(img.id, { status: "generating", taskId: newTaskId, prompt: finalPrompt, error: null } as any);
            return res.json(updated);
          } catch (retryErr: any) {
            console.error(`[image-check] Auto-retry for ${img.id} failed: ${retryErr.message}`);
          }
        }

        const updated = await storage.updateImage(img.id, { status: "failed", error: result.error || "Image generation failed" });
        return res.json(updated);
      }

      res.json({ ...img, progress: result.progress });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/images/:imageId/regenerate", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const img = await storage.getImageById(req.params.imageId);
      if (!img) return res.status(404).json({ error: "Image not found" });
      if (img.projectId !== req.params.id) return res.status(400).json({ error: "Image does not belong to this project" });

      const { feedback, imageModel } = req.body || {};
      const imgModel = (imageModel as ImageModelId) || undefined;
      const scene = await storage.getScene(img.sceneId);
      const storyBible = await getStoryBible(req.params.id);

      let shotLabel = "Cinematic Shot";
      let sceneDescription = "";
      let mood = "Cinematic";
      if (scene) {
        try {
          const shotLabels = scene.shotLabels ? JSON.parse(scene.shotLabels) : [];
          shotLabel = shotLabels[img.variant - 1] || shotLabel;
        } catch {}
        sceneDescription = scene.sceneDescription || "";
        mood = scene.mood || mood;
      }

      await storage.updateImage(img.id, {
        status: "generating",
        imageUrl: null,
      });

      res.json({ status: "regenerating", message: feedback ? "AI is applying your feedback..." : "AI is analyzing and improving the prompt..." });

      (async () => {
        let improvedPrompt: string | null = null;
        try {
          if (feedback && feedback.trim()) {
            console.log(`Feedback regeneration: Applying feedback for image ${img.id}: "${feedback}"`);
            improvedPrompt = await applyFeedbackToPrompt(img.prompt, feedback, false, {
              sceneDescription,
              mood,
              shotLabel,
              storyBible,
            }, userKeys.anthropic);
            console.log(`Feedback regeneration: Modified prompt generated (${improvedPrompt.length} chars). Generating image...`);
          } else {
            console.log(`Smart regeneration: Analyzing prompt for image ${img.id}...`);
            improvedPrompt = await analyzeAndImprovePrompt(
              img.prompt,
              sceneDescription,
              shotLabel,
              mood,
              storyBible,
              userKeys.anthropic,
            );
            console.log(`Smart regeneration: Improved prompt generated (${improvedPrompt.length} chars). Generating image...`);
          }

          const charRefUrls = scene ? await getCharacterReferenceUrlsForScene(req.params.id, scene) : [];
          const regenModelConfig = getImageModelConfig(imgModel);
          const { taskId, finalPrompt } = await generateImageWithAutoRetry(improvedPrompt, charRefUrls.length > 0 ? charRefUrls : undefined, imgModel, userKeys.evolink, userKeys.anthropic);
          // #region agent log
          fetch('http://127.0.0.1:7650/ingest/052faa48-3566-4ba0-8498-06374a0a8865',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c358ba'},body:JSON.stringify({sessionId:'c358ba',hypothesisId:'D',location:'routes.ts:regenerate:primary',message:'Regeneration PRIMARY generateImage succeeded',data:{imageId:img.id,taskId,model:imgModel,cost:regenModelConfig.costPerImage},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          await storage.updateImage(img.id, {
            status: "generating",
            taskId,
            prompt: finalPrompt,
          });
          storage.addProjectCost(req.params.id, "imageGenerationCost", regenModelConfig.costPerImage).catch(() => {});
        } catch (err: any) {
          console.error(`Regeneration failed for image ${img.id}:`, err.message);
          // #region agent log
          fetch('http://127.0.0.1:7650/ingest/052faa48-3566-4ba0-8498-06374a0a8865',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c358ba'},body:JSON.stringify({sessionId:'c358ba',hypothesisId:'D',location:'routes.ts:regenerate:fallback',message:'Regeneration FALLBACK triggered',data:{imageId:img.id,errorMessage:err.message,willCallGenerateImageAgain:true},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          try {
            const fallbackPrompt = improvedPrompt || img.prompt;
            console.log(`Falling back with ${improvedPrompt ? "feedback-modified" : "original"} prompt for image ${img.id}`);
            const fallbackModelConfig = getImageModelConfig(imgModel);
            const fallbackCharRefUrls = scene ? await getCharacterReferenceUrlsForScene(req.params.id, scene) : [];
            const { taskId, finalPrompt } = await generateImageWithAutoRetry(fallbackPrompt, fallbackCharRefUrls.length > 0 ? fallbackCharRefUrls : undefined, imgModel, userKeys.evolink, userKeys.anthropic);
            await storage.updateImage(img.id, {
              status: "generating",
              taskId,
              prompt: finalPrompt,
            });
            storage.addProjectCost(req.params.id, "imageGenerationCost", fallbackModelConfig.costPerImage).catch(() => {});
          } catch (fallbackErr: any) {
            console.error(`Fallback regeneration also failed for image ${img.id}:`, fallbackErr.message);
            await storage.updateImage(img.id, {
              status: "failed",
            });
          }
        }
      })().catch(err => {
        console.error(`[regenerate] Unhandled error for image ${img.id}:`, err);
        storage.updateImage(img.id, { status: "failed" }).catch(() => {});
      });
    } catch (err: any) {
      console.error("Regeneration error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/scenes/:sceneId/regenerate-prompts", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) return res.status(404).json({ error: "Scene not found" });

      const storyBible = await getStoryBible(project.id);
      if (!storyBible) return res.status(400).json({ error: "Story bible not found — run full analysis first" });

      const allScenes = await storage.getScenesByProject(project.id);
      const sceneIndex = allScenes.findIndex(s => s.id === scene.id);
      if (sceneIndex === -1) return res.status(400).json({ error: "Scene not found in project scenes" });

      let visualScene: VisualScene;
      try {
        const ctx = scene.context ? JSON.parse(scene.context) : {};
        visualScene = {
          sentenceIndices: ctx.sentenceIndices || [sceneIndex],
          sentences: scene.sentence ? [scene.sentence] : [],
          visualBeat: ctx.visualBeat || scene.sceneDescription || "",
          isVisual: true,
          sceneDescription: scene.sceneDescription || "",
          mood: scene.mood || "Cinematic",
          timeOfDay: scene.timeOfDay || "Day",
          location: scene.location || "",
          charactersPresent: ctx.charactersPresent || [],
          aircraftPresent: ctx.aircraftPresent || [],
          vehiclesPresent: ctx.vehiclesPresent || [],
          keyObjectsPresent: ctx.keyObjectsPresent || [],
          lightingNote: ctx.lightingNote || "",
          weatherConditions: ctx.weatherConditions || "",
          dramaticPurpose: ctx.dramaticPurpose || "",
          emotionalState: ctx.emotionalState || "",
          environmentalContinuity: ctx.environmentalContinuity || "",
          characterStates: ctx.characterStates || {},
          objectStates: ctx.objectStates || {},
        };
      } catch {
        return res.status(400).json({ error: "Could not parse scene context" });
      }

      const allVisualScenes = allScenes.map(s => {
        try {
          const c = s.context ? JSON.parse(s.context) : {};
          return {
            sentenceIndices: c.sentenceIndices || [],
            sentences: s.sentence ? [s.sentence] : [],
            visualBeat: c.visualBeat || s.sceneDescription || "",
            isVisual: true,
            sceneDescription: s.sceneDescription || "",
            mood: s.mood || "Cinematic",
            timeOfDay: s.timeOfDay || "Day",
            location: s.location || "",
            charactersPresent: c.charactersPresent || [],
            aircraftPresent: c.aircraftPresent || [],
            vehiclesPresent: c.vehiclesPresent || [],
            keyObjectsPresent: c.keyObjectsPresent || [],
            lightingNote: c.lightingNote || "",
            weatherConditions: c.weatherConditions || "",
            dramaticPurpose: c.dramaticPurpose || "",
            emotionalState: c.emotionalState || "",
            environmentalContinuity: c.environmentalContinuity || "",
            characterStates: c.characterStates || {},
            objectStates: c.objectStates || {},
          } as VisualScene;
        } catch { return null; }
      }).filter(Boolean) as VisualScene[];

      const prevVs = sceneIndex > 0 ? allVisualScenes[sceneIndex - 1] : null;
      const nextVs = sceneIndex < allVisualScenes.length - 1 ? allVisualScenes[sceneIndex + 1] : null;

      res.json({ status: "regenerating", message: "Regenerating prompts for this scene..." });

      (async () => {
        try {
          const params = buildSequencePromptParams(visualScene, sceneIndex, allVisualScenes.length, storyBible, prevVs || null, nextVs || null, allVisualScenes);

          const { streamSingleRequest } = await import("./ai-streaming");
          const text = await streamSingleRequest(params, userKeys.anthropic);
          const seqResult = parseSequencePromptResult(text, visualScene, sceneIndex);

          await storage.updateScene(scene.id, {
            sceneDescription: seqResult.sceneDescription,
            promptBase: JSON.stringify(seqResult.prompts),
            shotLabels: JSON.stringify(seqResult.shotLabels),
            expectedImages: seqResult.prompts.length,
            mood: seqResult.mood,
            timeOfDay: seqResult.timeOfDay,
            cameraAngle: seqResult.cameraAngle,
          });

          await storage.deleteImagesByScene(scene.id);

          const imgModel = (req.body?.imageModel as ImageModelId) || undefined;
          const charRefUrls = await getCharacterReferenceUrlsForScene(project.id, scene);

          for (let v = 0; v < seqResult.prompts.length; v++) {
            try {
              const modelConfig = getImageModelConfig(imgModel);
              const { taskId, finalPrompt } = await generateImageWithAutoRetry(
                seqResult.prompts[v],
                charRefUrls.length > 0 ? charRefUrls : undefined,
                imgModel, userKeys.evolink, userKeys.anthropic,
              );
              await storage.createImage({
                sceneId: scene.id, projectId: project.id, variant: v + 1,
                prompt: finalPrompt, status: "generating", taskId, imageUrl: null,
                videoPrompt: seqResult.motionPrompts[v] || null,
              });
              storage.addProjectCost(project.id, "imageGenerationCost", modelConfig.costPerImage).catch(() => {});
            } catch (genErr: any) {
              console.error(`[regenerate-prompts] Image gen failed for variant ${v + 1}:`, genErr.message);
              await storage.createImage({
                sceneId: scene.id, projectId: project.id, variant: v + 1,
                prompt: seqResult.prompts[v], status: "failed", taskId: null, imageUrl: null,
                videoPrompt: seqResult.motionPrompts[v] || null,
              });
            }
          }
          console.log(`[regenerate-prompts] Scene ${scene.id}: ${seqResult.prompts.length} new prompts generated and images submitted`);
        } catch (err: any) {
          console.error(`[regenerate-prompts] Failed for scene ${scene.id}:`, err.message);
        }
      })();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/scenes/:sceneId/regenerate-with-feedback", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) return res.status(404).json({ error: "Scene not found" });

      const { feedback, imageModel } = req.body || {};
      if (!feedback || !feedback.trim()) return res.status(400).json({ error: "Feedback is required" });

      const imgModel = (imageModel as ImageModelId) || undefined;
      const sceneImages = (await storage.getImagesByProject(project.id)).filter(img => img.sceneId === scene.id);

      if (sceneImages.length === 0) return res.status(400).json({ error: "No images in this scene to regenerate" });

      for (const img of sceneImages) {
        await storage.updateImage(img.id, { status: "generating", imageUrl: null });
      }

      res.json({ status: "regenerating", total: sceneImages.length, message: "AI is applying your feedback to all images in this scene..." });

      const storyBible = await getStoryBible(project.id);

      (async () => {
        for (const img of sceneImages) {
          let scnImprovedPrompt: string | null = null;
          try {
            scnImprovedPrompt = await applyFeedbackToPrompt(img.prompt, feedback, false, {
              sceneDescription: scene.sceneDescription || "",
              mood: scene.mood || "cinematic",
              shotLabel: (() => { try { const labels = scene.shotLabels ? JSON.parse(scene.shotLabels) : []; return labels[img.variant - 1] || "Cinematic Shot"; } catch { return "Cinematic Shot"; } })(),
              storyBible,
            }, userKeys.anthropic);
            console.log(`Scene feedback regen: Improved prompt for image ${img.id} (${scnImprovedPrompt.length} chars)`);

            const charRefUrls = scene ? await getCharacterReferenceUrlsForScene(project.id, scene) : [];
            const scnModelConfig = getImageModelConfig(imgModel);
            const { taskId, finalPrompt } = await generateImageWithAutoRetry(scnImprovedPrompt, charRefUrls.length > 0 ? charRefUrls : undefined, imgModel, userKeys.evolink, userKeys.anthropic);
            await storage.updateImage(img.id, {
              status: "generating",
              taskId,
              prompt: finalPrompt,
            });
            storage.addProjectCost(project.id, "imageGenerationCost", scnModelConfig.costPerImage).catch(() => {});
          } catch (err: any) {
            console.error(`Scene feedback regen failed for image ${img.id}:`, err.message);
            try {
              const fallbackScnPrompt = scnImprovedPrompt || img.prompt;
              console.log(`Scene feedback fallback with ${scnImprovedPrompt ? "feedback-modified" : "original"} prompt for image ${img.id}`);
              const fallbackScnConfig = getImageModelConfig(imgModel);
              const fallbackScnCharRefUrls = scene ? await getCharacterReferenceUrlsForScene(project.id, scene) : [];
              const { taskId, finalPrompt } = await generateImageWithAutoRetry(fallbackScnPrompt, fallbackScnCharRefUrls.length > 0 ? fallbackScnCharRefUrls : undefined, imgModel, userKeys.evolink, userKeys.anthropic);
              await storage.updateImage(img.id, { status: "generating", taskId, prompt: finalPrompt });
              storage.addProjectCost(project.id, "imageGenerationCost", fallbackScnConfig.costPerImage).catch(() => {});
            } catch (fallbackErr: any) {
              console.error(`Scene feedback regen fallback also failed for image ${img.id}:`, fallbackErr.message);
              await storage.updateImage(img.id, { status: "failed" });
            }
          }
        }
      })().catch(err => {
        console.error("[scene-feedback-regen] Unhandled error:", err);
      });
    } catch (err: any) {
      console.error("Scene feedback regeneration error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/scenes/:sceneId/scene-chat", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) return res.status(404).json({ error: "Scene not found" });
      if (scene.projectId !== project.id) return res.status(404).json({ error: "Scene not found in this project" });

      const { messages } = req.body || {};
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Messages array is required" });
      }

      const storyBible = await getStoryBible(project.id);
      const shotLabels: string[] = (() => { try { return scene.shotLabels ? JSON.parse(scene.shotLabels) : []; } catch { return []; } })();
      const sceneImages = (await storage.getImagesByProject(project.id)).filter(img => img.sceneId === scene.id);
      const imagePrompts = sceneImages.sort((a, b) => a.variant - b.variant).map(img => img.prompt);

      const reply = await sceneChatResponse(
        messages as SceneChatMessage[],
        scene.sceneDescription || "",
        scene.mood || "cinematic",
        shotLabels,
        imagePrompts,
        storyBible,
        userKeys.anthropic,
      );

      res.json({ reply });
    } catch (err: any) {
      console.error("Scene chat error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/scenes/:sceneId/apply-scene-chat", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) return res.status(404).json({ error: "Scene not found" });
      if (scene.projectId !== project.id) return res.status(404).json({ error: "Scene not found in this project" });

      const { messages, imageModel } = req.body || {};
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Chat messages are required" });
      }

      const imgModel = (imageModel as ImageModelId) || undefined;
      const sceneImages = (await storage.getImagesByProject(project.id)).filter(img => img.sceneId === scene.id);
      if (sceneImages.length === 0) return res.status(400).json({ error: "No images in this scene" });

      const userMessages = messages.filter((m: any) => m.role === "user").map((m: any) => m.content);
      const chatSummary = userMessages.join("\n\nAdditionally: ");

      for (const img of sceneImages) {
        await storage.updateImage(img.id, { status: "generating", imageUrl: null });
      }

      res.json({ status: "regenerating", total: sceneImages.length, message: "Applying your feedback to all images..." });

      const storyBible = await getStoryBible(project.id);
      const shotLabels: string[] = (() => { try { return scene.shotLabels ? JSON.parse(scene.shotLabels) : []; } catch { return []; } })();

      (async () => {
        for (const img of sceneImages) {
          let chatImprovedPrompt: string | null = null;
          try {
            const shotLabel = shotLabels[img.variant - 1] || "Cinematic Shot";
            chatImprovedPrompt = await applySceneChatFeedback(
              img.prompt,
              chatSummary,
              shotLabel,
              scene.sceneDescription || "",
              scene.mood || "cinematic",
              storyBible,
              userKeys.anthropic,
            );
            console.log(`Scene chat apply: Improved prompt for image ${img.id} (${chatImprovedPrompt.length} chars)`);

            const charRefUrls = await getCharacterReferenceUrlsForScene(project.id, scene);
            const modelConfig = getImageModelConfig(imgModel);
            const { taskId, finalPrompt } = await generateImageWithAutoRetry(chatImprovedPrompt, charRefUrls.length > 0 ? charRefUrls : undefined, imgModel, userKeys.evolink, userKeys.anthropic);
            await storage.updateImage(img.id, {
              status: "generating",
              taskId,
              prompt: finalPrompt,
            });
            storage.addProjectCost(project.id, "imageGenerationCost", modelConfig.costPerImage).catch(() => {});
          } catch (err: any) {
            console.error(`Scene chat apply failed for image ${img.id}:`, err.message);
            try {
              const chatFallbackPrompt = chatImprovedPrompt || img.prompt;
              console.log(`Scene chat fallback with ${chatImprovedPrompt ? "chat-modified" : "original"} prompt for image ${img.id}`);
              const fallbackConfig = getImageModelConfig(imgModel);
              const fallbackChatCharRefUrls = await getCharacterReferenceUrlsForScene(project.id, scene);
              const { taskId, finalPrompt } = await generateImageWithAutoRetry(chatFallbackPrompt, fallbackChatCharRefUrls.length > 0 ? fallbackChatCharRefUrls : undefined, imgModel, userKeys.evolink, userKeys.anthropic);
              await storage.updateImage(img.id, { status: "generating", taskId, prompt: finalPrompt });
              storage.addProjectCost(project.id, "imageGenerationCost", fallbackConfig.costPerImage).catch(() => {});
            } catch (fallbackErr: any) {
              console.error(`Scene chat apply fallback failed for image ${img.id}:`, fallbackErr.message);
              await storage.updateImage(img.id, { status: "failed" });
            }
          }
        }
      })().catch(err => {
        console.error("[scene-chat-apply] Unhandled error:", err);
      });
    } catch (err: any) {
      console.error("Scene chat apply error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/projects/:id/images/:imageId", async (req, res) => {
    try {
      const img = await storage.getImageById(req.params.imageId);
      if (!img) return res.status(404).json({ error: "Image not found" });
      if (img.projectId !== req.params.id) return res.status(404).json({ error: "Image not found in this project" });

      await storage.deleteImage(img.id);
      res.json({ status: "deleted", imageId: img.id });
    } catch (err: any) {
      console.error("Delete image error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/images/:imageId/remove-video", async (req, res) => {
    try {
      const img = await storage.getImageById(req.params.imageId);
      if (!img) return res.status(404).json({ error: "Image not found" });
      if (img.projectId !== req.params.id) return res.status(404).json({ error: "Image not found in this project" });

      await storage.updateImage(img.id, { videoUrl: null, videoStatus: null, videoTaskId: null });
      res.json({ status: "video_removed", imageId: img.id });
    } catch (err: any) {
      console.error("Remove video error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/images/:imageId/regenerate-with-consistency", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const img = await storage.getImageById(req.params.imageId);
      if (!img) return res.status(404).json({ error: "Image not found" });
      if (img.projectId !== req.params.id) return res.status(400).json({ error: "Image does not belong to this project" });

      const { imageModel } = req.body || {};
      const imgModel = (imageModel as ImageModelId) || undefined;
      const scene = await storage.getScene(img.sceneId);

      await storage.updateImage(img.id, { status: "generating", imageUrl: null });
      res.json({ status: "regenerating", message: "Regenerating with character consistency references..." });

      (async () => {
        try {
          const charRefUrls = scene ? await getCharacterReferenceUrlsForScene(req.params.id, scene) : [];
          if (charRefUrls.length === 0) {
            console.warn(`[consistency-regen] No character reference images found for image ${img.id}`);
          }
          console.log(`[consistency-regen] Regenerating image ${img.id} with ${charRefUrls.length} character reference(s)`);
          const consistModelConfig = getImageModelConfig(imgModel);
          const { taskId, finalPrompt } = await generateImageWithAutoRetry(img.prompt, charRefUrls.length > 0 ? charRefUrls : undefined, imgModel, userKeys.evolink, userKeys.anthropic);
          await storage.updateImage(img.id, { status: "generating", taskId, prompt: finalPrompt });
          storage.addProjectCost(req.params.id, "imageGenerationCost", consistModelConfig.costPerImage).catch(() => {});
        } catch (err: any) {
          console.error(`[consistency-regen] Failed for image ${img.id}:`, err.message);
          await storage.updateImage(img.id, { status: "failed" });
        }
      })().catch(err => {
        console.error(`[consistency-regen] Unhandled error for image ${img.id}:`, err);
        storage.updateImage(img.id, { status: "failed" }).catch(() => {});
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/scenes/:sceneId/regenerate-with-consistency", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) return res.status(404).json({ error: "Scene not found" });

      const { imageModel } = req.body || {};
      const imgModel = (imageModel as ImageModelId) || undefined;
      const sceneImages = (await storage.getImagesByProject(project.id)).filter(img => img.sceneId === scene.id);

      if (sceneImages.length === 0) return res.status(400).json({ error: "No images in this scene to regenerate" });

      for (const img of sceneImages) {
        await storage.updateImage(img.id, { status: "generating", imageUrl: null });
      }

      res.json({ status: "regenerating", total: sceneImages.length, message: "Regenerating all scene images with character consistency..." });

      (async () => {
        const charRefUrls = await getCharacterReferenceUrlsForScene(project.id, scene);
        console.log(`[consistency-regen-scene] Regenerating ${sceneImages.length} images with ${charRefUrls.length} character reference(s)`);

        const scnConsistModelConfig = getImageModelConfig(imgModel);
        const REGEN_STAGGER_MS = 1200;
        for (let idx = 0; idx < sceneImages.length; idx++) {
          const img = sceneImages[idx];
          if (idx > 0) {
            await new Promise(r => setTimeout(r, REGEN_STAGGER_MS));
          }
          try {
            const { taskId, finalPrompt } = await generateImageWithAutoRetry(img.prompt, charRefUrls.length > 0 ? charRefUrls : undefined, imgModel, userKeys.evolink, userKeys.anthropic);
            await storage.updateImage(img.id, { status: "generating", taskId, prompt: finalPrompt });
            storage.addProjectCost(project.id, "imageGenerationCost", scnConsistModelConfig.costPerImage).catch(() => {});
          } catch (err: any) {
            console.error(`[consistency-regen-scene] Failed for image ${img.id}:`, err.message);
            await storage.updateImage(img.id, { status: "failed", error: err.message || "Regeneration failed" });
          }
        }
      })().catch(err => {
        console.error("[consistency-regen-scene] Unhandled error:", err);
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const smartRegenProgress = new Map<string, { status: string; total: number; completed: number; failed: number; detail: string }>();

  app.get("/api/projects/:id/smart-regenerate/progress", async (req, res) => {
    const progress = smartRegenProgress.get(req.params.id);
    if (progress) {
      res.json(progress);
    } else {
      res.json({ status: "idle", total: 0, completed: 0, failed: 0, detail: "" });
    }
  });

  app.post("/api/projects/:id/retry-failed", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const imgModel = (req.body?.imageModel as ImageModelId) || undefined;

      if (generationProgressMap.has(project.id)) {
        const existing = generationProgressMap.get(project.id)!;
        if (existing.status === "submitting" || existing.status === "polling") {
          return res.json({ started: false, message: "Generation already in progress" });
        }
      }

      const allImages = await storage.getImagesByProject(project.id);
      const retryImages = allImages.filter(img => img.status === "failed" || img.status === "pending");

      if (retryImages.length === 0) {
        return res.json({ started: false, message: "No failed or pending images to retry." });
      }

      const CONCURRENT_SLOTS = 3;
      const SUBMIT_GAP_MS = 1500;
      const POLL_INTERVAL_MS = 6000;
      const PER_IMAGE_TIMEOUT_MS = 5 * 60 * 1000;
      const totalBatches = Math.ceil(retryImages.length / CONCURRENT_SLOTS);

      const progress: GenerationProgress = {
        status: "submitting",
        totalImages: retryImages.length,
        submitted: 0,
        completed: 0,
        failed: 0,
        currentBatch: 0,
        totalBatches,
        detail: `Retrying ${retryImages.length} images (${CONCURRENT_SLOTS} at a time)...`,
        startedAt: Date.now(),
      };
      generationProgressMap.set(project.id, progress);
      await storage.updateProject(project.id, { status: "generating" });

      res.json({ started: true, total: retryImages.length, batches: totalBatches, progress });

      (async () => {
        let consecutiveFailCount = 0;
        const MAX_CONSECUTIVE_FAILS = 8;
        let shouldStop = false;
        let stopReason = "";
        let isCriticalError = false;

        console.log(`[retry-failed] Processing ${retryImages.length} images, ${CONCURRENT_SLOTS} at a time`);

        for (let batchStart = 0; batchStart < retryImages.length; batchStart += CONCURRENT_SLOTS) {
          if (shouldStop) break;

          const batch = retryImages.slice(batchStart, batchStart + CONCURRENT_SLOTS);
          const batchNum = Math.floor(batchStart / CONCURRENT_SLOTS) + 1;
          progress.currentBatch = batchNum;
          progress.status = "submitting";
          progress.detail = `Batch ${batchNum}/${totalBatches}: Submitting ${batch.length} images...`;

          const batchImageIds: string[] = [];

          for (let i = 0; i < batch.length; i++) {
            const img = batch[i];
            if (shouldStop || isCriticalError) continue;

            if (i > 0) {
              await new Promise(r => setTimeout(r, SUBMIT_GAP_MS));
            }

            try {
              const scene = await storage.getScene(img.sceneId);
              const charRefUrls = scene ? await getCharacterReferenceUrlsForScene(project.id, scene) : [];
              const retryModelConfig = getImageModelConfig(imgModel);
              const { taskId, finalPrompt } = await generateImageWithAutoRetry(img.prompt, charRefUrls.length > 0 ? charRefUrls : undefined, imgModel, userKeys.evolink, userKeys.anthropic);
              await storage.updateImage(img.id, { status: "generating", taskId, prompt: finalPrompt, imageUrl: null });
              batchImageIds.push(img.id);
              progress.submitted++;
              consecutiveFailCount = 0;
              storage.addProjectCost(project.id, "imageGenerationCost", retryModelConfig.costPerImage).catch(() => {});
            } catch (genErr: any) {
              const errMsg = genErr.message || "";
              console.error(`[retry-failed] Submit failed for ${img.id}:`, errMsg);

              const isQuotaError = errMsg.toLowerCase().includes("insufficient") || errMsg.toLowerCase().includes("quota");
              const isAuthError = errMsg.toLowerCase().includes("api key") && (errMsg.toLowerCase().includes("invalid") || errMsg.toLowerCase().includes("expired"));

              if (isQuotaError || isAuthError) {
                isCriticalError = true;
                shouldStop = true;
                stopReason = isQuotaError
                  ? "Insufficient credits on your EvoLink account. Please top up at evolink.ai."
                  : "API key is invalid or expired.";
                break;
              }

              await storage.updateImage(img.id, { status: "failed", error: errMsg });
              progress.failed++;
              consecutiveFailCount++;
              if (consecutiveFailCount >= MAX_CONSECUTIVE_FAILS) {
                shouldStop = true;
                stopReason = "Too many consecutive submission failures.";
              }
            }
          }

          if (shouldStop) break;

          // Wait for this batch to complete before submitting next
          if (batchImageIds.length > 0) {
            progress.status = "polling";
            progress.detail = `Batch ${batchNum}/${totalBatches}: Waiting for ${batchImageIds.length} images to render...`;

            const batchPollStart = Date.now();
            const pollFailureCounts = new Map<string, number>();

            while (Date.now() - batchPollStart < PER_IMAGE_TIMEOUT_MS) {
              const currentAllImages = await storage.getImagesByProject(project.id);
              const totalCompleted = currentAllImages.filter(img => img.status === "completed").length;
              const totalFailed = currentAllImages.filter(img => img.status === "failed").length;
              progress.completed = totalCompleted;
              progress.failed = totalFailed;

              const stillGenerating = currentAllImages.filter(img => batchImageIds.includes(img.id) && img.status === "generating" && img.taskId);

              if (stillGenerating.length === 0) {
                const bc = currentAllImages.filter(img => batchImageIds.includes(img.id) && img.status === "completed").length;
                const bf = currentAllImages.filter(img => batchImageIds.includes(img.id) && img.status === "failed").length;
                console.log(`[retry-failed] Batch ${batchNum} done: ${bc} completed, ${bf} failed`);
                break;
              }

              progress.detail = `Batch ${batchNum}/${totalBatches}: ${totalCompleted} done, ${stillGenerating.length} rendering...`;

              await Promise.all(
                stillGenerating.map(async (img) => {
                  try {
                    const result = await checkImageStatus(img.taskId!, userKeys.evolink);
                    if (result.status === "completed" && result.imageUrl) {
                      await storage.updateImage(img.id, { status: "completed", imageUrl: result.imageUrl });
                      pollFailureCounts.delete(img.id);
                    } else if (result.status === "failed") {
                      await storage.updateImage(img.id, { status: "failed", error: result.error || "Image generation failed" });
                      pollFailureCounts.delete(img.id);
                    }
                  } catch (pollErr: any) {
                    const failures = (pollFailureCounts.get(img.id) || 0) + 1;
                    pollFailureCounts.set(img.id, failures);
                    if (failures >= 5) {
                      await storage.updateImage(img.id, { status: "failed", error: `Poll failed ${failures} times` });
                      pollFailureCounts.delete(img.id);
                    }
                  }
                })
              );

              await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
            }

            if (Date.now() - batchPollStart >= PER_IMAGE_TIMEOUT_MS) {
              const currentAllImages = await storage.getImagesByProject(project.id);
              const stuckImages = currentAllImages.filter(img => batchImageIds.includes(img.id) && img.status === "generating");
              for (const img of stuckImages) {
                try {
                  const finalCheck = await checkImageStatus(img.taskId!, userKeys.evolink);
                  if (finalCheck.status === "completed" && finalCheck.imageUrl) {
                    await storage.updateImage(img.id, { status: "completed", imageUrl: finalCheck.imageUrl });
                  } else {
                    await storage.updateImage(img.id, { status: "failed", error: finalCheck.error || "Timed out after 5 minutes" });
                  }
                } catch {
                  await storage.updateImage(img.id, { status: "failed", error: "Timed out after 5 minutes" });
                }
              }
            }
          }

          if (batchStart + CONCURRENT_SLOTS < retryImages.length && !shouldStop) {
            await new Promise(r => setTimeout(r, 2000));
          }
        }

        if (isCriticalError) {
          progress.status = "error";
          progress.detail = `${stopReason} ${progress.submitted} images were submitted before the error.`;
          if (progress.submitted === 0) {
            await storage.updateProject(project.id, { status: "completed" });
            setTimeout(() => generationProgressMap.delete(project.id), 30000);
            return;
          }
        }

        const finalImages = await storage.getImagesByProject(project.id);
        const finalCompleted = finalImages.filter(img => img.status === "completed").length;
        const finalFailed = finalImages.filter(img => img.status === "failed").length;
        progress.completed = finalCompleted;
        progress.failed = finalFailed;
        progress.status = "complete";
        progress.detail = `Retry complete! ${finalCompleted} images ready, ${finalFailed} failed.`;
        const finalStatus = finalCompleted > 0 ? "completed" : "analyzed";
        await storage.updateProject(project.id, { status: finalStatus });
        console.log(`[retry-failed] Complete: ${finalCompleted} completed, ${finalFailed} failed`);

        setTimeout(() => generationProgressMap.delete(project.id), 60000);
      })().catch(err => {
        console.error("[retry-failed] Background error:", err);
        const p = generationProgressMap.get(project.id);
        if (p) {
          p.status = "error";
          p.detail = `Error: ${err.message}`;
        }
        storage.updateProject(project.id, { status: "analyzed" });
        setTimeout(() => generationProgressMap.delete(project.id), 60000);
      });
    } catch (err: any) {
      console.error("[retry-failed] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/smart-regenerate", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const imgModel = (req.body?.imageModel as ImageModelId) || undefined;
      const sceneIds: string[] | undefined = Array.isArray(req.body?.sceneIds) ? req.body.sceneIds : undefined;
      const allImages = await storage.getImagesByProject(project.id);
      const failedImages = allImages.filter(img =>
        img.status === "failed" && (!sceneIds || sceneIds.includes(img.sceneId))
      );

      if (failedImages.length === 0) {
        return res.json({ started: false, message: "No failed images to regenerate." });
      }

      smartRegenProgress.set(project.id, {
        status: "analyzing",
        total: failedImages.length,
        completed: 0,
        failed: 0,
        detail: `Analyzing ${failedImages.length} failed images...`,
      });

      res.json({ started: true, total: failedImages.length });

      const storyBible = await getStoryBible(project.id);

      (async () => {
        let completed = 0;
        let failedCount = 0;
        const SMART_REGEN_DELAY_MS = 1500;

        for (let imgIdx = 0; imgIdx < failedImages.length; imgIdx++) {
          const img = failedImages[imgIdx];

          if (imgIdx > 0) {
            await new Promise(r => setTimeout(r, SMART_REGEN_DELAY_MS));
          }

          try {
            const scene = await storage.getScene(img.sceneId);
            let shotLabel = "Cinematic Shot";
            let sceneDescription = "";
            let mood = "Cinematic";

            if (scene) {
              try {
                const shotLabels = scene.shotLabels ? JSON.parse(scene.shotLabels) : [];
                shotLabel = shotLabels[img.variant - 1] || shotLabel;
              } catch {}
              sceneDescription = scene.sceneDescription || "";
              mood = scene.mood || mood;
            }

            smartRegenProgress.set(project.id, {
              status: "analyzing",
              total: failedImages.length,
              completed,
              failed: failedCount,
              detail: `AI analyzing prompt for scene ${completed + 1}/${failedImages.length}...`,
            });

            await storage.updateImage(img.id, { status: "generating", imageUrl: null });

            let improvedPrompt: string;
            try {
              improvedPrompt = await analyzeAndImprovePrompt(
                img.prompt,
                sceneDescription,
                shotLabel,
                mood,
                storyBible,
              userKeys.anthropic,
            );
              console.log(`Smart batch regen: Improved prompt for image ${img.id} (${improvedPrompt.length} chars)`);
            } catch (promptErr: any) {
              console.error(`Smart batch regen: Failed to improve prompt for ${img.id}, using original:`, promptErr.message);
              improvedPrompt = img.prompt;
            }

            smartRegenProgress.set(project.id, {
              status: "generating",
              total: failedImages.length,
              completed,
              failed: failedCount,
              detail: `Generating improved image ${completed + 1}/${failedImages.length}...`,
            });

            const charRefUrls = scene ? await getCharacterReferenceUrlsForScene(project.id, scene) : [];
            const smartModelConfig = getImageModelConfig(imgModel);
            const { taskId, finalPrompt } = await generateImageWithAutoRetry(improvedPrompt, charRefUrls.length > 0 ? charRefUrls : undefined, imgModel, userKeys.evolink, userKeys.anthropic);
            storage.addProjectCost(project.id, "imageGenerationCost", smartModelConfig.costPerImage).catch(() => {});
            await storage.updateImage(img.id, {
              status: "generating",
              taskId,
              prompt: finalPrompt,
            });

            completed++;
          } catch (err: any) {
            console.error(`Smart batch regen failed for image ${img.id}:`, err.message);
            await storage.updateImage(img.id, { status: "failed", error: err.message || "Smart regeneration failed" });
            failedCount++;
            completed++;
          }
        }

        smartRegenProgress.set(project.id, {
          status: "complete",
          total: failedImages.length,
          completed: completed - failedCount,
          failed: failedCount,
          detail: failedCount > 0
            ? `Done. ${completed - failedCount} submitted, ${failedCount} couldn't be fixed.`
            : `All ${completed} images submitted for regeneration.`,
        });

        setTimeout(() => smartRegenProgress.delete(project.id), 30000);
      })().catch(err => {
        console.error("[smart-regenerate] Background error:", err);
        smartRegenProgress.set(project.id, {
          status: "error",
          total: failedImages.length,
          completed: 0,
          failed: failedImages.length,
          detail: `Error: ${err.message}`,
        });
        setTimeout(() => smartRegenProgress.delete(project.id), 30000);
      });

    } catch (err: any) {
      console.error("Smart batch regeneration error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/video-models", (_req, res) => {
    res.json(Object.values(VIDEO_MODELS));
  });

  app.get("/api/image-models", (_req, res) => {
    res.json(Object.values(IMAGE_MODELS));
  });

  app.post("/api/projects/:id/animate-all-videos", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const videoModel = (req.body?.videoModel as VideoModelId) || "grok";
      const videoDuration = req.body?.videoDuration ? parseInt(req.body.videoDuration) : undefined;
      const model = getVideoModelConfig(videoModel);

      const images = await storage.getImagesByProject(req.params.id);
      const eligible = images.filter(
        (img) =>
          img.status === "completed" &&
          img.imageUrl &&
          (!img.videoStatus || img.videoStatus === "failed")
      );

      if (eligible.length === 0) {
        return res.status(400).json({ error: "No eligible images to animate" });
      }

      const scenes = await storage.getScenesByProject(req.params.id);
      const sceneMap = new Map(scenes.map((s: any) => [s.id, s]));
      const storyBible = await getStoryBible(req.params.id);

      console.log(`[animate-all-videos] Starting batch video generation for ${eligible.length} images with model ${videoModel}`);

      res.json({
        started: eligible.length,
        total: eligible.length,
        model: model.name,
        costPerClip: model.costPerClip,
        estimatedCost: eligible.length * model.costPerClip,
      });

      const projectId = req.params.id;
      (async () => {
        const BATCH_SIZE = 5;
        const BATCH_DELAY = 1000;
        let submitted = 0;
        let failed = 0;

        for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
          const batch = eligible.slice(i, i + BATCH_SIZE);
          const batchPromises = batch.map(async (img) => {
            try {
              const scene = sceneMap.get(img.sceneId);
              let shotLabel = `Shot ${img.variant}`;
              try {
                if (scene?.shotLabels) {
                  const labels = JSON.parse(scene.shotLabels);
                  if (labels[img.variant - 1]) shotLabel = labels[img.variant - 1];
                }
              } catch {}

              let videoPromptFinal: string;
              try {
                videoPromptFinal = await generateSmartMotionPrompt(
                  img.prompt,
                  scene?.sceneDescription || scene?.sentence || "",
                  shotLabel,
                  scene?.mood || "cinematic",
                  img.videoPrompt,
                  videoDuration || model.duration,
                  storyBible,
                  videoModel,
                  userKeys.anthropic,
                );
              } catch (aiErr: any) {
                console.warn(`[animate-all-videos] AI motion prompt failed for image ${img.id}, using fallback`);
                videoPromptFinal = buildVideoPrompt(img.videoPrompt, img.prompt);
              }

              const effectiveDuration = ((videoModel === "kling" || videoModel === "klingmc") && videoDuration) ? videoDuration : undefined;
              const result = await generateVideoWithAutoRetry(img.imageUrl!, videoPromptFinal, videoModel, effectiveDuration, userKeys.evolink, userKeys.anthropic);
              storage.addProjectCost(projectId, "videoGenerationCost", model.costPerClip).catch(() => {});
              // #region agent log
              fetch('http://127.0.0.1:7650/ingest/052faa48-3566-4ba0-8498-06374a0a8865',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c358ba'},body:JSON.stringify({sessionId:'c358ba',hypothesisId:'A_C',location:'routes.ts:animate-all:3122',message:'Video cost added on SUBMIT',data:{projectId,imageId:img.id,videoModel:model.id,hardcodedCostPerClip:model.costPerClip,taskId:result.taskId,status:'submitted-not-yet-completed'},timestamp:Date.now()})}).catch(()=>{});
              // #endregion
              if (result.videoUrl) {
                await storage.updateImage(img.id, {
                  videoStatus: "completed",
                  videoTaskId: result.taskId,
                  videoUrl: result.videoUrl,
                  videoModel: videoModel,
                  videoPromptSent: result.finalPrompt,
                  videoError: null,
                });
                console.log(`[animate-all-videos] LTX video completed immediately for image ${img.id} → ${result.videoUrl}`);
              } else {
                await storage.updateImage(img.id, {
                  videoStatus: "generating",
                  videoTaskId: result.taskId,
                  videoUrl: null,
                  videoModel: videoModel,
                  videoPromptSent: result.finalPrompt,
                  videoError: null,
                });
                console.log(`[animate-all-videos] Submitted video for image ${img.id} → task ${result.taskId}`);
              }
              submitted++;
            } catch (err: any) {
              console.error(`[animate-all-videos] Failed to start video for image ${img.id}:`, err.message);
              await storage.updateImage(img.id, {
                videoStatus: "failed",
                videoModel: videoModel,
                videoError: err.message,
              });
              failed++;
            }
          });

          await Promise.all(batchPromises);

          if (i + BATCH_SIZE < eligible.length) {
            await new Promise((r) => setTimeout(r, BATCH_DELAY));
          }
        }

        console.log(`[animate-all-videos] Batch complete — ${submitted} submitted, ${failed} failed out of ${eligible.length}`);
      })().catch(err => {
        console.error("[animate-all-videos] Background error:", err);
      });
    } catch (err: any) {
      console.error("Animate-all-videos error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  });

  app.post("/api/projects/:id/scenes/:sceneId/animate-all", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const videoModel = (req.body?.videoModel as VideoModelId) || "grok";
      const videoDuration = req.body?.videoDuration ? parseInt(req.body.videoDuration) : undefined;
      const model = getVideoModelConfig(videoModel);
      const images = await storage.getImagesByProject(req.params.id);
      const sceneImages = images.filter(
        (img) =>
          img.sceneId === req.params.sceneId &&
          img.status === "completed" &&
          img.imageUrl &&
          (!img.videoStatus || img.videoStatus === "failed")
      );

      if (sceneImages.length === 0) {
        return res.status(400).json({ error: "No eligible images to animate in this scene" });
      }

      const scene = await storage.getScene(req.params.sceneId);
      const storyBible = await getStoryBible(req.params.id);
      const projectId = req.params.id;

      for (const img of sceneImages) {
        await storage.updateImage(img.id, { videoStatus: "generating", videoModel: videoModel, videoError: null });
      }

      res.json({ started: sceneImages.length, total: sceneImages.length, model: model.name, costPerClip: model.costPerClip });

      (async () => {
        for (const img of sceneImages) {
          try {
            let shotLabel = `Shot ${img.variant}`;
            try {
              if (scene?.shotLabels) {
                const labels = JSON.parse(scene.shotLabels);
                if (labels[img.variant - 1]) shotLabel = labels[img.variant - 1];
              }
            } catch {}

            let videoPromptFinal: string;
            try {
              videoPromptFinal = await generateSmartMotionPrompt(
                img.prompt,
                scene?.sceneDescription || scene?.sentence || "",
                shotLabel,
                scene?.mood || "cinematic",
                img.videoPrompt,
                videoDuration || model.duration,
                storyBible,
                videoModel,
                userKeys.anthropic,
              );
            } catch (aiErr: any) {
              console.warn(`[animate-all] AI motion prompt failed for image ${img.id}, using fallback: ${aiErr.message}`);
              videoPromptFinal = buildVideoPrompt(img.videoPrompt, img.prompt);
            }

            const effectiveDuration = ((videoModel === "kling" || videoModel === "klingmc") && videoDuration) ? videoDuration : undefined;
            const result = await generateVideoWithAutoRetry(img.imageUrl!, videoPromptFinal, videoModel, effectiveDuration, userKeys.evolink, userKeys.anthropic);
            storage.addProjectCost(projectId, "videoGenerationCost", model.costPerClip).catch(() => {});
            if (result.videoUrl) {
              await storage.updateImage(img.id, {
                videoStatus: "completed",
                videoTaskId: result.taskId,
                videoUrl: result.videoUrl,
                videoModel: videoModel,
                videoPromptSent: result.finalPrompt,
              });
            } else {
              await storage.updateImage(img.id, {
                videoStatus: "generating",
                videoTaskId: result.taskId,
                videoUrl: null,
                videoModel: videoModel,
                videoPromptSent: result.finalPrompt,
              });
            }
          } catch (err: any) {
            console.error(`[animate-all] Failed to start video for image ${img.id}:`, err.message);
            await storage.updateImage(img.id, { videoStatus: "failed", videoError: err.message });
          }
        }
      })().catch(err => {
        console.error("[animate-all] Background error:", err);
      });
    } catch (err: any) {
      console.error("Animate-all error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/images/:imageId/generate-video", async (req, res) => {
    let img: any = null;
    let videoModel: VideoModelId = "grok";
    try {
      const userKeys = extractUserKeys(req);
      videoModel = (req.body?.videoModel as VideoModelId) || "grok";
      const videoDuration = req.body?.videoDuration ? parseInt(req.body.videoDuration) : undefined;
      const modelConfig = getVideoModelConfig(videoModel);
      img = await storage.getImageById(req.params.imageId);
      if (!img) return res.status(404).json({ error: "Image not found" });
      if (img.projectId !== req.params.id) return res.status(400).json({ error: "Image does not belong to this project" });
      if (img.status !== "completed" || !img.imageUrl) {
        return res.status(400).json({ error: "Image must be completed before creating a video" });
      }

      const scene = await storage.getScene(img.sceneId);
      const storyBible = await getStoryBible(req.params.id);

      let shotLabel = `Shot ${img.variant}`;
      try {
        if (scene?.shotLabels) {
          const labels = JSON.parse(scene.shotLabels);
          if (labels[img.variant - 1]) shotLabel = labels[img.variant - 1];
        }
      } catch {}

      let videoPromptFinal: string;
      try {
        const effectiveDuration = videoDuration || modelConfig.duration;
        console.log(`[video-gen] Generating AI motion prompt for image ${img.id} with ${modelConfig.name} (${effectiveDuration}s)...`);
        videoPromptFinal = await generateSmartMotionPrompt(
          img.prompt,
          scene?.sceneDescription || scene?.sentence || "",
          shotLabel,
          scene?.mood || "cinematic",
          img.videoPrompt,
          effectiveDuration,
          storyBible,
          videoModel,
        userKeys.anthropic,
      );
        console.log(`[video-gen] AI motion prompt generated: ${videoPromptFinal.substring(0, 200)}...`);
      } catch (aiErr: any) {
        console.warn(`[video-gen] AI motion prompt failed, falling back to buildVideoPrompt: ${aiErr.message}`);
        videoPromptFinal = buildVideoPrompt(img.videoPrompt, img.prompt);
      }

      const result = await generateVideoWithAutoRetry(img.imageUrl, videoPromptFinal, videoModel, videoDuration, userKeys.evolink, userKeys.anthropic);
      storage.addProjectCost(img.projectId, "videoGenerationCost", modelConfig.costPerClip).catch(() => {});
      if (result.videoUrl) {
        const updated = await storage.updateImage(img.id, {
          videoStatus: "completed",
          videoTaskId: result.taskId,
          videoUrl: result.videoUrl,
          videoModel: videoModel,
          videoPromptSent: result.finalPrompt,
          videoError: null,
        });
        res.json(updated);
      } else {
        const updated = await storage.updateImage(img.id, {
          videoStatus: "generating",
          videoTaskId: result.taskId,
          videoUrl: null,
          videoModel: videoModel,
          videoPromptSent: result.finalPrompt,
          videoError: null,
        });
        res.json(updated);
      }
    } catch (err: any) {
      console.error("Video generation error:", err);
      if (img?.id) {
        await storage.updateImage(img.id, {
          videoStatus: "failed",
          videoModel: videoModel,
          videoError: err.message,
        });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/images/:imageId/regenerate-video-with-feedback", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const { feedback, videoModel: requestedModel, videoDuration: requestedDuration } = req.body || {};
      if (!feedback || typeof feedback !== "string" || feedback.trim().length === 0) {
        return res.status(400).json({ error: "Feedback text is required" });
      }

      const videoModel: VideoModelId = (requestedModel as VideoModelId) || "grok";
      const videoDuration = requestedDuration ? parseInt(requestedDuration) : undefined;
      const modelConfig = getVideoModelConfig(videoModel);

      const img = await storage.getImageById(req.params.imageId);
      if (!img) return res.status(404).json({ error: "Image not found" });
      if (img.projectId !== req.params.id) return res.status(400).json({ error: "Image does not belong to this project" });
      if (img.status !== "completed" || !img.imageUrl) {
        return res.status(400).json({ error: "Image must be completed before creating a video" });
      }

      const scene = await storage.getScene(img.sceneId);
      const storyBible = await getStoryBible(req.params.id);

      let shotLabel = `Shot ${img.variant}`;
      try {
        if (scene?.shotLabels) {
          const labels = JSON.parse(scene.shotLabels);
          if (labels[img.variant - 1]) shotLabel = labels[img.variant - 1];
        }
      } catch {}

      const effectiveDuration = videoDuration || modelConfig.duration;
      const previousPrompt = img.videoPromptSent || img.videoPrompt || "Cinematic slow motion";

      console.log(`[video-regen-feedback] Generating feedback-aware motion prompt for image ${img.id}: "${feedback.substring(0, 100)}"`);

      let videoPromptFinal: string;
      try {
        videoPromptFinal = await generateMotionPromptWithFeedback(
          img.prompt,
          scene?.sceneDescription || scene?.sentence || "",
          shotLabel,
          scene?.mood || "cinematic",
          previousPrompt,
          feedback.trim(),
          effectiveDuration,
          storyBible,
          videoModel,
        userKeys.anthropic,
      );
        console.log(`[video-regen-feedback] New motion prompt: ${videoPromptFinal.substring(0, 200)}`);
      } catch (aiErr: any) {
        console.warn(`[video-regen-feedback] AI prompt generation failed, using fallback: ${aiErr.message}`);
        videoPromptFinal = buildVideoPrompt(img.videoPrompt, img.prompt);
      }

      const result = await generateVideoWithAutoRetry(img.imageUrl, videoPromptFinal, videoModel, videoDuration, userKeys.evolink, userKeys.anthropic);
      storage.addProjectCost(req.params.id, "videoGenerationCost", modelConfig.costPerClip).catch(() => {});
      if (result.videoUrl) {
        const updated = await storage.updateImage(img.id, {
          videoStatus: "completed",
          videoTaskId: result.taskId,
          videoUrl: result.videoUrl,
          videoModel: videoModel,
          videoPromptSent: result.finalPrompt,
          videoError: null,
        });
        res.json(updated);
      } else {
        const updated = await storage.updateImage(img.id, {
          videoStatus: "generating",
          videoTaskId: result.taskId,
          videoUrl: null,
          videoModel: videoModel,
          videoPromptSent: result.finalPrompt,
          videoError: null,
        });
        res.json(updated);
      }
    } catch (err: any) {
      console.error("Video regeneration with feedback error:", err);
      const imgId = req.params.imageId;
      if (imgId) {
        try {
          await storage.updateImage(imgId, {
            videoStatus: "failed",
            videoModel: (req.body?.videoModel as VideoModelId) || "grok",
            videoError: err.message,
          });
        } catch {}
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/scenes/:sceneId/regenerate-videos-with-feedback", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const { feedback, videoModel: requestedModel, videoDuration: requestedDuration } = req.body || {};
      if (!feedback || typeof feedback !== "string" || feedback.trim().length === 0) {
        return res.status(400).json({ error: "Feedback text is required" });
      }

      const videoModel: VideoModelId = (requestedModel as VideoModelId) || "grok";
      const videoDuration = requestedDuration ? parseInt(requestedDuration) : undefined;
      const modelConfig = getVideoModelConfig(videoModel);

      const images = await storage.getImagesByProject(req.params.id);
      const sceneImages = images.filter(
        (img) => img.sceneId === req.params.sceneId && img.status === "completed" && img.imageUrl
      );

      if (sceneImages.length === 0) {
        return res.status(400).json({ error: "No eligible images in this scene" });
      }

      const scene = await storage.getScene(req.params.sceneId);
      const storyBible = await getStoryBible(req.params.id);

      console.log(`[video-regen-scene-feedback] Regenerating ${sceneImages.length} videos for scene ${req.params.sceneId} with feedback: "${feedback.substring(0, 100)}"`);

      for (const img of sceneImages) {
        await storage.updateImage(img.id, {
          videoStatus: "generating",
          videoError: null,
        });
      }

      res.json({
        started: sceneImages.length,
        model: modelConfig.name,
        costPerClip: modelConfig.costPerClip,
        estimatedCost: sceneImages.length * modelConfig.costPerClip,
      });

      (async () => {
        for (const img of sceneImages) {
          let shotLabel = `Shot ${img.variant}`;
          try {
            if (scene?.shotLabels) {
              const labels = JSON.parse(scene.shotLabels);
              if (labels[img.variant - 1]) shotLabel = labels[img.variant - 1];
            }
          } catch {}

          const effectiveDuration = videoDuration || modelConfig.duration;
          const previousPrompt = img.videoPromptSent || img.videoPrompt || "Cinematic slow motion";

          try {
            let videoPromptFinal: string;
            try {
              videoPromptFinal = await generateMotionPromptWithFeedback(
                img.prompt,
                scene?.sceneDescription || scene?.sentence || "",
                shotLabel,
                scene?.mood || "cinematic",
                previousPrompt,
                feedback.trim(),
                effectiveDuration,
                storyBible,
                videoModel,
              userKeys.anthropic,
            );
            } catch {
              videoPromptFinal = buildVideoPrompt(img.videoPrompt, img.prompt);
            }

            const result = await generateVideoWithAutoRetry(img.imageUrl!, videoPromptFinal, videoModel, videoDuration, userKeys.evolink, userKeys.anthropic);
            storage.addProjectCost(req.params.id, "videoGenerationCost", modelConfig.costPerClip).catch(() => {});
            if (result.videoUrl) {
              await storage.updateImage(img.id, {
                videoStatus: "completed",
                videoTaskId: result.taskId,
                videoUrl: result.videoUrl,
                videoModel: videoModel,
                videoPromptSent: result.finalPrompt,
                videoError: null,
              });
            } else {
              await storage.updateImage(img.id, {
                videoStatus: "generating",
                videoTaskId: result.taskId,
                videoUrl: null,
                videoModel: videoModel,
                videoPromptSent: result.finalPrompt,
                videoError: null,
              });
            }
          } catch (err: any) {
            console.error(`[video-regen-scene-feedback] Failed for image ${img.id}: ${err.message}`);
            await storage.updateImage(img.id, {
              videoStatus: "failed",
              videoModel: videoModel,
              videoError: err.message,
            });
          }
        }
        console.log(`[video-regen-scene-feedback] Scene ${req.params.sceneId} video regeneration complete`);
      })().catch(err => {
        console.error("[video-regen-scene-feedback] Unhandled error:", err);
      });
    } catch (err: any) {
      console.error("Scene video regeneration with feedback error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/images/:imageId/check-video", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const img = await storage.getImageById(req.params.imageId);
      if (!img) return res.status(404).json({ error: "Image not found" });
      if (!img.videoTaskId) return res.json(img);
      if (img.videoStatus === "completed" || img.videoStatus === "failed") return res.json(img);

      if (img.videoTaskId?.startsWith("ltx-sync-")) {
        return res.json(img);
      }

      const result = await checkVideoStatus(img.videoTaskId, userKeys.evolink);
      if (result.status === "completed" && result.videoUrl) {
        const updated = await storage.updateImage(img.id, {
          videoStatus: "completed",
          videoUrl: result.videoUrl,
        });
        return res.json(updated);
      } else if (result.status === "failed") {
        const errorMsg = result.error || "Unknown error";
        const isRetryable = errorMsg.toLowerCase().includes("service busy") || errorMsg.toLowerCase().includes("retry") || errorMsg.toLowerCase().includes("allocating") || errorMsg.toLowerCase().includes("service_error");
        const prevError = img.videoError || "";
        const retryMatch = prevError.match(/\[retry (\d+)\/\d+\]/);
        const retryCount = retryMatch ? parseInt(retryMatch[1]) : 0;

        if (isRetryable && retryCount < 5 && img.imageUrl && img.videoModel) {
          const newRetryCount = retryCount + 1;
          console.log(`[video-gen] Auto-retrying ${img.videoModel} for image ${img.id} (attempt ${newRetryCount}/5): ${errorMsg}`);
          try {
            const retryPrompt = img.videoPromptSent || buildVideoPrompt(img.videoPrompt, img.prompt);
            const retryVideoConfig = getVideoModelConfig(img.videoModel as any);
            const retryResult = await generateVideoWithAutoRetry(img.imageUrl, retryPrompt, img.videoModel as any, undefined, userKeys.evolink, userKeys.anthropic);
            storage.addProjectCost(img.projectId, "videoGenerationCost", retryVideoConfig.costPerClip).catch(() => {});
            if (retryResult.videoUrl) {
              const updated = await storage.updateImage(img.id, {
                videoStatus: "completed",
                videoTaskId: retryResult.taskId,
                videoUrl: retryResult.videoUrl,
                videoError: null,
              });
              return res.json(updated);
            }
            const updated = await storage.updateImage(img.id, {
              videoStatus: "generating",
              videoTaskId: retryResult.taskId,
              videoError: `[retry ${newRetryCount}/5] ${errorMsg}`,
            });
            return res.json({ ...updated, videoProgress: 0 });
          } catch (retryErr: any) {
            console.error(`[video-gen] Auto-retry failed for ${img.id}:`, retryErr.message);
            const updated = await storage.updateImage(img.id, { videoStatus: "failed", videoError: `[retry ${newRetryCount}/5] ${errorMsg} (retry failed: ${retryErr.message})` });
            return res.json(updated);
          }
        }

        const updated = await storage.updateImage(img.id, { videoStatus: "failed", videoError: errorMsg });
        return res.json(updated);
      }

      res.json({ ...img, videoProgress: result.progress });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/poll-videos", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const images = await storage.getImagesByProject(req.params.id);
      const pendingVideos = images.filter((img) => img.videoStatus === "generating" && img.videoTaskId);

      for (const img of pendingVideos) {
        try {
          if (img.videoTaskId?.startsWith("ltx-sync-")) continue;

          const result = await checkVideoStatus(img.videoTaskId!, userKeys.evolink);
          if (result.status === "completed" && result.videoUrl) {
            await storage.updateImage(img.id, {
              videoStatus: "completed",
              videoUrl: result.videoUrl,
            });
          } else if (result.status === "failed") {
            const errorMsg = result.error || "Unknown error";
            const isRetryable = errorMsg.toLowerCase().includes("service busy") || errorMsg.toLowerCase().includes("retry") || errorMsg.toLowerCase().includes("allocating") || errorMsg.toLowerCase().includes("service_error");
            const prevError = img.videoError || "";
            const retryMatch = prevError.match(/\[retry (\d+)\/\d+\]/);
            const retryCount = retryMatch ? parseInt(retryMatch[1]) : 0;

            if (isRetryable && retryCount < 5 && img.imageUrl && img.videoModel) {
              const newRetryCount = retryCount + 1;
              console.log(`[video-gen] Auto-retrying ${img.videoModel} for image ${img.id} (poll-videos, attempt ${newRetryCount}/5): ${errorMsg}`);
              try {
                const retryPrompt = img.videoPromptSent || buildVideoPrompt(img.videoPrompt, img.prompt);
                const retryVideoConfig2 = getVideoModelConfig(img.videoModel as any);
                const retryResult = await generateVideoWithAutoRetry(img.imageUrl, retryPrompt, img.videoModel as any, undefined, userKeys.evolink, userKeys.anthropic);
                storage.addProjectCost(img.projectId, "videoGenerationCost", retryVideoConfig2.costPerClip).catch(() => {});
                if (retryResult.videoUrl) {
                  await storage.updateImage(img.id, {
                    videoStatus: "completed",
                    videoTaskId: retryResult.taskId,
                    videoUrl: retryResult.videoUrl,
                    videoError: null,
                  });
                } else {
                  await storage.updateImage(img.id, {
                    videoStatus: "generating",
                    videoTaskId: retryResult.taskId,
                    videoError: `[retry ${newRetryCount}/5] ${errorMsg}`,
                  });
                }
                continue;
              } catch (retryErr: any) {
                console.error(`[video-gen] Auto-retry failed for ${img.id}:`, retryErr.message);
              }
            }
            await storage.updateImage(img.id, { videoStatus: "failed", videoError: errorMsg });
          }
        } catch (checkErr: any) {
          console.error(`Error checking video ${img.id}:`, checkErr);
          const stuckThreshold = 10 * 60 * 1000;
          const createdAt = img.createdAt ? new Date(img.createdAt).getTime() : 0;
          const isStuck = createdAt > 0 && (Date.now() - createdAt > stuckThreshold);
          if (isStuck) {
            await storage.updateImage(img.id, {
              videoStatus: "failed",
              videoError: `Video check failed after extended wait: ${checkErr.message || "Unknown polling error"}`,
            });
            console.warn(`[poll-videos] Marked stuck image ${img.id} as failed (created ${Math.round((Date.now() - createdAt) / 60000)}min ago)`);
          }
        }
      }

      const allImages = await storage.getImagesByProject(req.params.id);
      res.json(allImages);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/poll-images", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const images = await storage.getImagesByProject(req.params.id);
      const pendingImages = images.filter((img) => img.status === "generating" && img.taskId);

      const POLL_BATCH_SIZE = 10;
      const results = [];
      for (let i = 0; i < pendingImages.length; i += POLL_BATCH_SIZE) {
        const batch = pendingImages.slice(i, i + POLL_BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (img) => {
            try {
              const result = await checkImageStatus(img.taskId!, userKeys.evolink);
              if (result.status === "completed" && result.imageUrl) {
                return await storage.updateImage(img.id, {
                  status: "completed",
                  imageUrl: result.imageUrl,
                });
              } else if (result.status === "failed") {
                return await storage.updateImage(img.id, { status: "failed", error: result.error || "Image generation failed" });
              }
              return img;
            } catch (checkErr: any) {
              console.error(`Error checking image ${img.id}:`, checkErr?.message || checkErr);
              return img;
            }
          })
        );
        results.push(...batchResults);
      }

      const allImages = await storage.getImagesByProject(req.params.id);
      const completedCount = allImages.filter((img) => img.status === "completed").length;
      const generatingCount = allImages.filter((img) => img.status === "generating" || img.status === "pending").length;
      const totalCount = allImages.length;

      if (totalCount > 0 && generatingCount === 0) {
        const newStatus = completedCount > 0 ? "completed" : "analyzed";
        await storage.updateProject(req.params.id, { status: newStatus });
      }

      res.json(allImages);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/export", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const projectScenes = await storage.getScenesByProject(project.id);
      const projectImages = await storage.getImagesByProject(project.id);

      const includeImages = req.body.includeImages !== false;
      const includeClips = req.body.includeClips !== false;

      if (!includeImages && !includeClips) {
        return res.status(400).json({ error: "Must include at least images or clips" });
      }

      console.log(`Export PDF: project ${project.id}, images=${includeImages}, clips=${includeClips}, scenes=${projectScenes.length}, totalImages=${projectImages.length}`);

      await streamExportPDF(
        res,
        project,
        projectScenes,
        projectImages,
        { includeImages, includeClips },
      );
    } catch (err: any) {
      console.error("Export PDF error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/export-story-bible", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });
      if (!project.analysis) return res.status(400).json({ error: "Project has not been analyzed yet" });

      const projectScenes = await storage.getScenesByProject(project.id);
      const projectImages = await storage.getImagesByProject(project.id);
      const charRefs = await storage.getCharacterReferencesByProject(project.id);

      console.log(`Export Story Bible: project ${project.id}, scenes=${projectScenes.length}, images=${projectImages.length}, charRefs=${charRefs.length}`);

      await streamStoryBiblePDF(
        res,
        project,
        { analysis: project.analysis as any },
        charRefs as any,
        projectScenes,
        projectImages,
      );
    } catch (err: any) {
      console.error("Export Story Bible error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  });

  app.get("/api/projects/:id/scenes/:sceneId/download", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const scene = await storage.getScene(req.params.sceneId);
      if (!scene) return res.status(404).json({ error: "Scene not found" });

      const images = await storage.getImagesByScene(req.params.sceneId);
      const completedImages = images
        .filter(img => img.status === "completed" && img.imageUrl)
        .sort((a, b) => a.variant - b.variant);

      if (completedImages.length === 0) {
        return res.status(400).json({ error: "No completed images in this scene" });
      }

      const allScenes = await storage.getScenesByProject(req.params.id);
      const sceneNum = allScenes.findIndex(s => s.id === scene.id) + 1;
      const safeName = (project.title || "project").replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50);
      const zipFilename = `${safeName}_scene_${sceneNum}.zip`;

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${zipFilename}"`);

      const archive = archiver("zip", { zlib: { level: 5 } });
      archive.pipe(res);

      let shotLabels: string[] = [];
      try { shotLabels = scene.shotLabels ? JSON.parse(scene.shotLabels) : []; } catch {}

      let motionPromptText = `SCENE ${sceneNum}: ${scene.sceneDescription || "Scene"}\n`;
      motionPromptText += `Mood: ${scene.mood || "Cinematic"}\n`;
      motionPromptText += `Location: ${scene.location || "Unspecified"}\n`;
      motionPromptText += `Time of Day: ${scene.timeOfDay || "Day"}\n`;
      motionPromptText += `\n--- MULTI-FRAME MOTION DIRECTION ---\n\n`;
      motionPromptText += `Use these ${completedImages.length} frames as a sequence for multi-frame animation (e.g., Seedance 2.0).\n`;
      motionPromptText += `The frames tell a continuous visual story — animate them in order.\n\n`;

      for (let i = 0; i < completedImages.length; i++) {
        const img = completedImages[i];
        const shotLabel = shotLabels[img.variant - 1] || `Shot ${img.variant}`;
        const ext = img.imageUrl!.match(/\.(png|jpg|jpeg|webp)/i)?.[1] || "png";
        const filename = `frame_${String(i + 1).padStart(2, "0")}_${shotLabel.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 40)}.${ext}`;

        try {
          const response = await fetch(img.imageUrl!);
          if (response.ok) {
            const buffer = Buffer.from(await response.arrayBuffer());
            archive.append(buffer, { name: filename });
          }
        } catch (fetchErr: any) {
          console.warn(`[scene-download] Failed to fetch image ${img.id}: ${fetchErr.message}`);
        }

        motionPromptText += `FRAME ${i + 1} — ${shotLabel}:\n`;
        if (img.videoPrompt) {
          motionPromptText += `${img.videoPrompt}\n\n`;
        } else {
          const briefContext = img.prompt?.substring(0, 200).replace(/[.,;:]$/, "") || "";
          motionPromptText += `Gentle cinematic motion for: ${briefContext}...\n\n`;
        }
      }

      motionPromptText += `--- END OF SCENE ${sceneNum} ---\n`;
      archive.append(Buffer.from(motionPromptText, "utf-8"), { name: "motion_prompts.txt" });

      await archive.finalize();
    } catch (err: any) {
      console.error("[scene-download] Error:", err.message);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/projects/:id/download", async (req, res) => {
    try {
      const type = (req.query.type as string) || "all";
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const images = await storage.getImagesByProject(req.params.id);
      const scenes = await storage.getScenesByProject(req.params.id);
      const sceneMap = new Map(scenes.map((s: any, i: number) => [s.id, { scene: s, index: i + 1 }]));

      const includeImages = type === "images" || type === "all";
      const includeClips = type === "clips" || type === "all";

      const downloadItems: { url: string; filename: string }[] = [];

      for (const img of images) {
        const sceneInfo = sceneMap.get(img.sceneId);
        const sceneNum = sceneInfo ? String(sceneInfo.index).padStart(3, "0") : "000";
        const shotNum = String(img.variant).padStart(2, "0");

        if (includeImages && img.status === "completed" && img.imageUrl) {
          const ext = img.imageUrl.match(/\.(png|jpg|jpeg|webp)/i)?.[1] || "png";
          downloadItems.push({
            url: img.imageUrl,
            filename: `images/scene_${sceneNum}_shot_${shotNum}.${ext}`,
          });
        }

        if (includeClips && img.videoStatus === "completed" && img.videoUrl) {
          const ext = img.videoUrl.match(/\.(mp4|webm|mov)/i)?.[1] || "mp4";
          downloadItems.push({
            url: img.videoUrl,
            filename: `clips/scene_${sceneNum}_shot_${shotNum}.${ext}`,
          });
        }
      }

      if (downloadItems.length === 0) {
        return res.status(400).json({ error: "No files available to download" });
      }

      const safeName = (project.title || "project").replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50);
      const typeSuffix = type === "images" ? "_images" : type === "clips" ? "_clips" : "_all";
      const zipFilename = `${safeName}${typeSuffix}.zip`;

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${zipFilename}"`);

      const archive = archiver("zip", { zlib: { level: 1 } });
      let clientDisconnected = false;
      req.on("close", () => { clientDisconnected = true; });
      archive.on("error", (err) => {
        console.error("Archive error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Archive failed" });
        }
      });
      archive.pipe(res);

      const isVideo = (fn: string) => /\.(mp4|webm|mov)$/i.test(fn);
      const CONCURRENCY = 4;
      const MAX_RETRIES = 2;
      let succeeded = 0;
      const failedItems: { filename: string; reason: string }[] = [];

      const fetchFile = async (item: { url: string; filename: string }) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);
        try {
          const upstream = await fetch(item.url, {
            headers: { "User-Agent": "ScriptVision/1.0" },
            signal: controller.signal,
          });
          if (!upstream.ok) {
            throw new Error(`HTTP ${upstream.status}`);
          }
          const arrayBuf = await upstream.arrayBuffer();
          return { filename: item.filename, buffer: Buffer.from(arrayBuf) };
        } finally {
          clearTimeout(timeout);
        }
      };

      for (let i = 0; i < downloadItems.length; i += CONCURRENCY) {
        if (clientDisconnected) {
          console.log(`[download] Client disconnected, aborting after ${succeeded} files`);
          break;
        }
        const batch = downloadItems.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(batch.map(fetchFile));

        const retryQueue: typeof downloadItems = [];
        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          if (result.status === "fulfilled" && result.value) {
            archive.append(result.value.buffer, {
              name: result.value.filename,
              store: isVideo(result.value.filename),
            });
            succeeded++;
          } else {
            retryQueue.push(batch[j]);
          }
        }

        for (const retryItem of retryQueue) {
          let retrySuccess = false;
          for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            if (clientDisconnected) break;
            await new Promise((r) => setTimeout(r, 1000 * attempt));
            try {
              const result = await fetchFile(retryItem);
              archive.append(result.buffer, {
                name: result.filename,
                store: isVideo(result.filename),
              });
              succeeded++;
              retrySuccess = true;
              break;
            } catch {}
          }
          if (!retrySuccess) {
            failedItems.push({ filename: retryItem.filename, reason: "Failed after retries" });
          }
        }
      }

      if (failedItems.length > 0) {
        const manifest = [
          `Download Summary`,
          `================`,
          `Total files: ${downloadItems.length}`,
          `Successfully downloaded: ${succeeded}`,
          `Failed: ${failedItems.length}`,
          ``,
          `Missing files:`,
          ...failedItems.map((f) => `  - ${f.filename} (${f.reason})`),
        ].join("\n");
        archive.append(Buffer.from(manifest, "utf-8"), { name: "_MISSING_FILES.txt" });
      }

      console.log(`[download] Archive complete: ${succeeded} succeeded, ${failedItems.length} failed out of ${downloadItems.length} items`);
      await archive.finalize();
    } catch (err: any) {
      console.error("Download error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  });

  app.get("/api/proxy-media", async (req, res) => {
    try {
      const url = req.query.url as string;
      if (!url) {
        return res.status(400).json({ error: "Missing url parameter" });
      }
      const allowedDomains = [
        "files.evolink.ai",
        "midjourney-plus.oss-us-west-1.aliyuncs.com",
        "v1-fdl.kechuangai.com",
        "volces.com",
      ];
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return res.status(400).json({ error: "Invalid URL" });
      }
      if (!allowedDomains.some(d => parsedUrl.hostname === d || parsedUrl.hostname.endsWith("." + d))) {
        return res.status(403).json({ error: "Domain not allowed" });
      }

      const upstreamHeaders: Record<string, string> = { "User-Agent": "ScriptVision/1.0" };
      if (req.headers.range) {
        upstreamHeaders["Range"] = req.headers.range;
      }

      const upstream = await fetch(url, { headers: upstreamHeaders });
      if (!upstream.ok && upstream.status !== 206) {
        return res.status(upstream.status).json({ error: "Upstream fetch failed" });
      }

      const contentType = upstream.headers.get("content-type");
      const contentLength = upstream.headers.get("content-length");
      const contentRange = upstream.headers.get("content-range");
      const acceptRanges = upstream.headers.get("accept-ranges");

      if (contentType) res.setHeader("Content-Type", contentType);
      if (contentLength) res.setHeader("Content-Length", contentLength);
      if (contentRange) res.setHeader("Content-Range", contentRange);
      if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);
      else res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=86400");

      res.status(upstream.status);
      
      if (upstream.body) {
        const reader = upstream.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) { res.end(); return; }
            if (!res.writableEnded) res.write(Buffer.from(value));
          }
        };
        await pump();
      } else {
        const arrayBuf = await upstream.arrayBuffer();
        res.send(Buffer.from(arrayBuf));
      }
    } catch (err: any) {
      console.error("Proxy media error:", err.message);
      if (!res.headersSent) res.status(500).json({ error: "Proxy error" });
    }
  });

  app.get("/api/projects/:id/clips-info", async (req, res) => {
    try {
      const projectId = req.params.id;
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const scenes = await storage.getScenesByProject(projectId);
      const images = await storage.getImagesByProject(projectId);

      const completedClips = images.filter(
        (img) => img.videoUrl && img.videoStatus === "completed"
      );

      let totalSizeBytes = 0;
      const clipsByScene: Record<string, number> = {};

      for (const clip of completedClips) {
        clipsByScene[clip.sceneId] = (clipsByScene[clip.sceneId] || 0) + 1;
      }

      const BATCH_SIZE = 20;
      for (let i = 0; i < completedClips.length; i += BATCH_SIZE) {
        const batch = completedClips.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(clip =>
            fetch(clip.videoUrl!, { method: "HEAD", headers: { "User-Agent": "ScriptVision/1.0" } })
              .then(r => parseInt(r.headers.get("content-length") || "0", 10))
          )
        );
        for (const r of results) {
          if (r.status === "fulfilled") totalSizeBytes += r.value;
        }
      }

      const sceneCount = Object.keys(clipsByScene).length;
      res.json({
        totalClips: completedClips.length,
        totalScenes: sceneCount,
        estimatedSizeBytes: totalSizeBytes,
        estimatedSizeMB: Math.round(totalSizeBytes / (1024 * 1024)),
      });
    } catch (err: any) {
      console.error("Clips info error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/projects/:id/download-clips", async (req, res) => {
    try {
      const projectId = req.params.id;
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const scenes = await storage.getScenesByProject(projectId);
      const images = await storage.getImagesByProject(projectId);

      scenes.sort((a, b) => a.sentenceIndex - b.sentenceIndex);

      const completedClips = images.filter(
        (img) => img.videoUrl && img.videoStatus === "completed"
      );

      if (completedClips.length === 0) {
        return res.status(400).json({ error: "No completed clips to download" });
      }

      const clipsByScene = new Map<string, typeof completedClips>();
      for (const clip of completedClips) {
        const arr = clipsByScene.get(clip.sceneId) || [];
        arr.push(clip);
        clipsByScene.set(clip.sceneId, arr);
      }

      const sanitize = (str: string) =>
        str
          .replace(/[^a-zA-Z0-9\s]/g, "")
          .trim()
          .replace(/\s+/g, "_")
          .substring(0, 40);

      const projectName = sanitize(project.title || "Project") || "Project";
      const zipFilename = `${projectName}_Clips.zip`;

      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${zipFilename}"`
      );

      const archive = archiver("zip", { store: true });
      let clientDisconnected = false;
      req.on("close", () => { clientDisconnected = true; });
      archive.on("error", (err) => {
        console.error("Archive error:", err);
        if (!res.headersSent) res.status(500).json({ error: "Archive failed" });
      });
      archive.pipe(res);

      const downloadItems: { url: string; filePath: string }[] = [];
      let sceneNum = 0;
      for (const scene of scenes) {
        const sceneClips = clipsByScene.get(scene.id);
        if (!sceneClips || sceneClips.length === 0) continue;

        sceneNum++;
        const scenePrefix = `S${String(sceneNum).padStart(2, "0")}`;

        let sceneName = "";
        if (scene.sceneDescription) {
          const words = scene.sceneDescription.split(/\s+/).slice(0, 4);
          sceneName = sanitize(words.join(" "));
        }
        if (!sceneName) sceneName = "Scene";
        const folderName = `${scenePrefix}_${sceneName}`;

        let shotLabels: string[] = [];
        try {
          if (scene.shotLabels) shotLabels = JSON.parse(scene.shotLabels);
        } catch {}

        sceneClips.sort((a, b) => a.variant - b.variant);

        for (let i = 0; i < sceneClips.length; i++) {
          const clip = sceneClips[i];
          const clipNum = String(i + 1).padStart(3, "0");
          let shotLabel = shotLabels[clip.variant] || `Shot_${clip.variant + 1}`;
          shotLabel = sanitize(shotLabel);
          const fileName = `${clipNum}_${shotLabel}.mp4`;
          downloadItems.push({
            url: clip.videoUrl!,
            filePath: `${projectName}_Clips/${folderName}/${fileName}`,
          });
        }
      }

      if (downloadItems.length === 0) {
        await archive.finalize();
        return;
      }

      const CONCURRENCY = 4;
      const MAX_RETRIES = 2;
      let succeeded = 0;
      const failedItems: { filePath: string; reason: string }[] = [];

      const fetchClip = async (item: { url: string; filePath: string }) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);
        try {
          const upstream = await fetch(item.url, {
            headers: { "User-Agent": "ScriptVision/1.0" },
            signal: controller.signal,
          });
          if (!upstream.ok) {
            throw new Error(`HTTP ${upstream.status}`);
          }
          const arrayBuf = await upstream.arrayBuffer();
          return { filePath: item.filePath, buffer: Buffer.from(arrayBuf) };
        } finally {
          clearTimeout(timeout);
        }
      };

      for (let i = 0; i < downloadItems.length; i += CONCURRENCY) {
        if (clientDisconnected) {
          console.log(`[download-clips] Client disconnected, aborting after ${succeeded} clips`);
          break;
        }
        const batch = downloadItems.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(batch.map(fetchClip));

        const retryQueue: typeof downloadItems = [];
        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          if (result.status === "fulfilled" && result.value) {
            archive.append(result.value.buffer, { name: result.value.filePath });
            succeeded++;
          } else {
            retryQueue.push(batch[j]);
          }
        }

        for (const retryItem of retryQueue) {
          let retrySuccess = false;
          for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            if (clientDisconnected) break;
            await new Promise((r) => setTimeout(r, 1000 * attempt));
            try {
              const result = await fetchClip(retryItem);
              archive.append(result.buffer, { name: result.filePath });
              succeeded++;
              retrySuccess = true;
              console.log(`[download-clips] Retry ${attempt} succeeded for ${retryItem.filePath}`);
              break;
            } catch (err: any) {
              console.warn(`[download-clips] Retry ${attempt} failed for ${retryItem.filePath}: ${err.message}`);
            }
          }
          if (!retrySuccess) {
            failedItems.push({
              filePath: retryItem.filePath,
              reason: "Failed after retries",
            });
          }
        }
      }

      if (failedItems.length > 0) {
        const manifest = [
          `Download Summary`,
          `================`,
          `Total clips: ${downloadItems.length}`,
          `Successfully downloaded: ${succeeded}`,
          `Failed: ${failedItems.length}`,
          ``,
          `Missing clips:`,
          ...failedItems.map((f) => `  - ${f.filePath} (${f.reason})`),
        ].join("\n");
        archive.append(Buffer.from(manifest, "utf-8"), {
          name: `${projectName}_Clips/_MISSING_CLIPS.txt`,
        });
      }

      console.log(`[download-clips] Archive complete: ${succeeded} succeeded, ${failedItems.length} failed out of ${downloadItems.length} clips`);
      await archive.finalize();
    } catch (err: any) {
      console.error("Download clips error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  });

  // ─── AI Assistant Chatbot Routes ────────────────────────────────────

  app.post("/api/assistant/chat", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const { messages } = req.body || {};
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Messages array is required" });
      }

      const result = await assistantChat(
        messages as AssistantMessage[],
        null,
        userKeys.anthropic,
      );

      res.json(result);
    } catch (err: any) {
      console.error("Assistant chat error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/assistant/chat", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const { messages, focusedSceneId } = req.body || {};
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Messages array is required" });
      }

      const scenes = await storage.getScenesByProject(project.id);
      const images = await storage.getImagesByProject(project.id);
      const analysis = project.analysis as any;
      const characters = analysis?.characters || [];
      const jets = analysis?.jets || [];
      const vehicles = analysis?.vehicles || [];
      const locations = analysis?.locations || [];
      const charRefs = await storage.getCharacterReferencesByProject(project.id);

      const storyBible = await getStoryBible(project.id);

      const completedImages = images.filter(img => img.status === "completed").length;
      const failedImages = images.filter(img => img.status === "failed").length;
      const generatingImages = images.filter(img => img.status === "generating" || img.status === "pending").length;
      const totalVideos = images.filter(img => img.videoStatus).length;
      const completedVideos = images.filter(img => img.videoUrl).length;

      const context: ProjectContext = {
        projectId: project.id,
        title: project.title,
        script: project.script.substring(0, 3000),
        status: project.status,
        sceneCount: scenes.length,
        imageCount: images.length,
        completedImages,
        failedImages,
        generatingImages,
        totalVideos,
        completedVideos,
        scenes: scenes.map(s => {
          const sceneImages = images
            .filter(img => img.sceneId === s.id)
            .sort((a, b) => a.variant - b.variant);
          return {
            id: s.id,
            sentenceIndex: s.sentenceIndex,
            sentence: s.sentence,
            sceneDescription: s.sceneDescription,
            mood: s.mood,
            location: s.location,
            timeOfDay: s.timeOfDay,
            cameraAngle: s.cameraAngle,
            imageCount: sceneImages.length,
            images: sceneImages.map(img => ({
              id: img.id,
              variant: img.variant,
              prompt: img.prompt.substring(0, 300),
              status: img.status,
              hasVideo: !!img.videoUrl,
              videoStatus: img.videoStatus,
              videoModel: img.videoModel,
            })),
          };
        }),
        characters: characters.map((c: any) => ({
          name: c.name || "",
          role: c.role || "",
          description: c.description || "",
          appearance: c.appearance || "",
          signatureFeatures: c.signatureFeatures || undefined,
        })),
        jets: jets.map((j: any) => ({ name: j.name || "", type: j.type || "", description: j.description || "" })),
        vehicles: vehicles.map((v: any) => ({ name: v.name || "", type: v.type || "", description: v.description || "" })),
        locations: locations.map((l: any) => ({ name: l.name || "", description: l.description || "" })),
        characterRefs: charRefs.map((r: any) => ({
          characterName: r.characterName,
          angle: r.angle || "front",
          status: r.status,
          hasImage: !!r.imageUrl,
        })),
        storyBible,
        hasVoiceover: !!project.voiceoverUrl,
        focusedSceneId: focusedSceneId || undefined,
      };

      const result = await assistantChat(
        messages as AssistantMessage[],
        context,
        userKeys.anthropic,
      );

      res.json(result);
    } catch (err: any) {
      console.error("Project assistant chat error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/assistant/execute", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const { actions } = req.body || {};
      if (!actions || !Array.isArray(actions) || actions.length === 0) {
        return res.status(400).json({ error: "Actions array is required" });
      }

      const results: Array<{ type: string; status: string; detail: string }> = [];

      for (const action of actions) {
        try {
          switch (action.type) {

            // ── ANALYSIS ──
            case "analyze_project": {
              if (analysisRunning.has(project.id)) {
                results.push({ type: action.type, status: "already_running", detail: "Analysis is already in progress" });
                break;
              }
              const analysisMode = action.params?.mode === "budget" ? "budget" : "fast";
              results.push({
                type: action.type,
                status: "frontend_action",
                detail: JSON.stringify({
                  endpoint: `/api/projects/${project.id}/analyze`,
                  method: "POST",
                  body: { mode: analysisMode },
                  message: `Starting project analysis in ${analysisMode} mode...`,
                }),
              });
              break;
            }

            // ── GENERATE ALL IMAGES ──
            case "generate_all_images": {
              if (generationProgressMap.has(project.id)) {
                const existing = generationProgressMap.get(project.id)!;
                if (existing.status === "submitting" || existing.status === "polling") {
                  results.push({ type: action.type, status: "already_running", detail: "Image generation is already in progress" });
                  break;
                }
              }
              const imgModel = action.params?.imageModel || undefined;
              const forceRegenerate = action.params?.forceRegenerate === true;
              results.push({
                type: action.type,
                status: "frontend_action",
                detail: JSON.stringify({
                  endpoint: `/api/projects/${project.id}/generate-all`,
                  method: "POST",
                  body: { imageModel: imgModel, forceRegenerate },
                  message: "Starting storyboard image generation for all scenes...",
                }),
              });
              break;
            }

            // ── REGENERATE IMAGE ──
            case "regenerate_image":
            case "edit_prompt": {
              const img = await storage.getImageById(action.params.imageId);
              if (!img) { results.push({ type: action.type, status: "error", detail: "Image not found" }); break; }

              const scene = await storage.getScene(img.sceneId);
              if (!scene) { results.push({ type: action.type, status: "error", detail: "Scene not found" }); break; }

              let prompt = img.prompt;
              if (action.params.feedback) {
                const storyBible = await getStoryBible(project.id);
                const shotLabels: string[] = (() => { try { return scene.shotLabels ? JSON.parse(scene.shotLabels) : []; } catch { return []; } })();
                const shotLabel = shotLabels[img.variant - 1] || "Cinematic Shot";
                prompt = await applySceneChatFeedback(img.prompt, action.params.feedback, shotLabel, scene.sceneDescription || "", scene.mood || "cinematic", storyBible, userKeys.anthropic);
              }

              const imgModel = (action.params?.imageModel as ImageModelId) || undefined;
              await storage.updateImage(img.id, { status: "generating", imageUrl: null });
              const charRefUrls = await getCharacterReferenceUrlsForScene(project.id, scene);
              const { taskId, finalPrompt } = await generateImageWithAutoRetry(prompt, charRefUrls.length > 0 ? charRefUrls : undefined, imgModel, userKeys.evolink, userKeys.anthropic);
              await storage.updateImage(img.id, { status: "generating", taskId, prompt: finalPrompt });
              results.push({ type: action.type, status: "started", detail: `Regenerating image (variant ${img.variant})` });
              break;
            }

            // ── REGENERATE SCENE ──
            case "regenerate_scene": {
              const scene = await storage.getScene(action.params.sceneId);
              if (!scene) { results.push({ type: action.type, status: "error", detail: "Scene not found" }); break; }

              const sceneImages = (await storage.getImagesByProject(project.id)).filter(img => img.sceneId === scene.id);
              const storyBible = await getStoryBible(project.id);
              const shotLabels: string[] = (() => { try { return scene.shotLabels ? JSON.parse(scene.shotLabels) : []; } catch { return []; } })();
              const imgModel = (action.params?.imageModel as ImageModelId) || undefined;

              for (const img of sceneImages) {
                await storage.updateImage(img.id, { status: "generating", imageUrl: null });
              }

              (async () => {
                for (const img of sceneImages) {
                  try {
                    const shotLabel = shotLabels[img.variant - 1] || "Cinematic Shot";
                    const improvedPrompt = await applySceneChatFeedback(img.prompt, action.params.feedback || "regenerate with improved quality", shotLabel, scene.sceneDescription || "", scene.mood || "cinematic", storyBible, userKeys.anthropic);
                    const charRefUrls = await getCharacterReferenceUrlsForScene(project.id, scene);
                    const { taskId, finalPrompt } = await generateImageWithAutoRetry(improvedPrompt, charRefUrls.length > 0 ? charRefUrls : undefined, imgModel, userKeys.evolink, userKeys.anthropic);
                    await storage.updateImage(img.id, { status: "generating", taskId, prompt: finalPrompt });
                  } catch (e: any) {
                    console.error(`[assistant] Error regenerating scene image ${img.id}:`, e);
                    await storage.updateImage(img.id, { status: "error", error: e.message });
                  }
                }
              })().catch(err => console.error("[assistant] Scene regen error:", err));

              results.push({ type: action.type, status: "started", detail: `Regenerating ${sceneImages.length} images in scene` });
              break;
            }

            // ── REGENERATE SCENE PROMPTS ──
            case "regenerate_scene_prompts": {
              const scene = await storage.getScene(action.params.sceneId);
              if (!scene) { results.push({ type: action.type, status: "error", detail: "Scene not found" }); break; }

              const storyBible = await getStoryBible(project.id);
              if (!storyBible) { results.push({ type: action.type, status: "error", detail: "No story bible — analyze the project first" }); break; }

              const visualScenes = visualScenesCache.get(project.id);
              const sceneIndex = scene.sentenceIndex;
              const visualScene = visualScenes?.[sceneIndex];

              if (visualScene) {
                const allScenes = visualScenes!;
                const totalScenes = allScenes.length;
                const prevScene = sceneIndex > 0 ? allScenes[sceneIndex - 1] : null;
                const nextScene = sceneIndex < totalScenes - 1 ? allScenes[sceneIndex + 1] : null;
                const seqResult = await generateSequencePrompts(visualScene, sceneIndex, totalScenes, storyBible, prevScene, nextScene, allScenes, userKeys.anthropic);
                const labels = seqResult.shotLabels || [];
                await storage.updateScene(scene.id, { shotLabels: JSON.stringify(labels) });
                const sceneImages = (await storage.getImagesByProject(project.id)).filter(img => img.sceneId === scene.id).sort((a, b) => a.variant - b.variant);
                for (let i = 0; i < sceneImages.length && i < seqResult.prompts.length; i++) {
                  await storage.updateImage(sceneImages[i].id, { prompt: seqResult.prompts[i] });
                }
                results.push({ type: action.type, status: "completed", detail: `Regenerated ${seqResult.prompts.length} prompts for the scene` });
              } else {
                results.push({ type: action.type, status: "error", detail: "Visual scene data not cached — re-analyze the project first" });
              }
              break;
            }

            // ── DELETE IMAGE ──
            case "delete_image": {
              const img = await storage.getImageById(action.params.imageId);
              if (!img) { results.push({ type: action.type, status: "error", detail: "Image not found" }); break; }
              if (img.projectId !== project.id) { results.push({ type: action.type, status: "error", detail: "Image not in this project" }); break; }
              await storage.deleteImage(img.id);
              results.push({ type: action.type, status: "completed", detail: `Deleted image (variant ${img.variant})` });
              break;
            }

            // ── RETRY FAILED ──
            case "retry_failed_images": {
              const allImages = await storage.getImagesByProject(project.id);
              const failedImages = allImages.filter(img => img.status === "failed");
              if (failedImages.length === 0) {
                results.push({ type: action.type, status: "completed", detail: "No failed images to retry" });
                break;
              }

              const imgModel = (action.params?.imageModel as ImageModelId) || undefined;
              let retryCount = 0;
              (async () => {
                for (const img of failedImages) {
                  try {
                    await storage.updateImage(img.id, { status: "generating", imageUrl: null, error: null });
                    const scene = await storage.getScene(img.sceneId);
                    const charRefUrls = scene ? await getCharacterReferenceUrlsForScene(project.id, scene) : [];
                    const { taskId, finalPrompt } = await generateImageWithAutoRetry(img.prompt, charRefUrls.length > 0 ? charRefUrls : undefined, imgModel, userKeys.evolink, userKeys.anthropic);
                    await storage.updateImage(img.id, { status: "generating", taskId, prompt: finalPrompt });
                    retryCount++;
                  } catch (e: any) {
                    console.error(`[assistant] Retry failed for ${img.id}:`, e);
                    await storage.updateImage(img.id, { status: "failed", error: e.message });
                  }
                }
              })().catch(err => console.error("[assistant] Retry failed images error:", err));

              results.push({ type: action.type, status: "started", detail: `Retrying ${failedImages.length} failed images` });
              break;
            }

            // ── SMART REGENERATE ──
            case "smart_regenerate": {
              const sceneIds: string[] | undefined = Array.isArray(action.params?.sceneIds) ? action.params.sceneIds : undefined;
              const allImages = await storage.getImagesByProject(project.id);
              const failedImages = allImages.filter(img => img.status === "failed" && (!sceneIds || sceneIds.includes(img.sceneId)));

              if (failedImages.length === 0) {
                results.push({ type: action.type, status: "completed", detail: "No failed images for smart regeneration" });
                break;
              }

              smartRegenProgress.set(project.id, { status: "analyzing", total: failedImages.length, completed: 0, failed: 0, detail: `Analyzing ${failedImages.length} failed images...` });

              const imgModel = (action.params?.imageModel as ImageModelId) || undefined;
              const storyBible = await getStoryBible(project.id);

              (async () => {
                let completed = 0;
                let failedCount = 0;
                for (const img of failedImages) {
                  try {
                    const scene = await storage.getScene(img.sceneId);
                    let improvedPrompt = img.prompt;
                    if (img.error && scene) {
                      try {
                        const shotLabelsArr: string[] = (() => { try { return scene.shotLabels ? JSON.parse(scene.shotLabels) : []; } catch { return []; } })();
                        const shotLbl = shotLabelsArr[img.variant - 1] || "Cinematic Shot";
                        improvedPrompt = await analyzeAndImprovePrompt(img.prompt, scene.sceneDescription || "", shotLbl, scene.mood || "cinematic", storyBible, userKeys.anthropic);
                      } catch { /* fallback to original prompt */ }
                    }
                    await storage.updateImage(img.id, { status: "generating", imageUrl: null, error: null });
                    const charRefUrls = scene ? await getCharacterReferenceUrlsForScene(project.id, scene) : [];
                    const { taskId, finalPrompt } = await generateImageWithAutoRetry(improvedPrompt, charRefUrls.length > 0 ? charRefUrls : undefined, imgModel, userKeys.evolink, userKeys.anthropic);
                    await storage.updateImage(img.id, { status: "generating", taskId, prompt: finalPrompt });
                    completed++;
                    smartRegenProgress.set(project.id, { status: "generating", total: failedImages.length, completed, failed: failedCount, detail: `Submitted ${completed}/${failedImages.length}` });
                  } catch (e: any) {
                    failedCount++;
                    await storage.updateImage(img.id, { status: "failed", error: e.message });
                    smartRegenProgress.set(project.id, { status: "generating", total: failedImages.length, completed, failed: failedCount, detail: `${completed} submitted, ${failedCount} failed` });
                  }
                }
                smartRegenProgress.set(project.id, { status: "complete", total: failedImages.length, completed, failed: failedCount, detail: `Done: ${completed} submitted, ${failedCount} failed` });
              })().catch(err => console.error("[assistant] Smart regen error:", err));

              results.push({ type: action.type, status: "started", detail: `Smart regenerating ${failedImages.length} failed images with AI-improved prompts` });
              break;
            }

            // ── EDIT CHARACTER ──
            case "edit_character": {
              const analysis = project.analysis as any;
              if (!analysis?.characters) {
                results.push({ type: action.type, status: "error", detail: "No characters in story bible — analyze the project first" });
                break;
              }
              const charIdx = analysis.characters.findIndex((c: any) => c.name.toLowerCase() === action.params.characterName?.toLowerCase());
              if (charIdx === -1) {
                results.push({ type: action.type, status: "error", detail: `Character "${action.params.characterName}" not found in story bible` });
                break;
              }
              const existingChar = analysis.characters[charIdx];
              const updatedChars = [...analysis.characters];
              if (action.params.changes) {
                updatedChars[charIdx] = {
                  ...existingChar,
                  description: action.params.newDescription || existingChar.description,
                  appearance: action.params.newAppearance || existingChar.appearance,
                };
              }
              const updatedAnalysis = { ...analysis, characters: updatedChars };
              await storage.updateProject(project.id, { analysis: updatedAnalysis });
              storyBibleCache.delete(project.id);
              results.push({ type: action.type, status: "completed", detail: `Updated character "${action.params.characterName}" in story bible` });
              break;
            }

            // ── REGENERATE CHARACTER REFS ──
            case "regenerate_character_refs": {
              const charName = action.params.characterName;
              const analysis = project.analysis as any;
              const character = analysis?.characters?.find((c: any) => c.name.toLowerCase() === charName?.toLowerCase());
              if (!character) {
                results.push({ type: action.type, status: "error", detail: `Character "${charName}" not found` });
                break;
              }

              const existingRefs = (await storage.getCharacterReferencesByProject(project.id)).filter(r => r.characterName === character.name);
              const angles = [
                { key: "front", desc: "front-facing portrait" },
                { key: "three-quarter", desc: "three-quarter view" },
                { key: "profile", desc: "side profile" },
              ];

              (async () => {
                for (const angle of angles) {
                  try {
                    const prompt = `Photorealistic ${angle.desc} portrait of ${character.name}: ${character.appearance}. ${character.signatureFeatures || ""}. Studio lighting, neutral background, Unreal Engine 5 quality.`;
                    const { taskId } = await generateImageWithAutoRetry(prompt, undefined, undefined, userKeys.evolink, userKeys.anthropic);
                    const existingRef = existingRefs.find(r => (r.angle || "front") === angle.key);
                    if (existingRef) {
                      await storage.updateCharacterReference(existingRef.id, { status: "generating", taskId, prompt, imageUrl: null });
                    } else {
                      await storage.createCharacterReference({
                        projectId: project.id, characterName: character.name, description: character.appearance,
                        prompt, status: "generating", taskId, imageUrl: null, angle: angle.key,
                      });
                    }
                  } catch (err: any) {
                    console.error(`[assistant] Char ref failed ${character.name} ${angle.key}:`, err.message);
                  }
                }
              })().catch(err => console.error("[assistant] Char ref error:", err));

              results.push({ type: action.type, status: "started", detail: `Regenerating 3 reference portraits for "${character.name}"` });
              break;
            }

            // ── EDIT SCRIPT ──
            case "edit_script": {
              if (action.params.newScript && typeof action.params.newScript === "string") {
                await storage.updateProject(project.id, { script: action.params.newScript });
                results.push({ type: action.type, status: "completed", detail: `Script updated (${action.params.newScript.length} chars). Re-analyze to regenerate scenes.` });
              } else {
                results.push({ type: action.type, status: "error", detail: "newScript parameter required with the full updated script text" });
              }
              break;
            }

            // ── UPDATE SCENE ──
            case "update_scene": {
              const scene = await storage.getScene(action.params.sceneId);
              if (!scene) { results.push({ type: action.type, status: "error", detail: "Scene not found" }); break; }

              const updates: any = {};
              if (action.params.updates?.sceneDescription) updates.sceneDescription = action.params.updates.sceneDescription;
              if (action.params.updates?.mood) updates.mood = action.params.updates.mood;
              if (action.params.updates?.location) updates.location = action.params.updates.location;
              if (action.params.updates?.timeOfDay) updates.timeOfDay = action.params.updates.timeOfDay;
              if (action.params.updates?.cameraAngle) updates.cameraAngle = action.params.updates.cameraAngle;

              if (Object.keys(updates).length > 0) {
                await storage.updateScene(scene.id, updates);
                results.push({ type: action.type, status: "completed", detail: `Updated scene metadata: ${Object.keys(updates).join(", ")}` });
              } else {
                results.push({ type: action.type, status: "error", detail: "No valid updates provided" });
              }
              break;
            }

            // ── GENERATE VIDEO ──
            case "generate_video":
            case "regenerate_video": {
              const img = await storage.getImageById(action.params.imageId);
              if (!img) { results.push({ type: action.type, status: "error", detail: "Image not found" }); break; }
              if (!img.imageUrl || img.status !== "completed") { results.push({ type: action.type, status: "error", detail: "Image must be completed first" }); break; }

              const videoModel = (action.params.videoModel as VideoModelId) || "grok";
              const modelConfig = getVideoModelConfig(videoModel);
              const scene = await storage.getScene(img.sceneId);
              const storyBible = await getStoryBible(project.id);

              let shotLabel = `Shot ${img.variant}`;
              try { if (scene?.shotLabels) { const labels = JSON.parse(scene.shotLabels); if (labels[img.variant - 1]) shotLabel = labels[img.variant - 1]; } } catch {}

              let videoPromptFinal: string;
              try {
                videoPromptFinal = await generateSmartMotionPrompt(img.prompt, scene?.sceneDescription || scene?.sentence || "", shotLabel, scene?.mood || "cinematic", action.params.feedback || img.videoPrompt, modelConfig.duration, storyBible, videoModel, userKeys.anthropic);
              } catch {
                videoPromptFinal = buildVideoPrompt(img.videoPrompt, img.prompt);
              }

              const result = await generateVideoWithAutoRetry(img.imageUrl, videoPromptFinal, videoModel, undefined, userKeys.evolink, userKeys.anthropic);
              storage.addProjectCost(project.id, "videoGenerationCost", modelConfig.costPerClip).catch(() => {});

              if (result.videoUrl) {
                await storage.updateImage(img.id, { videoStatus: "completed", videoTaskId: result.taskId, videoUrl: result.videoUrl, videoModel, videoPromptSent: result.finalPrompt, videoError: null });
              } else {
                await storage.updateImage(img.id, { videoStatus: "generating", videoTaskId: result.taskId, videoUrl: null, videoModel, videoPromptSent: result.finalPrompt, videoError: null });
              }

              results.push({ type: action.type, status: "started", detail: `Generating ${modelConfig.name} video (~$${modelConfig.costPerClip.toFixed(3)})` });
              break;
            }

            // ── ANIMATE SCENE VIDEOS ──
            case "animate_scene_videos": {
              const scene = await storage.getScene(action.params.sceneId);
              if (!scene) { results.push({ type: action.type, status: "error", detail: "Scene not found" }); break; }

              const videoModel = (action.params.videoModel as VideoModelId) || "grok";
              const modelConfig = getVideoModelConfig(videoModel);
              const sceneImages = (await storage.getImagesByProject(project.id)).filter(img => img.sceneId === scene.id && img.status === "completed" && img.imageUrl);

              if (sceneImages.length === 0) {
                results.push({ type: action.type, status: "error", detail: "No completed images in this scene to animate" });
                break;
              }

              const storyBible = await getStoryBible(project.id);
              const shotLabels: string[] = (() => { try { return scene.shotLabels ? JSON.parse(scene.shotLabels) : []; } catch { return []; } })();

              (async () => {
                for (const img of sceneImages) {
                  try {
                    const shotLabel = shotLabels[img.variant - 1] || `Shot ${img.variant}`;
                    let videoPromptFinal: string;
                    try {
                      videoPromptFinal = await generateSmartMotionPrompt(img.prompt, scene.sceneDescription || scene.sentence, shotLabel, scene.mood || "cinematic", img.videoPrompt, modelConfig.duration, storyBible, videoModel, userKeys.anthropic);
                    } catch {
                      videoPromptFinal = buildVideoPrompt(img.videoPrompt, img.prompt);
                    }
                    const result = await generateVideoWithAutoRetry(img.imageUrl!, videoPromptFinal, videoModel, undefined, userKeys.evolink, userKeys.anthropic);
                    storage.addProjectCost(project.id, "videoGenerationCost", modelConfig.costPerClip).catch(() => {});
                    if (result.videoUrl) {
                      await storage.updateImage(img.id, { videoStatus: "completed", videoTaskId: result.taskId, videoUrl: result.videoUrl, videoModel, videoPromptSent: result.finalPrompt, videoError: null });
                    } else {
                      await storage.updateImage(img.id, { videoStatus: "generating", videoTaskId: result.taskId, videoUrl: null, videoModel, videoPromptSent: result.finalPrompt, videoError: null });
                    }
                  } catch (e: any) {
                    console.error(`[assistant] Video gen failed for ${img.id}:`, e);
                    await storage.updateImage(img.id, { videoStatus: "failed", videoModel, videoError: e.message });
                  }
                }
              })().catch(err => console.error("[assistant] Animate scene error:", err));

              results.push({ type: action.type, status: "started", detail: `Animating ${sceneImages.length} images with ${modelConfig.name} (~$${(sceneImages.length * modelConfig.costPerClip).toFixed(2)} total)` });
              break;
            }

            // ── ANIMATE ALL VIDEOS ──
            case "animate_all_videos": {
              const videoModel = (action.params.videoModel as VideoModelId) || "grok";
              const modelConfig = getVideoModelConfig(videoModel);
              const allImages = await storage.getImagesByProject(project.id);
              const eligible = allImages.filter(img => img.status === "completed" && img.imageUrl && (!img.videoStatus || img.videoStatus === "failed"));

              if (eligible.length === 0) {
                results.push({ type: action.type, status: "completed", detail: "No eligible images to animate" });
                break;
              }

              const scenes = await storage.getScenesByProject(project.id);
              const sceneMap = new Map(scenes.map((s: any) => [s.id, s]));
              const storyBible = await getStoryBible(project.id);

              (async () => {
                const BATCH_SIZE = 5;
                for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
                  const batch = eligible.slice(i, i + BATCH_SIZE);
                  await Promise.allSettled(batch.map(async (img) => {
                    try {
                      const scene = sceneMap.get(img.sceneId);
                      let shotLabel = `Shot ${img.variant}`;
                      try { if (scene?.shotLabels) { const labels = JSON.parse(scene.shotLabels); if (labels[img.variant - 1]) shotLabel = labels[img.variant - 1]; } } catch {}

                      let videoPromptFinal: string;
                      try {
                        videoPromptFinal = await generateSmartMotionPrompt(img.prompt, scene?.sceneDescription || scene?.sentence || "", shotLabel, scene?.mood || "cinematic", img.videoPrompt, modelConfig.duration, storyBible, videoModel, userKeys.anthropic);
                      } catch {
                        videoPromptFinal = buildVideoPrompt(img.videoPrompt, img.prompt);
                      }

                      const result = await generateVideoWithAutoRetry(img.imageUrl!, videoPromptFinal, videoModel, undefined, userKeys.evolink, userKeys.anthropic);
                      storage.addProjectCost(project.id, "videoGenerationCost", modelConfig.costPerClip).catch(() => {});
                      if (result.videoUrl) {
                        await storage.updateImage(img.id, { videoStatus: "completed", videoTaskId: result.taskId, videoUrl: result.videoUrl, videoModel, videoPromptSent: result.finalPrompt, videoError: null });
                      } else {
                        await storage.updateImage(img.id, { videoStatus: "generating", videoTaskId: result.taskId, videoUrl: null, videoModel, videoPromptSent: result.finalPrompt, videoError: null });
                      }
                    } catch (e: any) {
                      console.error(`[assistant] Animate-all failed for ${img.id}:`, e);
                      await storage.updateImage(img.id, { videoStatus: "failed", videoModel, videoError: e.message });
                    }
                  }));
                  if (i + BATCH_SIZE < eligible.length) await new Promise(r => setTimeout(r, 1000));
                }
              })().catch(err => console.error("[assistant] Animate-all error:", err));

              results.push({ type: action.type, status: "started", detail: `Animating ${eligible.length} images with ${modelConfig.name} (~$${(eligible.length * modelConfig.costPerClip).toFixed(2)} total)` });
              break;
            }

            // ── REMOVE VIDEO ──
            case "remove_video": {
              const img = await storage.getImageById(action.params.imageId);
              if (!img) { results.push({ type: action.type, status: "error", detail: "Image not found" }); break; }
              await storage.updateImage(img.id, { videoUrl: null, videoStatus: null, videoTaskId: null });
              results.push({ type: action.type, status: "completed", detail: `Removed video from image (variant ${img.variant})` });
              break;
            }

            // ── GENERATE VOICEOVER ──
            case "generate_voiceover": {
              results.push({ type: action.type, status: "noted", detail: "Voiceover generation should be triggered from the Voiceover page for full voice selection control." });
              break;
            }

            default:
              results.push({ type: action.type, status: "unknown", detail: `Unknown action type: ${action.type}` });
          }
        } catch (actionErr: any) {
          results.push({ type: action.type, status: "error", detail: actionErr.message });
        }
      }

      res.json({ status: "executed", results });
    } catch (err: any) {
      console.error("Assistant execute error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}

import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { analyzeFullStory, generateSequencePrompts, analyzeAndImprovePrompt, applyFeedbackToPrompt, generateSmartMotionPrompt, generateMotionPromptWithFeedback, type VisualScene, type StoryBible } from "./ai-analyzer";
import { generateImage, checkImageStatus, generateVideo, checkVideoStatus, VIDEO_MODELS, getVideoModelConfig, IMAGE_MODELS, getImageModelConfig, type VideoModelId, type ImageModelId } from "./nanobanana";
import { insertProjectSchema, insertNicheSchema, type ScriptAnalysis } from "@shared/schema";
import { extractChannelTranscripts, extractSelectedVideoTranscripts, getChannelVideos } from "./youtube";
import { streamExportPDF } from "./pdf-export";
import archiver from "archiver";
import { Readable } from "stream";
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
    return `${cleaned} Maintain exact subject appearance and design throughout. Gentle continuous motion only, no morphing or transformation.`;
  }
  const subjectHint = extractSubjectHint(imagePrompt);
  return `${subjectHint}Slow cinematic push-in with steady framing. Subtle natural motion — gentle atmospheric movement, soft light shifts. Maintain exact subject design and proportions throughout, no morphing or shape changes.`;
}

function extractSubjectHint(imagePrompt: string): string {
  const lower = imagePrompt.toLowerCase();
  if (lower.includes("aircraft") || lower.includes("fighter") || lower.includes("bomber") || lower.includes("plane") || lower.includes("jet") || lower.includes("mustang") || lower.includes("spitfire") || lower.includes("messerschmitt") || lower.includes("p-51") || lower.includes("p-47") || lower.includes("f4u") || lower.includes("b-17") || lower.includes("b-29") || lower.includes("zero") || lower.includes("corsair")) {
    return "Aircraft maintains exact design, wing shape, and markings throughout. ";
  }
  if (lower.includes("ship") || lower.includes("carrier") || lower.includes("destroyer") || lower.includes("battleship") || lower.includes("submarine") || lower.includes("vessel") || lower.includes("cruiser")) {
    return "Vessel maintains exact hull shape and superstructure throughout. ";
  }
  if (lower.includes("tank") || lower.includes("vehicle") || lower.includes("truck") || lower.includes("jeep") || lower.includes("halftrack")) {
    return "Vehicle maintains exact design and proportions throughout. ";
  }
  return "";
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
        const completed = images.filter(img => img.status === "completed").length;
        const generating = images.filter(img => img.status === "generating");
        if (generating.length > 0) {
          for (const img of generating) {
            await storage.updateImage(img.id, { status: "failed" });
          }
        }
        const finalStatus = completed > 0 ? "completed" : "analyzed";
        await storage.updateProject(p.id, { status: finalStatus });
        console.log(`Recovered stale generating project ${p.id}: ${completed} completed, ${generating.length} stuck images marked failed, status → ${finalStatus}`);
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

        } catch (err: any) {
          console.error(`Niche extraction error for ${niche.id}:`, err);
          await storage.updateNiche(niche.id, { status: "failed" });
          nicheTrainingProgress.set(niche.id, { step: "error", detail: err.message, current: 0, total: 1, extractedVideos: extractedVideosList });
        }
      })();

    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/niches/:id/analyze", async (req, res) => {
    try {
      const userKeys = extractUserKeys(req);
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

        } catch (err: any) {
          console.error(`Niche analysis error for ${niche.id}:`, err);
          await storage.updateNiche(niche.id, { status: "failed" });
          nicheTrainingProgress.set(niche.id, { step: "error", detail: err.message, current: 0, total: 1 });
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

      (async () => {
        try {
          let finalPrompt = ref.prompt;
          if (feedback && feedback.trim()) {
            console.log(`[char-ref] Applying feedback to portrait ${ref.characterName}: "${feedback}"`);
            finalPrompt = await applyFeedbackToPrompt(ref.prompt, feedback, true, undefined, userKeys.anthropic);
            console.log(`[char-ref] Modified prompt generated (${finalPrompt.length} chars)`);
          }
          const { taskId } = await generateImage(finalPrompt, undefined, imgModel, userKeys.evolink);
          await storage.updateCharacterReference(ref.id, { status: "generating", taskId, prompt: finalPrompt });
        } catch (err: any) {
          console.error(`[char-ref] Feedback regeneration failed for ${ref.characterName}:`, err.message);
          try {
            const { taskId } = await generateImage(ref.prompt, undefined, imgModel, userKeys.evolink);
            await storage.updateCharacterReference(ref.id, { status: "generating", taskId });
          } catch {
            await storage.updateCharacterReference(ref.id, { status: "failed" });
          }
        }
      })();
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

      const angles: { key: string; label: string; poseInstruction: string }[] = [
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
          key: "profile",
          label: "Side Profile",
          poseInstruction: "side profile view (90 degrees turned), showing the full silhouette of the face, nose, jawline, and body from the side, looking straight ahead not toward camera",
        },
      ];

      const refs = [];
      for (const char of analysis.characters) {
        for (const angle of angles) {
          const prompt = `Unreal Engine 5 cinematic 3D render, high-fidelity CGI character reference sheet with slight stylization — NOT a photograph, ultra-detailed, 16:9 widescreen. FULL BODY STANDING PORTRAIT of ${char.name} — ${angle.label} — showing head to feet, entire body visible. ${char.appearance}. ${char.signatureFeatures ? `SIGNATURE FEATURES: ${char.signatureFeatures}.` : ""} Shot type: full-body standing pose, ${angle.poseInstruction}. The ENTIRE body from head to boots/shoes must be visible — do NOT crop at waist or chest. Clean solid neutral dark gray background with soft cinematic studio lighting — bright key light from upper right at 45 degrees, cool fill from left, strong rim light outlining the full body silhouette. Expression: neutral-confident, conveying authority and presence. High-fidelity CGI skin with subsurface scattering, highly detailed facial features clearly visible, detailed fabric textures on clothing/uniform with every button, insignia, pocket and accessory rendered accurately, detailed hands and footwear. This is a CHARACTER REFERENCE IMAGE (${angle.label}) — the purpose is to establish exactly what this character looks like from this specific angle for visual consistency in later scenes. Unreal Engine 5 quality render, NOT a real photograph. No text, no watermarks, no UI elements.`;

          const { taskId } = await generateImage(prompt, undefined, imgModel, userKeys.evolink);
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

  async function getCharacterReferenceUrlsForScene(projectId: string, scene: { context?: string | null; characters?: any }): Promise<string[]> {
    let charactersPresent: string[] = [];
    if (scene.context) {
      try {
        const ctx = JSON.parse(scene.context as string);
        charactersPresent = ctx.charactersPresent || [];
      } catch {}
    }
    if (charactersPresent.length === 0 && Array.isArray(scene.characters)) {
      charactersPresent = scene.characters;
    }
    if (charactersPresent.length === 0) return [];

    const refs = await storage.getCharacterReferencesByProject(projectId);
    const angleOrder = ["front", "three-quarter", "profile"];
    const maxRefs = 3;

    const charRefMap: Map<string, string[]> = new Map();
    for (const charName of charactersPresent) {
      const charRefs = refs
        .filter(r => r.status === "completed" && r.imageUrl && r.characterName.toLowerCase() === charName.toLowerCase())
        .sort((a, b) => angleOrder.indexOf(a.angle || "front") - angleOrder.indexOf(b.angle || "front"));
      if (charRefs.length > 0) {
        charRefMap.set(charName, charRefs.map(r => r.imageUrl!));
      }
    }

    if (charRefMap.size === 0) return [];

    const urls: string[] = [];
    const perChar = Math.max(1, Math.floor(maxRefs / charRefMap.size));
    for (const [, charUrls] of charRefMap) {
      urls.push(...charUrls.slice(0, perChar));
    }
    if (urls.length < maxRefs) {
      for (const [, charUrls] of charRefMap) {
        for (const url of charUrls) {
          if (!urls.includes(url) && urls.length < maxRefs) {
            urls.push(url);
          }
        }
      }
    }
    return urls.slice(0, maxRefs);
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
      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });

      if (analysisRunning.has(project.id) || project.status === "analyzing") {
        return res.json({ status: "already_running", message: "Analysis is already in progress." });
      }

      analysisRunning.add(project.id);

      await storage.updateProject(project.id, { status: "analyzing" });
      await setProgressDb(project.id, "reading", "Reading and parsing your complete story...", 1, 5);

      res.json({ status: "started", message: "Analysis started. Poll progress for updates." });

      (async () => {
        try {
          await setProgressDb(project.id, "comprehending", "AI is reading your entire script to understand the full story - characters, narrative arc, visual flow...", 2, 5);
          const { storyBible, visualScenes } = await analyzeFullStory(
            project.script,
            async (detail, current, total) => {
              await setProgressDb(project.id, "comprehending", detail, current, total);
            },
            userKeys.anthropic,
          );

          storyBibleCache.set(project.id, storyBible);
          visualScenesCache.set(project.id, visualScenes);

          const analysis = storyBible.analysis;
          const charCount = analysis.characters?.length || 0;
          const jetCount = analysis.jets?.length || 0;
          const locCount = analysis.locations?.length || 0;
          const sceneCount = visualScenes.filter(s => s.isVisual).length;
          await setProgressDb(project.id, "analyzed", `Story understood: ${charCount} characters, ${jetCount} aircraft, ${locCount} locations, ${sceneCount} visual beats identified`, 3, 5);

          await storage.updateProject(project.id, { analysis: analysis as any });

          await storage.deleteImagesByProject(project.id);
          await storage.deleteScenesByProject(project.id);
          await storage.deleteCharacterReferencesByProject(project.id);

          const visualOnlyScenes = visualScenes.filter(s => s.isVisual);
          const totalPromptSteps = visualOnlyScenes.length;

          let completedPrompts = 0;
          await setProgressDb(
            project.id,
            "prompts",
            `Crafting image sequences for all ${totalPromptSteps} scenes in parallel...`,
            0,
            totalPromptSteps
          );

          const promptResults = await Promise.all(
            visualOnlyScenes.map(async (vs, index) => {
              const prevVs = index > 0 ? visualOnlyScenes[index - 1] : null;
              const nextVs = index < visualOnlyScenes.length - 1 ? visualOnlyScenes[index + 1] : null;

              let seqResult;
              try {
                seqResult = await generateSequencePrompts(
                  vs, index, visualOnlyScenes.length, storyBible, prevVs, nextVs, visualOnlyScenes,
                userKeys.anthropic,
              );
              } catch (promptErr: any) {
                console.error(`Scene ${index + 1} prompt generation failed: ${promptErr.message}. Using fallback prompts.`);
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

              completedPrompts++;
              await setProgressDb(
                project.id,
                "prompts",
                `Completed ${completedPrompts}/${totalPromptSteps} scene prompts...`,
                completedPrompts,
                totalPromptSteps
              );

              return { index, vs, seqResult };
            })
          );

          promptResults.sort((a, b) => a.index - b.index);

          let createdCount = 0;
          for (const { index, vs, seqResult } of promptResults) {
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
          const estimatedAnalysisCost = Math.max(0.10, (scriptWordCount / 1000) * 0.15 + createdCount * 0.05);
          storage.addProjectCost(project.id, "analysisCost", parseFloat(estimatedAnalysisCost.toFixed(4))).catch(() => {});

          await storage.updateProject(project.id, {
            status: "analyzed",
          });
          await setProgressDb(project.id, "complete", `Analysis complete! ${createdCount} scenes created.`, totalPromptSteps, totalPromptSteps);
          console.log(`Analysis complete for project ${project.id}: ${createdCount} scenes, est. analysis cost: $${estimatedAnalysisCost.toFixed(4)}`);

          if (analysis.characters && analysis.characters.length > 0) {
            try {
              const existingRefs = await storage.getCharacterReferencesByProject(project.id);
              if (existingRefs.length === 0) {
                const autoAngles = [
                  { key: "front", label: "Front View", poseInstruction: "facing directly toward camera, symmetrical straight-on front view, direct eye contact, arms relaxed at sides" },
                  { key: "three-quarter", label: "Three-Quarter View", poseInstruction: "facing three-quarter angle toward camera (45 degrees turned), face clearly visible with direct eye contact, natural relaxed pose" },
                  { key: "profile", label: "Side Profile", poseInstruction: "side profile view (90 degrees turned), showing the full silhouette of the face, nose, jawline, and body from the side, looking straight ahead not toward camera" },
                ];
                const totalPortraits = analysis.characters.length * autoAngles.length;
                console.log(`[auto-portraits] Generating ${totalPortraits} character portraits (${analysis.characters.length} chars × ${autoAngles.length} angles) for project ${project.id}`);
                for (const char of analysis.characters) {
                  for (const angle of autoAngles) {
                    const portraitPrompt = `Unreal Engine 5 cinematic 3D render, high-fidelity CGI character reference sheet with slight stylization — NOT a photograph, ultra-detailed, 16:9 widescreen. FULL BODY STANDING PORTRAIT of ${char.name} — ${angle.label} — showing head to feet, entire body visible. ${char.appearance}. ${char.signatureFeatures ? `SIGNATURE FEATURES: ${char.signatureFeatures}.` : ""} Shot type: full-body standing pose, ${angle.poseInstruction}. The ENTIRE body from head to boots/shoes must be visible — do NOT crop at waist or chest. Clean solid neutral dark gray background with soft cinematic studio lighting — bright key light from upper right at 45 degrees, cool fill from left, strong rim light outlining the full body silhouette. Expression: neutral-confident, conveying authority and presence. High-fidelity CGI skin with subsurface scattering, highly detailed facial features clearly visible, detailed fabric textures on clothing/uniform with every button, insignia, pocket and accessory rendered accurately, detailed hands and footwear. This is a CHARACTER REFERENCE IMAGE (${angle.label}) — the purpose is to establish exactly what this character looks like from this specific angle for visual consistency in later scenes. Unreal Engine 5 quality render, NOT a real photograph. No text, no watermarks, no UI elements.`;
                    try {
                      const { taskId } = await generateImage(portraitPrompt, undefined, undefined, userKeys.evolink);
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
        } catch (err: any) {
          console.error("Analysis error:", err);
          await setProgressDb(project.id, "error", err.message || "Analysis failed unexpectedly.", 0, 5);
          try {
            await storage.updateProject(project.id, { status: "draft" });
          } catch {}
        } finally {
          analysisRunning.delete(project.id);
        }
      })();

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

      if (prompts.length < 2) {
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
        const videoPromptText = motionPrompts[variant - 1] || "Cinematic slow camera motion with subtle parallax depth, smooth atmospheric movement";

        try {
          const sceneGenModelConfig = getImageModelConfig(imgModel);
          const { taskId } = await generateImage(prompt, charRefUrls.length > 0 ? charRefUrls : undefined, imgModel, userKeys.evolink);
          storage.addProjectCost(project.id, "imageGenerationCost", sceneGenModelConfig.costPerImage).catch(() => {});
          const img = await storage.createImage({
            sceneId: scene.id,
            projectId: project.id,
            variant,
            prompt,
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
      }

      const scenes = await storage.getScenesByProject(project.id);
      scenes.sort((a, b) => a.sentenceIndex - b.sentenceIndex);

      const allJobs: Array<{ scene: typeof scenes[0]; sceneIndex: number; prompts: string[]; motionPrompts: string[] }> = [];
      for (let si = 0; si < scenes.length; si++) {
        const scene = scenes[si];

        const existingImages = await storage.getImagesByScene(scene.id);
        if (!forceRegenerate) {
          const hasCompleted = existingImages.some((img) => img.status === "completed");
          if (hasCompleted) continue;
        }

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

        if (prompts.length < 2) {
          const storyBible = await getStoryBible(project.id);
          const cachedVisualScenes = visualScenesCache.get(project.id);

          if (storyBible && cachedVisualScenes && cachedVisualScenes[si]) {
            const vs = cachedVisualScenes[si];
            const prevVs = si > 0 ? cachedVisualScenes[si - 1] : null;
            const nextVs = si < cachedVisualScenes.length - 1 ? cachedVisualScenes[si + 1] : null;

            const seqResult = await generateSequencePrompts(
              vs, si, cachedVisualScenes.length, storyBible, prevVs, nextVs, cachedVisualScenes,
            userKeys.anthropic,
          );
            prompts = seqResult.prompts;
            motionPrompts = seqResult.motionPrompts;
          }
        }

        if (prompts.length < 2) continue;
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
            videoPrompt: job.motionPrompts[variant - 1] || "Cinematic slow camera motion with subtle parallax depth, smooth atmospheric movement",
            charRefUrls: refUrls,
          });
        }
      }

      if (imageQueue.length === 0) {
        return res.json({ started: false, message: "No images to generate. All scenes already have completed images." });
      }

      const WAVE_SIZE = 50;
      const SUBMIT_BATCH_SIZE = 10;
      const SUBMIT_DELAY_MS = 500;
      const totalWaves = Math.ceil(imageQueue.length / WAVE_SIZE);

      const progress: GenerationProgress = {
        status: "submitting",
        totalImages: imageQueue.length,
        submitted: 0,
        completed: 0,
        failed: 0,
        currentBatch: 0,
        totalBatches: totalWaves,
        detail: `Starting generation of ${imageQueue.length} images in ${totalWaves} waves of up to ${WAVE_SIZE}...`,
        startedAt: Date.now(),
      };
      generationProgressMap.set(project.id, progress);
      await storage.updateProject(project.id, { status: "generating" });

      res.json({ started: true, total: imageQueue.length, batches: totalWaves, progress });

      (async () => {
        const MAX_CONSECUTIVE_FAILS = 10;
        let consecutiveFailCount = 0;
        let shouldStop = false;
        let stopReason = "";
        let isCriticalError = false;

        console.log(`[generate-all] Processing ${imageQueue.length} images in ${totalWaves} waves of ${WAVE_SIZE}`);

        for (let waveIdx = 0; waveIdx < imageQueue.length; waveIdx += WAVE_SIZE) {
          if (shouldStop) break;

          const wave = imageQueue.slice(waveIdx, waveIdx + WAVE_SIZE);
          const waveNum = Math.floor(waveIdx / WAVE_SIZE) + 1;
          progress.currentBatch = waveNum;

          console.log(`[generate-all] === Wave ${waveNum}/${totalWaves}: submitting ${wave.length} images ===`);
          progress.status = "submitting";
          progress.detail = `Wave ${waveNum}/${totalWaves}: Submitting ${wave.length} images...`;

          const waveImageIds: string[] = [];

          for (let i = 0; i < wave.length; i += SUBMIT_BATCH_SIZE) {
            if (isCriticalError) {
              for (let j = i; j < wave.length; j++) {
                const item = wave[j];
                await storage.createImage({
                  sceneId: item.sceneId,
                  projectId: item.projectId,
                  variant: item.variant,
                  prompt: item.prompt,
                  status: "pending",
                  taskId: null,
                  imageUrl: null,
                  videoPrompt: item.videoPrompt,
                });
              }
              break;
            }

            const submitBatch = wave.slice(i, i + SUBMIT_BATCH_SIZE);

            for (const item of submitBatch) {
              if (isCriticalError) {
                await storage.createImage({
                  sceneId: item.sceneId,
                  projectId: item.projectId,
                  variant: item.variant,
                  prompt: item.prompt,
                  status: "pending",
                  taskId: null,
                  imageUrl: null,
                  videoPrompt: item.videoPrompt,
                });
                continue;
              }

              try {
                const modelConfig = getImageModelConfig(imgModel);
                const { taskId } = await generateImage(item.prompt, item.charRefUrls.length > 0 ? item.charRefUrls : undefined, imgModel, userKeys.evolink);
                const img = await storage.createImage({
                  sceneId: item.sceneId,
                  projectId: item.projectId,
                  variant: item.variant,
                  prompt: item.prompt,
                  status: "generating",
                  taskId,
                  imageUrl: null,
                  videoPrompt: item.videoPrompt,
                });
                waveImageIds.push(img.id);
                progress.submitted++;
                consecutiveFailCount = 0;
                storage.addProjectCost(item.projectId, "imageGenerationCost", modelConfig.costPerImage).catch(() => {});
              } catch (genErr: any) {
                const errMsg = genErr.message || "";
                console.error(`[generate-all] Submit failed:`, errMsg);

                const isQuotaError = errMsg.toLowerCase().includes("insufficient") || errMsg.toLowerCase().includes("quota");
                const isAuthError = errMsg.toLowerCase().includes("api key") || errMsg.toLowerCase().includes("invalid") || errMsg.toLowerCase().includes("expired");

                if (isQuotaError || isAuthError) {
                  isCriticalError = true;
                  shouldStop = true;
                  stopReason = isQuotaError
                    ? "Insufficient credits on your EvoLink account. Please top up at evolink.ai."
                    : "API key is invalid or expired. Please check your NANOBANANA_API_KEY.";
                  console.log(`[generate-all] CRITICAL ERROR - stopping immediately: ${stopReason}`);
                  await storage.createImage({
                    sceneId: item.sceneId,
                    projectId: item.projectId,
                    variant: item.variant,
                    prompt: item.prompt,
                    status: "pending",
                    taskId: null,
                    imageUrl: null,
                    videoPrompt: item.videoPrompt,
                  });
                  continue;
                }

                await storage.createImage({
                  sceneId: item.sceneId,
                  projectId: item.projectId,
                  variant: item.variant,
                  prompt: item.prompt,
                  status: "failed",
                  taskId: null,
                  imageUrl: null,
                  videoPrompt: item.videoPrompt,
                });
                progress.failed++;
                consecutiveFailCount++;
                if (consecutiveFailCount >= MAX_CONSECUTIVE_FAILS) {
                  shouldStop = true;
                  stopReason = "Too many consecutive submission failures.";
                }
              }
            }

            progress.detail = `Wave ${waveNum}/${totalWaves}: Submitted ${Math.min(i + SUBMIT_BATCH_SIZE, wave.length)}/${wave.length} images...`;

            if (i + SUBMIT_BATCH_SIZE < wave.length && !shouldStop) {
              await new Promise(resolve => setTimeout(resolve, SUBMIT_DELAY_MS));
            }
          }

          if (isCriticalError) {
            for (let remaining = waveIdx + WAVE_SIZE; remaining < imageQueue.length; remaining++) {
              const item = imageQueue[remaining];
              await storage.createImage({
                sceneId: item.sceneId,
                projectId: item.projectId,
                variant: item.variant,
                prompt: item.prompt,
                status: "pending",
                taskId: null,
                imageUrl: null,
                videoPrompt: item.videoPrompt,
              });
            }
            break;
          }

          if (shouldStop) {
            for (let remaining = waveIdx + WAVE_SIZE; remaining < imageQueue.length; remaining++) {
              const item = imageQueue[remaining];
              await storage.createImage({
                sceneId: item.sceneId,
                projectId: item.projectId,
                variant: item.variant,
                prompt: item.prompt,
                status: "pending",
                taskId: null,
                imageUrl: null,
                videoPrompt: item.videoPrompt,
              });
            }
            break;
          }

          console.log(`[generate-all] Wave ${waveNum} submitted ${waveImageIds.length} images. Now waiting for rendering...`);
          progress.status = "polling";
          progress.detail = `Wave ${waveNum}/${totalWaves}: Waiting for ${waveImageIds.length} images to render...`;

          const POLL_INTERVAL = 5000;
          const WAVE_TIMEOUT = 10 * 60 * 1000;
          const wavePollStart = Date.now();

          while (Date.now() - wavePollStart < WAVE_TIMEOUT) {
            const allImages = await storage.getImagesByProject(project.id);
            const generating = allImages.filter(img => img.status === "generating" && img.taskId);
            const completed = allImages.filter(img => img.status === "completed").length;
            const failed = allImages.filter(img => img.status === "failed").length;

            progress.completed = completed;
            progress.failed = failed;

            const waveGenerating = generating.filter(img => waveImageIds.includes(img.id));

            if (waveGenerating.length === 0) {
              const waveCompleted = allImages.filter(img => waveImageIds.includes(img.id) && img.status === "completed").length;
              const waveFailed = allImages.filter(img => waveImageIds.includes(img.id) && img.status === "failed").length;
              console.log(`[generate-all] Wave ${waveNum} complete: ${waveCompleted} completed, ${waveFailed} failed`);
              break;
            }

            progress.detail = `Wave ${waveNum}/${totalWaves}: Rendering — ${completed} total completed, ${waveGenerating.length} still processing in this wave...`;

            const POLL_BATCH = 10;
            for (let pi = 0; pi < waveGenerating.length; pi += POLL_BATCH) {
              const pollBatch = waveGenerating.slice(pi, pi + POLL_BATCH);
              await Promise.all(
                pollBatch.map(async (img) => {
                  try {
                    const result = await checkImageStatus(img.taskId!, userKeys.evolink);
                    if (result.status === "completed" && result.imageUrl) {
                      await storage.updateImage(img.id, { status: "completed", imageUrl: result.imageUrl });
                    } else if (result.status === "failed") {
                      await storage.updateImage(img.id, { status: "failed", error: result.error || "Image generation failed" });
                    }
                  } catch (e) {}
                })
              );
            }

            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
          }

          if (Date.now() - wavePollStart >= WAVE_TIMEOUT) {
            console.log(`[generate-all] Wave ${waveNum} timed out after 10 minutes, marking remaining as failed`);
            const allImages = await storage.getImagesByProject(project.id);
            const stuckImages = allImages.filter(img => waveImageIds.includes(img.id) && img.status === "generating");
            for (const img of stuckImages) {
              await storage.updateImage(img.id, { status: "failed", error: "Generation timed out after 10 minutes" });
            }
          }

          if (waveIdx + WAVE_SIZE < imageQueue.length && !shouldStop) {
            progress.detail = `Wave ${waveNum} done. Starting wave ${waveNum + 1} in 3 seconds...`;
            await new Promise(resolve => setTimeout(resolve, 3000));
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
        console.log(`[generate-all] All waves complete: ${finalCompleted} completed, ${finalFailed} failed`);

        setTimeout(() => generationProgressMap.delete(project.id), 60000);
      })().catch(err => {
        console.error("[generate-all] Background error:", err);
        const p = generationProgressMap.get(project.id);
        if (p) {
          p.status = "error";
          p.detail = `Error: ${err.message}`;
        }
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
        if (generating > 0) {
          return res.json({
            status: "polling",
            totalImages: images.length,
            submitted: images.length,
            completed,
            failed,
            currentBatch: 0,
            totalBatches: 0,
            detail: `${completed} completed, ${generating} still rendering, ${failed} failed.`,
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
        return res.json(updated);
      } else if (result.status === "failed") {
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
        try {
          let improvedPrompt: string;
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
          const { taskId } = await generateImage(improvedPrompt, charRefUrls.length > 0 ? charRefUrls : undefined, imgModel, userKeys.evolink);
          await storage.updateImage(img.id, {
            status: "generating",
            taskId,
            prompt: improvedPrompt,
          });
          storage.addProjectCost(req.params.id, "imageGenerationCost", regenModelConfig.costPerImage).catch(() => {});
        } catch (err: any) {
          console.error(`Regeneration failed for image ${img.id}:`, err.message);
          try {
            console.log(`Falling back to original prompt for image ${img.id}`);
            const fallbackModelConfig = getImageModelConfig(imgModel);
            const { taskId } = await generateImage(img.prompt, undefined, imgModel, userKeys.evolink);
            await storage.updateImage(img.id, {
              status: "generating",
              taskId,
            });
            storage.addProjectCost(req.params.id, "imageGenerationCost", fallbackModelConfig.costPerImage).catch(() => {});
          } catch (fallbackErr: any) {
            console.error(`Fallback regeneration also failed for image ${img.id}:`, fallbackErr.message);
            await storage.updateImage(img.id, {
              status: "failed",
            });
          }
        }
      })();
    } catch (err: any) {
      console.error("Regeneration error:", err);
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
          try {
            const improvedPrompt = await applyFeedbackToPrompt(img.prompt, feedback, false, {
              sceneDescription: scene.sceneDescription || "",
              mood: scene.mood || "cinematic",
              shotLabel: (() => { try { const labels = scene.shotLabels ? JSON.parse(scene.shotLabels) : []; return labels[img.variant - 1] || "Cinematic Shot"; } catch { return "Cinematic Shot"; } })(),
              storyBible,
            }, userKeys.anthropic);
            console.log(`Scene feedback regen: Improved prompt for image ${img.id} (${improvedPrompt.length} chars)`);

            const charRefUrls = scene ? await getCharacterReferenceUrlsForScene(project.id, scene) : [];
            const scnModelConfig = getImageModelConfig(imgModel);
            const { taskId } = await generateImage(improvedPrompt, charRefUrls.length > 0 ? charRefUrls : undefined, imgModel, userKeys.evolink);
            await storage.updateImage(img.id, {
              status: "generating",
              taskId,
              prompt: improvedPrompt,
            });
            storage.addProjectCost(project.id, "imageGenerationCost", scnModelConfig.costPerImage).catch(() => {});
          } catch (err: any) {
            console.error(`Scene feedback regen failed for image ${img.id}:`, err.message);
            try {
              const fallbackScnConfig = getImageModelConfig(imgModel);
              const { taskId } = await generateImage(img.prompt, undefined, imgModel, userKeys.evolink);
              await storage.updateImage(img.id, { status: "generating", taskId });
              storage.addProjectCost(project.id, "imageGenerationCost", fallbackScnConfig.costPerImage).catch(() => {});
            } catch (fallbackErr: any) {
              console.error(`Scene feedback regen fallback also failed for image ${img.id}:`, fallbackErr.message);
              await storage.updateImage(img.id, { status: "failed" });
            }
          }
        }
      })();
    } catch (err: any) {
      console.error("Scene feedback regeneration error:", err);
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
          const { taskId } = await generateImage(img.prompt, charRefUrls.length > 0 ? charRefUrls : undefined, imgModel, userKeys.evolink);
          await storage.updateImage(img.id, { status: "generating", taskId });
          storage.addProjectCost(req.params.id, "imageGenerationCost", consistModelConfig.costPerImage).catch(() => {});
        } catch (err: any) {
          console.error(`[consistency-regen] Failed for image ${img.id}:`, err.message);
          await storage.updateImage(img.id, { status: "failed" });
        }
      })();
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
        for (const img of sceneImages) {
          try {
            const { taskId } = await generateImage(img.prompt, charRefUrls.length > 0 ? charRefUrls : undefined, imgModel, userKeys.evolink);
            await storage.updateImage(img.id, { status: "generating", taskId });
            storage.addProjectCost(project.id, "imageGenerationCost", scnConsistModelConfig.costPerImage).catch(() => {});
          } catch (err: any) {
            console.error(`[consistency-regen-scene] Failed for image ${img.id}:`, err.message);
            await storage.updateImage(img.id, { status: "failed" });
          }
        }
      })();
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

      const WAVE_SIZE = 50;
      const SUBMIT_BATCH_SIZE = 10;
      const SUBMIT_DELAY_MS = 500;
      const totalWaves = Math.ceil(retryImages.length / WAVE_SIZE);

      const progress: GenerationProgress = {
        status: "submitting",
        totalImages: retryImages.length,
        submitted: 0,
        completed: 0,
        failed: 0,
        currentBatch: 0,
        totalBatches: totalWaves,
        detail: `Retrying ${retryImages.length} failed/pending images in ${totalWaves} waves...`,
        startedAt: Date.now(),
      };
      generationProgressMap.set(project.id, progress);
      await storage.updateProject(project.id, { status: "generating" });

      res.json({ started: true, total: retryImages.length, batches: totalWaves, progress });

      (async () => {
        const MAX_CONSECUTIVE_FAILS = 10;
        let consecutiveFailCount = 0;
        let shouldStop = false;
        let stopReason = "";
        let isCriticalError = false;

        console.log(`[retry-failed] Processing ${retryImages.length} images in ${totalWaves} waves of ${WAVE_SIZE}`);

        for (let waveIdx = 0; waveIdx < retryImages.length; waveIdx += WAVE_SIZE) {
          if (shouldStop) break;

          const wave = retryImages.slice(waveIdx, waveIdx + WAVE_SIZE);
          const waveNum = Math.floor(waveIdx / WAVE_SIZE) + 1;
          progress.currentBatch = waveNum;

          console.log(`[retry-failed] === Wave ${waveNum}/${totalWaves}: submitting ${wave.length} images ===`);
          progress.status = "submitting";
          progress.detail = `Wave ${waveNum}/${totalWaves}: Submitting ${wave.length} images...`;

          const waveImageIds: string[] = [];

          for (let i = 0; i < wave.length; i += SUBMIT_BATCH_SIZE) {
            if (isCriticalError) break;

            const submitBatch = wave.slice(i, i + SUBMIT_BATCH_SIZE);

            for (const img of submitBatch) {
              if (isCriticalError) continue;

              try {
                const scene = await storage.getScene(img.sceneId);
                const charRefUrls = scene ? await getCharacterReferenceUrlsForScene(project.id, scene) : [];
                const retryModelConfig = getImageModelConfig(imgModel);
                const { taskId } = await generateImage(img.prompt, charRefUrls.length > 0 ? charRefUrls : undefined, imgModel, userKeys.evolink);
                await storage.updateImage(img.id, { status: "generating", taskId, imageUrl: null });
                waveImageIds.push(img.id);
                progress.submitted++;
                consecutiveFailCount = 0;
                storage.addProjectCost(project.id, "imageGenerationCost", retryModelConfig.costPerImage).catch(() => {});
              } catch (genErr: any) {
                const errMsg = genErr.message || "";
                console.error(`[retry-failed] Submit failed for ${img.id}:`, errMsg);

                const isQuotaError = errMsg.toLowerCase().includes("insufficient") || errMsg.toLowerCase().includes("quota");
                const isAuthError = errMsg.toLowerCase().includes("api key") || errMsg.toLowerCase().includes("invalid") || errMsg.toLowerCase().includes("expired");

                if (isQuotaError || isAuthError) {
                  isCriticalError = true;
                  shouldStop = true;
                  stopReason = isQuotaError
                    ? "Insufficient credits on your EvoLink account. Please top up at evolink.ai."
                    : "API key is invalid or expired. Please check your NANOBANANA_API_KEY.";
                  console.log(`[retry-failed] CRITICAL ERROR - stopping immediately: ${stopReason}`);
                  continue;
                }

                await storage.updateImage(img.id, { status: "failed" });
                progress.failed++;
                consecutiveFailCount++;
                if (consecutiveFailCount >= MAX_CONSECUTIVE_FAILS) {
                  shouldStop = true;
                  stopReason = "Too many consecutive submission failures.";
                }
              }
            }

            progress.detail = `Wave ${waveNum}/${totalWaves}: Submitted ${Math.min(i + SUBMIT_BATCH_SIZE, wave.length)}/${wave.length} images...`;

            if (i + SUBMIT_BATCH_SIZE < wave.length && !shouldStop) {
              await new Promise(resolve => setTimeout(resolve, SUBMIT_DELAY_MS));
            }
          }

          if (isCriticalError || shouldStop) break;

          console.log(`[retry-failed] Wave ${waveNum} submitted ${waveImageIds.length} images. Now waiting for rendering...`);
          progress.status = "polling";
          progress.detail = `Wave ${waveNum}/${totalWaves}: Waiting for ${waveImageIds.length} images to render...`;

          const POLL_INTERVAL = 5000;
          const WAVE_TIMEOUT = 10 * 60 * 1000;
          const wavePollStart = Date.now();

          while (Date.now() - wavePollStart < WAVE_TIMEOUT) {
            const currentAllImages = await storage.getImagesByProject(project.id);
            const generating = currentAllImages.filter(img => img.status === "generating" && img.taskId);
            const completed = currentAllImages.filter(img => img.status === "completed").length;
            const failed = currentAllImages.filter(img => img.status === "failed").length;

            progress.completed = completed;
            progress.failed = failed;

            const waveGenerating = generating.filter(img => waveImageIds.includes(img.id));

            if (waveGenerating.length === 0) {
              const waveCompleted = currentAllImages.filter(img => waveImageIds.includes(img.id) && img.status === "completed").length;
              const waveFailed = currentAllImages.filter(img => waveImageIds.includes(img.id) && img.status === "failed").length;
              console.log(`[retry-failed] Wave ${waveNum} complete: ${waveCompleted} completed, ${waveFailed} failed`);
              break;
            }

            progress.detail = `Wave ${waveNum}/${totalWaves}: Rendering — ${completed} total completed, ${waveGenerating.length} still processing in this wave...`;

            const POLL_BATCH = 10;
            for (let pi = 0; pi < waveGenerating.length; pi += POLL_BATCH) {
              const pollBatch = waveGenerating.slice(pi, pi + POLL_BATCH);
              await Promise.all(
                pollBatch.map(async (img) => {
                  try {
                    const result = await checkImageStatus(img.taskId!, userKeys.evolink);
                    if (result.status === "completed" && result.imageUrl) {
                      await storage.updateImage(img.id, { status: "completed", imageUrl: result.imageUrl });
                    } else if (result.status === "failed") {
                      await storage.updateImage(img.id, { status: "failed" });
                    }
                  } catch (e) {}
                })
              );
            }

            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
          }

          if (Date.now() - wavePollStart >= WAVE_TIMEOUT) {
            console.log(`[retry-failed] Wave ${waveNum} timed out after 10 minutes, marking remaining as failed`);
            const currentAllImages = await storage.getImagesByProject(project.id);
            const stuckImages = currentAllImages.filter(img => waveImageIds.includes(img.id) && img.status === "generating");
            for (const img of stuckImages) {
              await storage.updateImage(img.id, { status: "failed" });
            }
          }

          if (waveIdx + WAVE_SIZE < retryImages.length && !shouldStop) {
            progress.detail = `Wave ${waveNum} done. Starting wave ${waveNum + 1} in 3 seconds...`;
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }

        if (isCriticalError) {
          progress.status = "error";
          progress.detail = `${stopReason} ${progress.submitted} images were submitted before the error.`;
          console.log(`[retry-failed] Critical error stopped generation: ${stopReason}`);
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
        console.log(`[retry-failed] All waves complete: ${finalCompleted} completed, ${finalFailed} failed`);

        setTimeout(() => generationProgressMap.delete(project.id), 60000);
      })().catch(err => {
        console.error("[retry-failed] Background error:", err);
        const p = generationProgressMap.get(project.id);
        if (p) {
          p.status = "complete";
          p.detail = `Error: ${err.message}`;
        }
        storage.updateProject(project.id, { status: "completed" });
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

        for (const img of failedImages) {
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
            const { taskId } = await generateImage(improvedPrompt, charRefUrls.length > 0 ? charRefUrls : undefined, imgModel, userKeys.evolink);
            storage.addProjectCost(project.id, "imageGenerationCost", smartModelConfig.costPerImage).catch(() => {});
            await storage.updateImage(img.id, {
              status: "generating",
              taskId,
              prompt: improvedPrompt,
            });

            completed++;
          } catch (err: any) {
            console.error(`Smart batch regen failed for image ${img.id}:`, err.message);
            await storage.updateImage(img.id, { status: "failed" });
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
      })();

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

      const BATCH_SIZE = 5;
      const BATCH_DELAY = 1000;

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

            const effectiveDuration = (videoModel === "kling" && videoDuration) ? videoDuration : undefined;
            const result = await generateVideo(img.imageUrl!, videoPromptFinal, videoModel, effectiveDuration, userKeys.evolink);
            storage.addProjectCost(req.params.id, "videoGenerationCost", model.costPerClip).catch(() => {});
            if (result.videoUrl) {
              await storage.updateImage(img.id, {
                videoStatus: "completed",
                videoTaskId: result.taskId,
                videoUrl: result.videoUrl,
                videoModel: videoModel,
                videoPromptSent: videoPromptFinal,
                videoError: null,
              });
              console.log(`[animate-all-videos] LTX video completed immediately for image ${img.id} → ${result.videoUrl}`);
            } else {
              await storage.updateImage(img.id, {
                videoStatus: "generating",
                videoTaskId: result.taskId,
                videoUrl: null,
                videoModel: videoModel,
                videoPromptSent: videoPromptFinal,
                videoError: null,
              });
              console.log(`[animate-all-videos] Submitted video for image ${img.id} → task ${result.taskId}`);
            }
          } catch (err: any) {
            console.error(`[animate-all-videos] Failed to start video for image ${img.id}:`, err.message);
            await storage.updateImage(img.id, {
              videoStatus: "failed",
              videoModel: videoModel,
              videoError: err.message,
            });
          }
        });

        await Promise.all(batchPromises);

        if (i + BATCH_SIZE < eligible.length) {
          await new Promise((r) => setTimeout(r, BATCH_DELAY));
        }
      }

      console.log(`[animate-all-videos] Batch complete — submitted ${eligible.length} videos`);
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

      const results = [];
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
            console.log(`[animate-all] Generating AI motion prompt for image ${img.id} (${shotLabel})...`);
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

          const effectiveDuration = (videoModel === "kling" && videoDuration) ? videoDuration : undefined;
          const result = await generateVideo(img.imageUrl!, videoPromptFinal, videoModel, effectiveDuration, userKeys.evolink);
          storage.addProjectCost(req.params.id, "videoGenerationCost", model.costPerClip).catch(() => {});
          if (result.videoUrl) {
            const updated = await storage.updateImage(img.id, {
              videoStatus: "completed",
              videoTaskId: result.taskId,
              videoUrl: result.videoUrl,
              videoModel: videoModel,
              videoPromptSent: videoPromptFinal,
            });
            results.push(updated);
          } else {
            const updated = await storage.updateImage(img.id, {
              videoStatus: "generating",
              videoTaskId: result.taskId,
              videoUrl: null,
              videoModel: videoModel,
              videoPromptSent: videoPromptFinal,
            });
            results.push(updated);
          }
        } catch (err: any) {
          console.error(`Animate-all: failed to start video for image ${img.id}:`, err.message);
          await storage.updateImage(img.id, { videoStatus: "failed" });
        }
      }

      res.json({ started: results.length, total: sceneImages.length, model: model.name, costPerClip: model.costPerClip });
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

      const result = await generateVideo(img.imageUrl, videoPromptFinal, videoModel, videoDuration, userKeys.evolink);
      storage.addProjectCost(img.projectId, "videoGenerationCost", modelConfig.costPerClip).catch(() => {});
      if (result.videoUrl) {
        const updated = await storage.updateImage(img.id, {
          videoStatus: "completed",
          videoTaskId: result.taskId,
          videoUrl: result.videoUrl,
          videoModel: videoModel,
          videoPromptSent: videoPromptFinal,
          videoError: null,
        });
        res.json(updated);
      } else {
        const updated = await storage.updateImage(img.id, {
          videoStatus: "generating",
          videoTaskId: result.taskId,
          videoUrl: null,
          videoModel: videoModel,
          videoPromptSent: videoPromptFinal,
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

      const result = await generateVideo(img.imageUrl, videoPromptFinal, videoModel, videoDuration, userKeys.evolink);
      storage.addProjectCost(req.params.id, "videoGenerationCost", modelConfig.costPerClip).catch(() => {});
      if (result.videoUrl) {
        const updated = await storage.updateImage(img.id, {
          videoStatus: "completed",
          videoTaskId: result.taskId,
          videoUrl: result.videoUrl,
          videoModel: videoModel,
          videoPromptSent: videoPromptFinal,
          videoError: null,
        });
        res.json(updated);
      } else {
        const updated = await storage.updateImage(img.id, {
          videoStatus: "generating",
          videoTaskId: result.taskId,
          videoUrl: null,
          videoModel: videoModel,
          videoPromptSent: videoPromptFinal,
          videoError: null,
        });
        res.json(updated);
      }
    } catch (err: any) {
      console.error("Video regeneration with feedback error:", err);
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

            const result = await generateVideo(img.imageUrl!, videoPromptFinal, videoModel, videoDuration, userKeys.evolink);
            storage.addProjectCost(req.params.id, "videoGenerationCost", modelConfig.costPerClip).catch(() => {});
            if (result.videoUrl) {
              await storage.updateImage(img.id, {
                videoStatus: "completed",
                videoTaskId: result.taskId,
                videoUrl: result.videoUrl,
                videoModel: videoModel,
                videoPromptSent: videoPromptFinal,
                videoError: null,
              });
            } else {
              await storage.updateImage(img.id, {
                videoStatus: "generating",
                videoTaskId: result.taskId,
                videoUrl: null,
                videoModel: videoModel,
                videoPromptSent: videoPromptFinal,
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
      })();
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
            const retryResult = await generateVideo(img.imageUrl, retryPrompt, img.videoModel as any, undefined, userKeys.evolink);
            storage.addProjectCost(img.projectId, "videoGenerationCost", retryVideoConfig.costPerVideo).catch(() => {});
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
                const retryResult = await generateVideo(img.imageUrl, retryPrompt, img.videoModel as any, undefined, userKeys.evolink);
                storage.addProjectCost(img.projectId, "videoGenerationCost", retryVideoConfig2.costPerVideo).catch(() => {});
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
        } catch (checkErr) {
          console.error(`Error checking video ${img.id}:`, checkErr);
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
                return await storage.updateImage(img.id, { status: "failed" });
              }
              return img;
            } catch (checkErr) {
              console.error(`Error checking image ${img.id}:`, checkErr);
              return img;
            }
          })
        );
        results.push(...batchResults);
      }

      const allImages = await storage.getImagesByProject(req.params.id);
      const completedCount = allImages.filter((img) => img.status === "completed").length;
      const totalCount = allImages.length;

      if (completedCount === totalCount && totalCount > 0) {
        await storage.updateProject(req.params.id, { status: "completed" });
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
      archive.on("error", (err) => {
        console.error("Archive error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Archive failed" });
        }
      });
      archive.pipe(res);

      for (const item of downloadItems) {
        try {
          const upstream = await fetch(item.url, {
            headers: { "User-Agent": "ScriptVision/1.0" },
          });
          if (!upstream.ok || !upstream.body) continue;

          const chunks: Uint8Array[] = [];
          const reader = upstream.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          const buffer = Buffer.concat(chunks);
          archive.append(buffer, { name: item.filename });
        } catch (fetchErr: any) {
          console.warn(`[download] Failed to fetch ${item.filename}: ${fetchErr.message}`);
        }
      }

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

      const sceneMap = new Map(scenes.map((s) => [s.id, s]));

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
      archive.on("error", (err) => {
        console.error("Archive error:", err);
        if (!res.headersSent) res.status(500).json({ error: "Archive failed" });
      });
      archive.pipe(res);

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
          const filePath = `${projectName}_Clips/${folderName}/${fileName}`;

          try {
            const upstream = await fetch(clip.videoUrl!, {
              headers: { "User-Agent": "ScriptVision/1.0" },
            });
            if (!upstream.ok) {
              console.warn(`Failed to fetch clip ${clip.id}: ${upstream.status}`);
              continue;
            }
            const webStream = upstream.body;
            if (webStream) {
              const nodeStream = Readable.fromWeb(webStream as any);
              archive.append(nodeStream, { name: filePath });
              await new Promise<void>((resolve, reject) => {
                nodeStream.on("end", resolve);
                nodeStream.on("error", reject);
              });
            }
          } catch (fetchErr: any) {
            console.warn(`Error fetching clip ${clip.id}:`, fetchErr.message);
          }
        }
      }

      await archive.finalize();
    } catch (err: any) {
      console.error("Download clips error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  });

  return httpServer;
}

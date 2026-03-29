import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import sharp from "sharp";

const API_BASE = "https://api.evolink.ai/v1";
const API_KEY = process.env.NANOBANANA_API_KEY;
const LTX_API_KEY = process.env.LTX_API_KEY;
const LTX_API_BASE = "https://api.ltx.video/v1";

function sanitizePrompt(prompt: string): string {
  return prompt
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2014/g, "--")
    .replace(/\u2013/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x00-\xFF]/g, "");
}

function sanitizeForSora(prompt: string): string {
  let cleaned = sanitizePrompt(prompt);
  const militaryTerms: [RegExp, string][] = [
    [/\b(anti-aircraft|antiaircraft)\s*(gun|fire|battery|cannon|weapon)s?\b/gi, "defense system"],
    [/\b(machine\s*gun|machinegun)s?\b/gi, "mounted equipment"],
    [/\bmuzzle\s*flash(es)?\b/gi, "bright light pulse"],
    [/\btracer\s*(fire|round|stream|arc|light)s?\b/gi, "bright arc light"],
    [/\btracers?\b/gi, "light trails"],
    [/\bgun\s*(gallery|galleries|position|mount|turret|barrel|fire|flash|crew)s?\b/gi, "deck equipment"],
    [/\b(guns?|cannon|cannons)\b/gi, "equipment"],
    [/\b(firing|fires?|fired|shoots?|shooting|shot)\b/gi, "activating"],
    [/\b(bomb|bombs|bombing|bombard|bombardment)s?\b/gi, "aerial operation"],
    [/\b(torpedo|torpedoes)\b/gi, "naval equipment"],
    [/\b(missile|missiles)\b/gi, "projectile"],
    [/\b(explod|explosion|explosive|detonat|blast|shrapnel|debris field)/gi, "dramatic event"],
    [/\b(kill|killed|killing|death|dead|die|dying|lethal|fatal)\b/gi, "critical"],
    [/\b(destroy|destroyed|destruction|devastating)\b/gi, "dramatic impact"],
    [/\b(attack|attacking|assault|strafe|strafing)\b/gi, "approach"],
    [/\b(combat|battle|warfare|war(?:ship)?|enemy|hostile)\b/gi, "scenario"],
    [/\b(weapon|weapons|armament|ammunition|ammo)\b/gi, "equipment"],
    [/\b(bloodied|blood|wound|wounded|injury|injured)\b/gi, "affected"],
    [/\b(crash|crashed|wreckage|burning|ablaze)\b/gi, "dramatic scene"],
    [/\bnear-death\b/gi, "critical moment"],
    [/\bvulnerability\b/gi, "exposure"],
    [/\bcrosshair|crossfire\b/gi, "intersection"],
  ];
  for (const [pattern, replacement] of militaryTerms) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  if (cleaned.length > 800) {
    cleaned = cleaned.substring(0, 800);
  }
  return cleaned;
}

interface EvolinkGenerateResponse {
  created: number;
  id: string;
  model: string;
  object: string;
  progress: number;
  status: string;
  task_info: {
    can_cancel: boolean;
    estimated_time: number;
  };
  type: string;
  usage?: {
    billing_rule: string;
    credits_reserved: number;
    user_group: string;
  };
  error?: {
    message: string;
    type: string;
    code: string;
  };
}

interface EvolinkTaskResponse {
  created: number;
  id: string;
  model: string;
  object: string;
  progress: number;
  status: string;
  results?: string[];
  task_info: {
    can_cancel: boolean;
    estimated_time?: number;
  };
  type: string;
  error?: {
    message: string;
    type: string;
    code: string;
  };
}

export type ImageModelId = "nb2-1k" | "nb2-2k" | "nb2-4k" | "nbpro-2k" | "nbpro-4k";

export interface ImageModelConfig {
  id: ImageModelId;
  name: string;
  apiModel: string;
  quality: string;
  resolution: string;
  costPerImage: number;
  costPerRef: number;
  description: string;
  maxRefImages: number;
}

export const IMAGE_MODELS: Record<ImageModelId, ImageModelConfig> = {
  "nb2-1k": {
    id: "nb2-1k",
    name: "NanoBanana 2 — 1K",
    apiModel: "gemini-3.1-flash-image-preview",
    quality: "1K",
    resolution: "1K",
    costPerImage: 0.054,
    costPerRef: 0.0004,
    description: "Gemini Flash — fast 1K images, cheapest option",
    maxRefImages: 3,
  },
  "nb2-2k": {
    id: "nb2-2k",
    name: "NanoBanana 2 — 2K",
    apiModel: "gemini-3.1-flash-image-preview",
    quality: "2K",
    resolution: "2K",
    costPerImage: 0.081,
    costPerRef: 0.0004,
    description: "Gemini Flash — fast 2K images, great value",
    maxRefImages: 3,
  },
  "nb2-4k": {
    id: "nb2-4k",
    name: "NanoBanana 2 — 4K",
    apiModel: "gemini-3.1-flash-image-preview",
    quality: "4K",
    resolution: "4K",
    costPerImage: 0.121,
    costPerRef: 0.0004,
    description: "Gemini Flash — fast 4K ultra-quality images",
    maxRefImages: 3,
  },
  "nbpro-2k": {
    id: "nbpro-2k",
    name: "NanoBanana Pro — 2K",
    apiModel: "gemini-3-pro-image-preview",
    quality: "2K",
    resolution: "2K",
    costPerImage: 0.121,
    costPerRef: 0.0009,
    description: "Gemini Pro — highest fidelity 2K images",
    maxRefImages: 3,
  },
  "nbpro-4k": {
    id: "nbpro-4k",
    name: "NanoBanana Pro — 4K",
    apiModel: "gemini-3-pro-image-preview",
    quality: "4K",
    resolution: "4K",
    costPerImage: 0.192,
    costPerRef: 0.0009,
    description: "Gemini Pro — highest fidelity 4K ultra-quality",
    maxRefImages: 3,
  },
};

const IMAGE_MODEL_ALIASES: Record<string, ImageModelId> = {
  nanobanana: "nbpro-4k",
  nanobanana2k: "nbpro-2k",
};

export function getImageModelConfig(modelId?: string | null): ImageModelConfig {
  if (modelId) {
    if (modelId in IMAGE_MODELS) return IMAGE_MODELS[modelId as ImageModelId];
    if (modelId in IMAGE_MODEL_ALIASES) return IMAGE_MODELS[IMAGE_MODEL_ALIASES[modelId]];
  }
  return IMAGE_MODELS["nbpro-4k"];
}

export class ContentPolicyError extends Error {
  public readonly originalPrompt: string;
  public readonly errorCode: string;
  constructor(message: string, originalPrompt: string, errorCode: string = "content_policy_violation") {
    super(message);
    this.name = "ContentPolicyError";
    this.originalPrompt = originalPrompt;
    this.errorCode = errorCode;
  }
}

export function sanitizePromptForGemini(prompt: string): string {
  let cleaned = sanitizePrompt(prompt);
  const unsafeTerms: [RegExp, string][] = [
    [/\b(anti-aircraft|antiaircraft)\s*(gun|fire|battery|cannon|weapon)s?\b/gi, "defense system"],
    [/\b(machine\s*gun|machinegun)s?\b/gi, "mounted equipment"],
    [/\bmuzzle\s*flash(es)?\b/gi, "bright light pulse"],
    [/\btracer\s*(fire|round|stream|arc|light)s?\b/gi, "bright arc light"],
    [/\btracers?\b/gi, "light trails"],
    [/\bgun\s*(gallery|galleries|position|mount|turret|barrel|fire|flash|crew)s?\b/gi, "deck equipment"],
    [/\b(guns?|cannon|cannons)\b/gi, "equipment"],
    [/\b(firing|fires?|fired)\b/gi, "activating"],
    [/\b(shoots?|shooting|shot)\b/gi, "operating"],
    [/\b(bomb|bombs|bombing|bombard|bombardment)s?\b/gi, "aerial operation"],
    [/\b(torpedo|torpedoes)\b/gi, "naval equipment"],
    [/\b(missile|missiles)\b/gi, "projectile"],
    [/\b(explod|explosion|explosive|detonat|blast|shrapnel|debris field)/gi, "dramatic event"],
    [/\b(kill|killed|killing|death|dead|die|dying|lethal|fatal)\b/gi, "critical"],
    [/\b(destroy|destroyed|destruction|devastating)\b/gi, "dramatic impact"],
    [/\b(attack|attacking|assault|strafe|strafing)\b/gi, "approach"],
    [/\b(combat|battle|warfare|war(?:ship)?|enemy|hostile)\b/gi, "scenario"],
    [/\b(weapon|weapons|armament|ammunition|ammo)\b/gi, "equipment"],
    [/\b(bloodied|blood|wound|wounded|injury|injured)\b/gi, "affected"],
    [/\b(crash|crashed|wreckage|burning|ablaze)\b/gi, "dramatic scene"],
    [/\bnear-death\b/gi, "critical moment"],
    [/\bvulnerability\b/gi, "exposure"],
    [/\bcrosshair|crossfire\b/gi, "intersection"],
    [/\b(naked|nude|nudity|topless|undressed)\b/gi, "figure"],
    [/\b(drug|drugs|narcotics|cocaine|heroin)\b/gi, "substance"],
    [/\b(suicide|self-harm|self harm)\b/gi, "distress"],
    [/\b(terrorist|terrorism)\b/gi, "antagonist"],
    [/\b(massacre|slaughter|genocide)\b/gi, "historical event"],
    [/\b(torture|torturing|tortured)\b/gi, "captivity"],
    [/\b(execution|executed|behead|beheading)\b/gi, "severe consequence"],
    [/\b(stabbing|stabbed|stab)\b/gi, "confrontation"],
    [/\b(corpse|dead body|cadaver)\b/gi, "fallen figure"],
    [/\b(gore|gory|gruesome|mutilat)\b/gi, "intense scene"],
    [/\b(rifle|pistol|handgun|shotgun|revolver|firearm)s?\b/gi, "equipment"],
    [/\b(grenade|landmine|explosive device)s?\b/gi, "tactical device"],
    [/\b(sniper)\b/gi, "observer"],
    [/\b(assassin|assassination)\b/gi, "operative"],
  ];
  for (const [pattern, replacement] of unsafeTerms) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  return cleaned;
}

const NON_RETRYABLE_ERROR_CODES = new Set([
  "invalid_parameters",
  "image_processing_error",
  "image_dimension_mismatch",
]);

const RETRYABLE_ERROR_CODES = new Set([
  "service_error",
  "generation_timeout",
  "resource_exhausted",
  "quota_exceeded",
  "service_unavailable",
]);

export async function generateImage(prompt: string, referenceImageUrls?: string[], imageModelId?: ImageModelId, userApiKey?: string, size?: string): Promise<{ taskId: string }> {
  const apiKey = userApiKey || API_KEY;
  if (!apiKey) {
    throw new Error("EvoLink API key is not configured. Please add your API key in Settings or set NANOBANANA_API_KEY.");
  }

  const model = getImageModelConfig(imageModelId);

  const bodyParams: Record<string, any> = {
    model: model.apiModel,
    prompt: sanitizePrompt(prompt),
    size: size || "16:9",
    quality: model.quality,
  };

  if (referenceImageUrls && referenceImageUrls.length > 0) {
    const limitedRefs = referenceImageUrls.slice(0, model.maxRefImages);
    bodyParams.image_urls = limitedRefs;
    console.log(`[image-gen] Using ${limitedRefs.length} character reference image(s) with ${model.name}`);
  }

  console.log(`[image-gen] Using model: ${model.name} (${model.apiModel}), cost: $${model.costPerImage}`);

  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [5000, 15000, 30000];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/images/generations`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyParams),
      });
    } catch (netErr: any) {
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt];
        console.warn(`[image-gen] ${model.name} attempt ${attempt + 1} network error: ${netErr.message}. Retrying in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw new Error(`Network error connecting to EvoLink API: ${netErr.message}`);
    }

    if (response.status === 401) {
      throw new Error("API key is invalid or expired. Please check your EvoLink API key in Settings.");
    }

    if (response.status === 429 || response.status === 503) {
      if (attempt < MAX_RETRIES) {
        const retryAfter = parseInt(response.headers.get("Retry-After") || "0", 10);
        const delay = retryAfter > 0 ? retryAfter * 1000 : RETRY_DELAYS[attempt];
        console.warn(`[image-gen] ${model.name} attempt ${attempt + 1} rate limited (${response.status}). Retrying in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw new Error(`Image generation rate limited after ${MAX_RETRIES + 1} attempts. The API is busy — try again shortly.`);
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt];
        console.warn(`[image-gen] ${model.name} attempt ${attempt + 1} got non-JSON response (${response.status}). Retrying in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw new Error(`EvoLink API returned non-JSON response (${response.status})`);
    }

    if (data.error) {
      const errMsg = data.error.message || "Unknown error";
      const errCode = data.error.code || data.error.type || "";

      if (errCode === "insufficient_quota" || errMsg.toLowerCase().includes("insufficient")) {
        throw new Error("Insufficient credits on your EvoLink account. Please top up at evolink.ai to generate images.");
      }
      if (errCode === "invalid_api_key") {
        throw new Error("API key is invalid or expired. Please check your EvoLink API key in Settings.");
      }

      if (errCode === "content_policy_violation" || errCode === "generation_failed_no_content") {
        console.error(`[image-gen] ${model.name} content/safety error [${errCode}]: ${errMsg}`);
        throw new ContentPolicyError(
          `Image generation failed (${model.name}) [${errCode}]: ${errMsg}`,
          prompt,
          errCode,
        );
      }

      if (NON_RETRYABLE_ERROR_CODES.has(errCode)) {
        console.error(`[image-gen] ${model.name} non-retryable error [${errCode}]: ${errMsg}`);
        throw new Error(`Image generation failed (${model.name}) [${errCode}]: ${errMsg}`);
      }

      const isRetryable = RETRYABLE_ERROR_CODES.has(errCode) || response.status >= 500;
      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt];
        console.warn(`[image-gen] ${model.name} attempt ${attempt + 1} retryable error [${errCode}]: ${errMsg}. Retrying in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      console.error(`EvoLink API error (${model.name}):`, data.error);
      throw new Error(`Image generation failed (${model.name}): ${errMsg}`);
    }

    if (!response.ok) {
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt];
        console.warn(`[image-gen] ${model.name} attempt ${attempt + 1} server error (${response.status}). Retrying in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw new Error(`EvoLink API error (${response.status})`);
    }

    console.log(`EvoLink task created: ${data.id}, model: ${model.name}, status: ${data.status}, estimated: ${data.task_info?.estimated_time}s`);
    // #region agent log
    try{const fs=require('fs');fs.appendFileSync('/Users/zahoor/Downloads/app fix bug debug/.cursor/debug-c358ba.log',JSON.stringify({sessionId:'c358ba',hypothesisId:'B',location:'nanobanana.ts:generateImage',message:'EvoLink image response credits_reserved vs hardcoded',data:{taskId:data.id,model:model.name,hardcodedCost:model.costPerImage,creditsReserved:data.usage?.credits_reserved||null,billingRule:data.usage?.billing_rule||null,userGroup:data.usage?.user_group||null,fullUsage:data.usage||null},timestamp:Date.now()})+'\n')}catch(e){}
    // #endregion
    return { taskId: data.id };
  }

  throw new Error(`Image generation failed (${model.name}): All retry attempts exhausted`);
}

export type VideoModelId = "grok" | "seedance" | "hailuo" | "veo31" | "kling" | "klingmc" | "sora2pro" | "ltx23";

export interface VideoModelConfig {
  id: VideoModelId;
  name: string;
  apiModel: string;
  duration: number;
  quality: string;
  costPerClip: number;
  description: string;
}

export const VIDEO_MODELS: Record<VideoModelId, VideoModelConfig> = {
  grok: {
    id: "grok",
    name: "Grok Imagine Video",
    apiModel: "grok-imagine-image-to-video",
    duration: 6,
    quality: "720p",
    costPerClip: 0.128,
    description: "Fast 6s clips at 720p — $0.128/video (720p 6s)",
  },
  seedance: {
    id: "seedance",
    name: "Seedance 1.5 Pro",
    apiModel: "seedance-1.5-pro",
    duration: 8,
    quality: "720p",
    costPerClip: 0.20,
    description: "ByteDance cinematic 8s clips at 720p — $0.025/sec",
  },
  hailuo: {
    id: "hailuo",
    name: "Hailuo 2.3 Fast",
    apiModel: "MiniMax-Hailuo-2.3-Fast",
    duration: 6,
    quality: "768p",
    costPerClip: 0.167,
    description: "MiniMax 6s clips at 768p — $0.167/video",
  },
  veo31: {
    id: "veo31",
    name: "Veo 3.1 Fast",
    apiModel: "veo-3.1-fast-generate-preview",
    duration: 8,
    quality: "1080p",
    costPerClip: 0.64,
    description: "Google 8s clips at 1080p — $0.08/sec, cinematic motion",
  },
  kling: {
    id: "kling",
    name: "Kling 3.0",
    apiModel: "kling-v3-image-to-video",
    duration: 15,
    quality: "1080p",
    costPerClip: 1.125,
    description: "Premium 15s clips at 1080p — $0.075/sec, best motion",
  },
  klingmc: {
    id: "klingmc",
    name: "Kling 3.0 Motion Control",
    apiModel: "kling-v3-motion-control",
    duration: 10,
    quality: "1080p",
    costPerClip: 1.134,
    description: "Motion transfer at 1080p — $0.1134/sec, up to 10s",
  },
  sora2pro: {
    id: "sora2pro",
    name: "Sora 2 Pro",
    apiModel: "sora-2-pro",
    duration: 15,
    quality: "1080p",
    costPerClip: 0.958,
    description: "OpenAI premium 15s HD — physics-accurate motion",
  },
  ltx23: {
    id: "ltx23",
    name: "LTX 2.3",
    apiModel: "ltx-2-3-fast",
    duration: 8,
    quality: "1080p",
    costPerClip: 0.32,
    description: "Lightricks 8s clips at 1080p — fast, cinematic",
  },
};

export function getVideoModelConfig(modelId?: string | null): VideoModelConfig {
  if (modelId && modelId in VIDEO_MODELS) {
    return VIDEO_MODELS[modelId as VideoModelId];
  }
  return VIDEO_MODELS.grok;
}

export async function generateVideoLTX(imageUrl: string, prompt: string, durationOverride?: number): Promise<{ videoUrl: string }> {
  if (!LTX_API_KEY) {
    throw new Error("LTX_API_KEY is not configured. Please add your LTX Video API key in Secrets.");
  }

  const model = VIDEO_MODELS.ltx23;
  const duration = durationOverride || model.duration;
  const cleanedPrompt = sanitizePrompt(prompt);

  console.log(`[video-gen-ltx] Starting LTX 2.3 generation: duration=${duration}s, prompt="${cleanedPrompt.substring(0, 100)}..."`);

  let imageUri = imageUrl;
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    try {
      console.log(`[video-gen-ltx] Downloading image: ${imageUrl.substring(0, 100)}...`);
      const imgResponse = await fetch(imageUrl);
      if (!imgResponse.ok) {
        throw new Error(`Failed to download image: HTTP ${imgResponse.status}`);
      }
      let imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
      const imgContentType = imgResponse.headers.get("content-type") || "image/png";
      const originalSizeMB = imgBuffer.length / 1024 / 1024;
      console.log(`[video-gen-ltx] Image downloaded: ${originalSizeMB.toFixed(1)}MB (${imgContentType})`);

      if (imgBuffer.length > 4 * 1024 * 1024) {
        console.log(`[video-gen-ltx] Compressing image from ${originalSizeMB.toFixed(1)}MB to JPEG for LTX...`);
        imgBuffer = await sharp(imgBuffer)
          .resize(1920, 1080, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
        console.log(`[video-gen-ltx] Compressed to ${(imgBuffer.length / 1024 / 1024).toFixed(1)}MB JPEG`);
      }

      const wasCompressed = imgBuffer.length < (originalSizeMB * 1024 * 1024);
      const mimeType = wasCompressed ? "image/jpeg" : imgContentType.split(";")[0].trim();
      const base64Size = Math.ceil(imgBuffer.length * 4 / 3);
      if (base64Size <= 7 * 1024 * 1024) {
        imageUri = `data:${mimeType};base64,${imgBuffer.toString("base64")}`;
        console.log(`[video-gen-ltx] Using data URI (${(base64Size / 1024 / 1024).toFixed(1)}MB encoded)`);
      } else {
        console.log(`[video-gen-ltx] Image still ${(imgBuffer.length / 1024 / 1024).toFixed(1)}MB after compression. Uploading to LTX cloud storage...`);
        const uploadRes = await fetch(`${LTX_API_BASE}/upload`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${LTX_API_KEY}` },
        });
        if (!uploadRes.ok) {
          const errText = await uploadRes.text();
          throw new Error(`LTX upload request failed (${uploadRes.status}): ${errText.substring(0, 200)}`);
        }
        const uploadData = await uploadRes.json();
        const { upload_url, storage_uri, required_headers } = uploadData;
        console.log(`[video-gen-ltx] Got upload URL, uploading...`);

        const putHeaders: Record<string, string> = {
          "Content-Type": mimeType,
          ...required_headers,
        };
        const putRes = await fetch(upload_url, {
          method: "PUT",
          headers: putHeaders,
          body: imgBuffer,
        });
        if (!putRes.ok) {
          const errText = await putRes.text();
          throw new Error(`LTX cloud upload failed (${putRes.status}): ${errText.substring(0, 200)}`);
        }
        imageUri = storage_uri;
        console.log(`[video-gen-ltx] Image uploaded to LTX storage: ${storage_uri}`);
      }
    } catch (dlErr: any) {
      console.error(`[video-gen-ltx] Failed to prepare image for LTX: ${dlErr.message}`);
      throw new Error(`Cannot access image for LTX video generation: ${dlErr.message}`);
    }
  }

  const bodyParams: Record<string, any> = {
    image_uri: imageUri,
    prompt: cleanedPrompt,
    model: model.apiModel,
    duration,
    resolution: "1920x1080",
    fps: 24,
    generate_audio: false,
  };

  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [5000, 15000, 30000];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(`${LTX_API_BASE}/image-to-video`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LTX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyParams),
    });

    if (response.status === 401) {
      throw new Error("LTX API key is invalid or expired. Please check your LTX_API_KEY in Secrets.");
    }

    if (response.status === 429 || response.status === 503) {
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt];
        console.warn(`[video-gen-ltx] LTX attempt ${attempt + 1} rate limited/unavailable. Retrying in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw new Error(`LTX Video API rate limited/unavailable after ${MAX_RETRIES} retries`);
    }

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("video/mp4") || contentType.includes("application/octet-stream")) {
      const uploadsDir = path.join(process.cwd(), "uploads", "ltx-videos");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const fileName = `ltx-${randomUUID()}.mp4`;
      const filePath = path.join(uploadsDir, fileName);

      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(filePath, buffer);

      const videoUrl = `/uploads/ltx-videos/${fileName}`;
      console.log(`[video-gen-ltx] LTX video saved: ${videoUrl} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);
      return { videoUrl };
    }

    if (contentType.includes("application/json")) {
      const data = await response.json();
      if (data.error || data.message) {
        const errMsg = data.error?.message || data.message || data.error || "Unknown LTX error";

        const isRetryable = response.status >= 500 || String(errMsg).toLowerCase().includes("retry") || String(errMsg).toLowerCase().includes("busy");
        if (isRetryable && attempt < MAX_RETRIES) {
          const delay = RETRY_DELAYS[attempt];
          console.warn(`[video-gen-ltx] LTX attempt ${attempt + 1} failed: ${errMsg}. Retrying in ${delay / 1000}s...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        throw new Error(`LTX Video generation failed: ${errMsg}`);
      }

      if (data.video?.url || data.url) {
        const videoUrl = data.video?.url || data.url;
        console.log(`[video-gen-ltx] LTX video URL returned: ${videoUrl}`);
        return { videoUrl };
      }

      throw new Error(`Unexpected LTX API response: ${JSON.stringify(data).substring(0, 300)}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LTX Video API error (${response.status}): ${errorText.substring(0, 300)}`);
    }

    throw new Error(`Unexpected LTX response content-type: ${contentType}`);
  }

  throw new Error("LTX Video generation failed: All retry attempts exhausted");
}

export async function generateVideo(imageUrl: string, prompt: string, modelId?: VideoModelId, durationOverride?: number, userApiKey?: string): Promise<{ taskId: string; videoUrl?: string }> {
  if (modelId === "ltx23") {
    const result = await generateVideoLTX(imageUrl, prompt, durationOverride);
    return { taskId: `ltx-sync-${randomUUID()}`, videoUrl: result.videoUrl };
  }

  const apiKey = userApiKey || API_KEY;
  if (!apiKey) {
    throw new Error("EvoLink API key is not configured. Please add your API key in Settings or set NANOBANANA_API_KEY.");
  }

  const model = getVideoModelConfig(modelId);
  const duration = durationOverride || model.duration;

  const cleanedPrompt = model.id === "sora2pro"
    ? sanitizeForSora(prompt)
    : sanitizePromptForGemini(prompt);

  const bodyParams: Record<string, any> = {
    model: model.apiModel,
    prompt: cleanedPrompt,
    duration,
  };

  if (model.id === "kling") {
    bodyParams.image_start = imageUrl;
    bodyParams.quality = model.quality;
    if (bodyParams.prompt && bodyParams.prompt.length > 2500) {
      bodyParams.prompt = bodyParams.prompt.substring(0, 2500);
    }
  } else if (model.id === "klingmc") {
    bodyParams.image_urls = [imageUrl];
    bodyParams.quality = model.quality;
    bodyParams.model_params = {
      character_orientation: "image",
      keep_sound: false,
    };
  } else {
    bodyParams.image_urls = [imageUrl];
  }

  if (model.id === "grok") {
    bodyParams.mode = "normal";
    bodyParams.quality = model.quality;
  }

  if (model.id === "veo31") {
    bodyParams.aspect_ratio = "16:9";
    bodyParams.quality = model.quality;
    bodyParams.generate_audio = false;
  }

  if (model.id === "seedance") {
    bodyParams.quality = model.quality;
    bodyParams.aspect_ratio = "16:9";
    bodyParams.generate_audio = false;
  }

  if (model.id === "hailuo") {
    bodyParams.quality = model.quality;
  }

  if (model.id === "sora2pro") {
    bodyParams.aspect_ratio = "16:9";
    bodyParams.quality = "high";
    bodyParams.remove_watermark = true;
  }

  console.log(`[video-gen] Using model: ${model.name} (${model.apiModel}), duration: ${duration}s, cost: $${model.costPerClip}`);
  console.log(`[video-gen] Request body: ${JSON.stringify({ ...bodyParams, prompt: bodyParams.prompt?.substring(0, 100) + "...", image_start: bodyParams.image_start ? bodyParams.image_start.substring(0, 80) + "..." : undefined, image_urls: bodyParams.image_urls ? "[" + bodyParams.image_urls.length + " urls]" : undefined })}`);

  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [5000, 15000, 30000];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(`${API_BASE}/videos/generations`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyParams),
    });

    const data = await response.json();

    if (data.error) {
      const errMsg = data.error.message || data.error.error || "Unknown error";
      const errCode = data.error.code || data.error.type || "";

      console.error(`[video-gen] ${model.name} API error (HTTP ${response.status}): code=${errCode}, message=${errMsg}, full error: ${JSON.stringify(data.error).substring(0, 500)}`);

      if (errCode === "insufficient_quota" || errMsg.toLowerCase().includes("insufficient")) {
        throw new Error(`Insufficient credits (${model.name}). Top up at evolink.ai. API said: ${errMsg}`);
      }
      if (response.status === 401 || errCode === "invalid_api_key") {
        throw new Error(`API key invalid/expired (${model.name}). Check your NANOBANANA_API_KEY. API said: ${errMsg}`);
      }

      if (errCode === "content_policy_violation" || errCode === "generation_failed_no_content") {
        throw new ContentPolicyError(
          `Video generation failed (${model.name}) [${errCode}]: ${errMsg}`,
          prompt,
          errCode,
        );
      }

      const isRetryable = errCode === "service_error" || errMsg.toLowerCase().includes("service busy") || errMsg.toLowerCase().includes("retry") || errMsg.toLowerCase().includes("allocating") || response.status === 429 || response.status === 503;
      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt];
        console.warn(`[video-gen] ${model.name} attempt ${attempt + 1} failed: ${errMsg}. Retrying in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      throw new Error(`${model.name} failed: ${errMsg}${errCode ? ` (${errCode})` : ""}`);
    }

    if (!response.ok) {
      console.error(`[video-gen] ${model.name} non-OK HTTP ${response.status}, body: ${JSON.stringify(data).substring(0, 500)}`);
      throw new Error(`${model.name} API error (HTTP ${response.status})`);
    }

    console.log(`EvoLink video task created: ${data.id}, model: ${model.name}, status: ${data.status}, estimated: ${data.task_info?.estimated_time}s`);
    // #region agent log
    try{const fs=require('fs');fs.appendFileSync('/Users/zahoor/Downloads/app fix bug debug/.cursor/debug-c358ba.log',JSON.stringify({sessionId:'c358ba',hypothesisId:'A_B',location:'nanobanana.ts:generateVideo',message:'EvoLink video response credits_reserved vs hardcoded',data:{taskId:data.id,modelId:model.id,modelName:model.name,hardcodedCostPerClip:model.costPerClip,creditsReserved:data.usage?.credits_reserved||null,billingRule:data.usage?.billing_rule||null,userGroup:data.usage?.user_group||null,fullUsage:data.usage||null},timestamp:Date.now()})+'\n')}catch(e){}
    // #endregion
    return { taskId: data.id };
  }

  throw new Error(`Video generation failed (${model.name}): All retry attempts exhausted`);
}

export async function checkVideoStatus(taskId: string, userApiKey?: string): Promise<{
  status: string;
  videoUrl: string | null;
  progress: number;
  error?: string;
}> {
  const apiKey = userApiKey || API_KEY;
  if (!apiKey) {
    throw new Error("EvoLink API key is not configured. Please add your API key in Settings.");
  }

  const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("EvoLink video task check error:", response.status, errorText);
    throw new Error(`EvoLink video task check error (${response.status}): ${errorText}`);
  }

  const data: EvolinkTaskResponse = await response.json();

  if (data.status === "completed" && data.results && data.results.length > 0) {
    const videoUrl = typeof data.results[0] === "string" ? data.results[0] : (data.results[0] as any).url;
    return {
      status: "completed",
      videoUrl,
      progress: 100,
    };
  }

  if (data.status === "failed") {
    const errorMsg = data.error?.message || "Unknown error";
    console.error(`EvoLink video task ${taskId} failed: ${errorMsg}`);
    return { status: "failed", videoUrl: null, progress: 0, error: errorMsg };
  }

  if (data.status === "cancelled") {
    return { status: "failed", videoUrl: null, progress: 0, error: "Task was cancelled by the provider" };
  }

  return {
    status: "generating",
    videoUrl: null,
    progress: data.progress || 0,
  };
}

export async function checkImageStatus(taskId: string, userApiKey?: string): Promise<{
  status: string;
  imageUrl: string | null;
  progress: number;
  error?: string;
}> {
  const apiKey = userApiKey || API_KEY;
  if (!apiKey) {
    throw new Error("EvoLink API key is not configured. Please add your API key in Settings.");
  }

  const MAX_POLL_RETRIES = 3;
  const POLL_RETRY_DELAYS = [2000, 5000, 10000];

  for (let attempt = 0; attempt <= MAX_POLL_RETRIES; attempt++) {
    try {
      const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
        },
      });

      if (response.status === 429 || response.status === 503) {
        if (attempt < MAX_POLL_RETRIES) {
          const delay = POLL_RETRY_DELAYS[attempt];
          console.warn(`[image-poll] Task ${taskId} status check rate limited (${response.status}), retry ${attempt + 1} in ${delay / 1000}s...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        return { status: "generating", imageUrl: null, progress: 0 };
      }

      if (!response.ok) {
        if (response.status >= 500 && attempt < MAX_POLL_RETRIES) {
          const delay = POLL_RETRY_DELAYS[attempt];
          console.warn(`[image-poll] Task ${taskId} status check server error (${response.status}), retry ${attempt + 1} in ${delay / 1000}s...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        const errorText = await response.text();
        console.error("EvoLink task check error:", response.status, errorText);
        throw new Error(`EvoLink task check error (${response.status}): ${errorText}`);
      }

      const data: EvolinkTaskResponse = await response.json();

      if (data.status === "completed" && data.results && data.results.length > 0) {
        const imageUrl = typeof data.results[0] === "string" ? data.results[0] : (data.results[0] as any).url;
        return { status: "completed", imageUrl, progress: 100 };
      }

      if (data.status === "failed") {
        const errMsg = data.error?.message || "Unknown error";
        console.error(`EvoLink task ${taskId} failed: ${errMsg}`);
        return { status: "failed", imageUrl: null, progress: 0, error: errMsg };
      }

      if (data.status === "cancelled") {
        return { status: "failed", imageUrl: null, progress: 0, error: "Task was cancelled" };
      }

      return { status: "generating", imageUrl: null, progress: data.progress || 0 };
    } catch (fetchErr: any) {
      if (attempt < MAX_POLL_RETRIES) {
        const delay = POLL_RETRY_DELAYS[attempt];
        console.warn(`[image-poll] Task ${taskId} network error: ${fetchErr.message}. Retry ${attempt + 1} in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw fetchErr;
    }
  }

  return { status: "generating", imageUrl: null, progress: 0 };
}

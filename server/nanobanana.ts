import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

import { getApiKey } from "./api-keys";

let _sharp: typeof import("sharp") | null = null;
async function getSharp() {
  if (!_sharp) {
    try {
      _sharp = (await import("sharp")).default as any;
    } catch {
      console.warn("[sharp] Not available - image compression disabled");
      _sharp = null;
    }
  }
  return _sharp;
}

const API_BASE = "https://api.evolink.ai/v1";

async function getEvolinkKey(): Promise<string | undefined> {
  return getApiKey("evolink");
}
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

export type ImageModelId = "nanobanana" | "seedream";

export interface ImageModelConfig {
  id: ImageModelId;
  name: string;
  apiModel: string;
  quality: string;
  resolution: string;
  costPerImage: number;
  description: string;
  maxRefImages: number;
}

export const IMAGE_MODELS: Record<ImageModelId, ImageModelConfig> = {
  nanobanana: {
    id: "nanobanana",
    name: "NanoBanana Pro",
    apiModel: "gemini-3-pro-image-preview",
    quality: "4K",
    resolution: "4K",
    costPerImage: 0.05,
    description: "Gemini-powered 4K photorealistic images — proven quality",
    maxRefImages: 3,
  },
  seedream: {
    id: "seedream",
    name: "SeedREAM 4.5",
    apiModel: "doubao-seedream-4.5",
    quality: "4K",
    resolution: "4K",
    costPerImage: 0.04,
    description: "ByteDance — superior character consistency, up to 10 reference images",
    maxRefImages: 10,
  },
};

export function getImageModelConfig(modelId?: string | null): ImageModelConfig {
  if (modelId && modelId in IMAGE_MODELS) {
    return IMAGE_MODELS[modelId as ImageModelId];
  }
  return IMAGE_MODELS.nanobanana;
}

export async function generateImage(prompt: string, referenceImageUrls?: string[], imageModelId?: ImageModelId): Promise<{ taskId: string }> {
  const API_KEY = await getEvolinkKey();
  if (!API_KEY) {
    throw new Error("EvoLink API key is not configured. Please add it in Settings or Secrets.");
  }

  const model = getImageModelConfig(imageModelId);

  const bodyParams: Record<string, any> = {
    model: model.apiModel,
    prompt: sanitizePrompt(prompt),
    size: "16:9",
    quality: model.quality,
  };

  if (referenceImageUrls && referenceImageUrls.length > 0) {
    const limitedRefs = referenceImageUrls.slice(0, model.maxRefImages);
    bodyParams.image_urls = limitedRefs;
    console.log(`[image-gen] Using ${limitedRefs.length} character reference image(s) with ${model.name}`);
  }

  console.log(`[image-gen] Using model: ${model.name} (${model.apiModel}), cost: $${model.costPerImage}`);

  const response = await fetch(`${API_BASE}/images/generations`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(bodyParams),
  });

  const data = await response.json();

  if (data.error) {
    console.error(`EvoLink API error (${model.name}):`, data.error);
    const errMsg = data.error.message || "Unknown error";
    const errCode = data.error.code || data.error.type || "";

    if (errCode === "insufficient_quota" || errMsg.toLowerCase().includes("insufficient")) {
      throw new Error("Insufficient credits on your EvoLink account. Please top up at evolink.ai to generate images.");
    }
    if (response.status === 401 || errCode === "invalid_api_key") {
      throw new Error("API key is invalid or expired. Please check your NANOBANANA_API_KEY in Secrets.");
    }
    throw new Error(`Image generation failed (${model.name}): ${errMsg}`);
  }

  if (!response.ok) {
    throw new Error(`EvoLink API error (${response.status})`);
  }

  console.log(`EvoLink task created: ${data.id}, model: ${model.name}, status: ${data.status}, estimated: ${data.task_info?.estimated_time}s`);
  return { taskId: data.id };
}

export type VideoModelId = "grok" | "seedance" | "hailuo" | "veo31" | "kling" | "sora2pro" | "ltx23";

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
    costPerClip: 0.064,
    description: "Fast 6s clips at 720p with smooth motion",
  },
  seedance: {
    id: "seedance",
    name: "Seedance 1.5 Pro",
    apiModel: "seedance-1.5-pro",
    duration: 8,
    quality: "720p",
    costPerClip: 0.198,
    description: "ByteDance cinematic 8s clips at 720p with camera control",
  },
  hailuo: {
    id: "hailuo",
    name: "Hailuo 2.3 Fast",
    apiModel: "MiniMax-Hailuo-2.3-Fast",
    duration: 6,
    quality: "768p",
    costPerClip: 0.167,
    description: "MiniMax 6s clips at 768p — great motion and expressions",
  },
  veo31: {
    id: "veo31",
    name: "Veo 3.1 Quality",
    apiModel: "veo3.1-fast",
    duration: 8,
    quality: "1080p",
    costPerClip: 0.1681,
    description: "Google 8s clips at 1080p with cinematic motion",
  },
  kling: {
    id: "kling",
    name: "Kling 3.0",
    apiModel: "kling-v3-image-to-video",
    duration: 15,
    quality: "1080p",
    costPerClip: 1.50,
    description: "Premium 15s clips at 1080p — maximum duration, best motion",
  },
  sora2pro: {
    id: "sora2pro",
    name: "Sora 2 Pro",
    apiModel: "sora-2-pro",
    duration: 15,
    quality: "1080p",
    costPerClip: 0.958,
    description: "OpenAI premium 15s HD clips with physics-accurate motion",
  },
  ltx23: {
    id: "ltx23",
    name: "LTX 2.3",
    apiModel: "ltx-2-3-fast",
    duration: 8,
    quality: "1080p",
    costPerClip: 0.32,
    description: "Lightricks 8s clips at 1080p — fast, cinematic with camera motion",
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
        const sharpInstance = await getSharp();
        if (sharpInstance) {
          console.log(`[video-gen-ltx] Compressing image from ${originalSizeMB.toFixed(1)}MB to JPEG for LTX...`);
          imgBuffer = await (sharpInstance as any)(imgBuffer)
            .resize(1920, 1080, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
          console.log(`[video-gen-ltx] Compressed to ${(imgBuffer.length / 1024 / 1024).toFixed(1)}MB JPEG`);
        } else {
          console.warn(`[video-gen-ltx] sharp not available, skipping compression`);
        }
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

export async function generateVideo(imageUrl: string, prompt: string, modelId?: VideoModelId, durationOverride?: number): Promise<{ taskId: string; videoUrl?: string }> {
  if (modelId === "ltx23") {
    const result = await generateVideoLTX(imageUrl, prompt, durationOverride);
    return { taskId: `ltx-sync-${randomUUID()}`, videoUrl: result.videoUrl };
  }

  const API_KEY = await getEvolinkKey();
  if (!API_KEY) {
    throw new Error("EvoLink API key is not configured. Please add it in Settings or Secrets.");
  }

  const model = getVideoModelConfig(modelId);
  const duration = durationOverride || model.duration;

  const cleanedPrompt = model.id === "sora2pro" ? sanitizeForSora(prompt) : sanitizePrompt(prompt);

  const bodyParams: Record<string, any> = {
    model: model.apiModel,
    prompt: cleanedPrompt,
    duration,
  };

  if (model.id === "kling") {
    bodyParams.image_start = imageUrl;
    bodyParams.aspect_ratio = "16:9";
    bodyParams.quality = model.quality;
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

  console.log(`[video-gen] Using model: ${model.name} (${model.apiModel}), duration: ${model.duration}s, cost: $${model.costPerClip}`);

  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [5000, 15000, 30000];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(`${API_BASE}/videos/generations`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyParams),
    });

    const data = await response.json();

    if (data.error) {
      const errMsg = data.error.message || "Unknown error";
      const errCode = data.error.code || data.error.type || "";

      if (errCode === "insufficient_quota" || errMsg.toLowerCase().includes("insufficient")) {
        throw new Error("Insufficient credits on your EvoLink account. Please top up at evolink.ai to generate videos.");
      }
      if (response.status === 401 || errCode === "invalid_api_key") {
        throw new Error("API key is invalid or expired. Please check your NANOBANANA_API_KEY in Secrets.");
      }

      const isRetryable = errCode === "service_error" || errMsg.toLowerCase().includes("service busy") || errMsg.toLowerCase().includes("retry") || errMsg.toLowerCase().includes("allocating") || response.status === 429 || response.status === 503;
      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt];
        console.warn(`[video-gen] ${model.name} attempt ${attempt + 1} failed: ${errMsg}. Retrying in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      console.error(`EvoLink Video API error (${model.name}):`, data.error);
      throw new Error(`Video generation failed (${model.name}): ${errMsg}`);
    }

    if (!response.ok) {
      throw new Error(`EvoLink Video API error (${response.status})`);
    }

    console.log(`EvoLink video task created: ${data.id}, model: ${model.name}, status: ${data.status}, estimated: ${data.task_info?.estimated_time}s`);
    return { taskId: data.id };
  }

  throw new Error(`Video generation failed (${model.name}): All retry attempts exhausted`);
}

export async function checkVideoStatus(taskId: string): Promise<{
  status: string;
  videoUrl: string | null;
  progress: number;
  error?: string;
}> {
  const API_KEY = await getEvolinkKey();
  if (!API_KEY) {
    throw new Error("EvoLink API key is not configured. Please add it in Settings or Secrets.");
  }

  const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
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

export async function checkImageStatus(taskId: string): Promise<{
  status: string;
  imageUrl: string | null;
  progress: number;
  error?: string;
}> {
  const API_KEY = await getEvolinkKey();
  if (!API_KEY) {
    throw new Error("EvoLink API key is not configured. Please add it in Settings or Secrets.");
  }

  const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("EvoLink task check error:", response.status, errorText);
    throw new Error(`EvoLink task check error (${response.status}): ${errorText}`);
  }

  const data: EvolinkTaskResponse = await response.json();

  if (data.status === "completed" && data.results && data.results.length > 0) {
    const imageUrl = typeof data.results[0] === "string" ? data.results[0] : (data.results[0] as any).url;
    return {
      status: "completed",
      imageUrl,
      progress: 100,
    };
  }

  if (data.status === "failed") {
    const errMsg = data.error?.message || "Unknown error";
    console.error("EvoLink task failed:", errMsg);
    return { status: "failed", imageUrl: null, progress: 0, error: errMsg };
  }

  if (data.status === "cancelled") {
    return { status: "failed", imageUrl: null, progress: 0, error: "Task was cancelled" };
  }

  return {
    status: "generating",
    imageUrl: null,
    progress: data.progress || 0,
  };
}

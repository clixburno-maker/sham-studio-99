const KIE_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_DIRECT_KEY = process.env.ELEVENLABS_DIRECT_API_KEY;
const BASE_URL = "https://api.kie.ai/api/v1";
const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";

export interface Voice {
  voice_id: string;
  name: string;
  category: string;
  description: string;
}

const AVAILABLE_VOICES: Voice[] = [
  { voice_id: "Rachel", name: "Rachel", category: "premade", description: "Calm, young female" },
  { voice_id: "Aria", name: "Aria", category: "premade", description: "Expressive, young female" },
  { voice_id: "Roger", name: "Roger", category: "premade", description: "Confident male" },
  { voice_id: "Sarah", name: "Sarah", category: "premade", description: "Soft, young female" },
  { voice_id: "Laura", name: "Laura", category: "premade", description: "Upbeat female" },
  { voice_id: "Charlie", name: "Charlie", category: "premade", description: "Casual, Australian male" },
  { voice_id: "George", name: "George", category: "premade", description: "Warm, British male" },
  { voice_id: "Callum", name: "Callum", category: "premade", description: "Intense, transatlantic male" },
  { voice_id: "River", name: "River", category: "premade", description: "Confident, American non-binary" },
  { voice_id: "Liam", name: "Liam", category: "premade", description: "Articulate, young male" },
  { voice_id: "Charlotte", name: "Charlotte", category: "premade", description: "Seductive, Swedish female" },
  { voice_id: "Alice", name: "Alice", category: "premade", description: "Confident, British female" },
  { voice_id: "Matilda", name: "Matilda", category: "premade", description: "Warm, friendly female" },
  { voice_id: "Will", name: "Will", category: "premade", description: "Friendly, young male" },
  { voice_id: "Jessica", name: "Jessica", category: "premade", description: "Expressive, female" },
  { voice_id: "Eric", name: "Eric", category: "premade", description: "Friendly, middle-aged male" },
  { voice_id: "Chris", name: "Chris", category: "premade", description: "Casual, male" },
  { voice_id: "Brian", name: "Brian", category: "premade", description: "Deep, narrator male" },
  { voice_id: "Daniel", name: "Daniel", category: "premade", description: "Authoritative, British male" },
  { voice_id: "Lily", name: "Lily", category: "premade", description: "Warm, British female" },
  { voice_id: "Bill", name: "Bill", category: "premade", description: "Trustworthy, narrator male" },
];

export async function getVoices(): Promise<Voice[]> {
  return AVAILABLE_VOICES;
}

async function generateViaDirectElevenLabs(text: string, voiceId: string): Promise<Buffer> {
  if (!ELEVENLABS_DIRECT_KEY) {
    throw new Error("ELEVENLABS_DIRECT_API_KEY is not configured. Required for custom voice IDs.");
  }

  console.log(`[TTS] Using direct ElevenLabs API with voice_id: ${voiceId}`);

  const res = await fetch(`${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_DIRECT_KEY,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.5,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ElevenLabs API error ${res.status}: ${errText}`);
  }

  console.log(`[TTS] Direct ElevenLabs response received, downloading audio...`);
  const arrayBuffer = await res.arrayBuffer();
  console.log(`[TTS] Audio downloaded: ${arrayBuffer.byteLength} bytes`);
  return Buffer.from(arrayBuffer);
}

async function generateViaKieAi(text: string, voiceName: string): Promise<Buffer> {
  if (!KIE_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY (kie.ai) is not configured");
  }

  console.log(`[TTS] Using kie.ai proxy with preset voice: ${voiceName}`);

  const createRes = await fetch(`${BASE_URL}/jobs/createTask`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${KIE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "elevenlabs/text-to-speech-multilingual-v2",
      input: {
        text,
        voice: voiceName,
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.5,
        speed: 1.0,
      },
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`kie.ai TTS create error: ${createRes.status} ${errText}`);
  }

  const createData = (await createRes.json()) as any;
  if (createData.code !== 200 || !createData.data?.taskId) {
    throw new Error(`kie.ai TTS create failed: ${JSON.stringify(createData)}`);
  }

  const taskId = createData.data.taskId;
  console.log(`[TTS] Task created: ${taskId}, polling for result...`);

  const maxAttempts = 60;
  const pollInterval = 5000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, pollInterval));

    const statusRes = await fetch(`${BASE_URL}/jobs/recordInfo?taskId=${taskId}`, {
      headers: {
        "Authorization": `Bearer ${KIE_API_KEY}`,
      },
    });

    if (!statusRes.ok) {
      console.log(`[TTS] Poll attempt ${i + 1} returned ${statusRes.status}, retrying...`);
      continue;
    }

    const statusData = (await statusRes.json()) as any;
    const state = statusData.data?.state;

    console.log(`[TTS] Poll ${i + 1}/${maxAttempts}: state=${state}`);

    if (state === "success") {
      let resultUrls: string[] = [];
      try {
        const resultJson = JSON.parse(statusData.data?.resultJson || "{}");
        resultUrls = resultJson.resultUrls || resultJson.result_urls || [];
        if (resultUrls.length === 0 && resultJson.url) {
          resultUrls = [resultJson.url];
        }
        if (resultUrls.length === 0 && resultJson.audio_url) {
          resultUrls = [resultJson.audio_url];
        }
      } catch {
        console.log(`[TTS] Could not parse resultJson, trying raw data fields...`);
      }

      const audioUrl = resultUrls[0] ||
                       statusData.data?.result?.audio_url ||
                       statusData.data?.result?.url ||
                       statusData.data?.output?.audio_url ||
                       statusData.data?.output?.url;

      if (!audioUrl || typeof audioUrl !== "string") {
        throw new Error(`kie.ai TTS: Task succeeded but no audio URL found. Full response: ${JSON.stringify(statusData.data)}`);
      }

      console.log(`[TTS] Audio ready: ${audioUrl}`);

      let downloadUrl = audioUrl;
      try {
        const dlRes = await fetch(`${BASE_URL}/common/download-url`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${KIE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: audioUrl }),
        });
        if (dlRes.ok) {
          const dlData = (await dlRes.json()) as any;
          if (dlData.data && typeof dlData.data === "string") {
            downloadUrl = dlData.data;
            console.log(`[TTS] Got download URL: ${downloadUrl}`);
          }
        }
      } catch {
        console.log(`[TTS] Download URL conversion failed, using original URL`);
      }

      const audioRes = await fetch(downloadUrl);
      if (!audioRes.ok) {
        throw new Error(`Failed to download audio from ${downloadUrl}: ${audioRes.status}`);
      }

      const arrayBuffer = await audioRes.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } else if (state === "fail" || state === "failed" || state === "error") {
      const failMsg = statusData.data?.failMsg || statusData.data?.failCode || "Unknown error";
      throw new Error(`kie.ai TTS task failed: ${failMsg}`);
    }
  }

  throw new Error(`kie.ai TTS task timed out after ${maxAttempts * pollInterval / 1000}s (taskId: ${taskId})`);
}

export async function generateVoiceover(
  text: string,
  voiceId: string = "Brian"
): Promise<Buffer> {
  const isPresetVoice = AVAILABLE_VOICES.some(v => v.voice_id === voiceId);

  if (isPresetVoice) {
    return generateViaKieAi(text, voiceId);
  } else {
    return generateViaDirectElevenLabs(text, voiceId);
  }
}

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";

export interface Voice {
  voice_id: string;
  name: string;
  category: string;
  description: string;
}

const AVAILABLE_VOICES: Voice[] = [
  { voice_id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", category: "premade", description: "Calm, young female" },
  { voice_id: "9BWtsMINqrJLrRacOk9x", name: "Aria", category: "premade", description: "Expressive, young female" },
  { voice_id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger", category: "premade", description: "Confident male" },
  { voice_id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", category: "premade", description: "Soft, young female" },
  { voice_id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", category: "premade", description: "Upbeat female" },
  { voice_id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", category: "premade", description: "Casual, Australian male" },
  { voice_id: "JBFqnCBsd6RMkjVDRZzb", name: "George", category: "premade", description: "Warm, British male" },
  { voice_id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum", category: "premade", description: "Intense, transatlantic male" },
  { voice_id: "SAz9YHcvj6GT2YYXdXww", name: "River", category: "premade", description: "Confident, American non-binary" },
  { voice_id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", category: "premade", description: "Articulate, young male" },
  { voice_id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", category: "premade", description: "Seductive, Swedish female" },
  { voice_id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", category: "premade", description: "Confident, British female" },
  { voice_id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", category: "premade", description: "Warm, friendly female" },
  { voice_id: "bIHbv24MWmeRgasZH58o", name: "Will", category: "premade", description: "Friendly, young male" },
  { voice_id: "cgSgspJ2msm6clMCkdEj", name: "Jessica", category: "premade", description: "Expressive, female" },
  { voice_id: "cjVigY5qzO86Huf0OWal", name: "Eric", category: "premade", description: "Friendly, middle-aged male" },
  { voice_id: "iP95p4xoKVk53GoZ742B", name: "Chris", category: "premade", description: "Casual, male" },
  { voice_id: "nPczCjzI2devNBz1zQrb", name: "Brian", category: "premade", description: "Deep, narrator male" },
  { voice_id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", category: "premade", description: "Authoritative, British male" },
  { voice_id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", category: "premade", description: "Warm, British female" },
  { voice_id: "pqHfZKP75CvOlQylNhV4", name: "Bill", category: "premade", description: "Trustworthy, narrator male" },
];

const nameToIdMap = new Map<string, string>(
  AVAILABLE_VOICES.map(v => [v.name.toLowerCase(), v.voice_id])
);

export async function getVoices(): Promise<Voice[]> {
  return AVAILABLE_VOICES;
}

export async function generateVoiceover(
  text: string,
  voiceId: string = "Brian",
  userApiKey?: string
): Promise<Buffer> {
  const apiKey = userApiKey || ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ElevenLabs API key is not configured. Please add your API key in Settings or set ELEVENLABS_API_KEY.");
  }

  let resolvedId = voiceId;
  const byName = nameToIdMap.get(voiceId.toLowerCase());
  if (byName) {
    resolvedId = byName;
  }

  console.log(`[TTS] Generating voiceover: voice="${voiceId}" resolved_id="${resolvedId}" text_length=${text.length}`);

  const res = await fetch(`${ELEVENLABS_API_URL}/text-to-speech/${resolvedId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
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

  console.log(`[TTS] Audio response received, downloading...`);
  const arrayBuffer = await res.arrayBuffer();
  console.log(`[TTS] Audio downloaded: ${arrayBuffer.byteLength} bytes`);
  return Buffer.from(arrayBuffer);
}

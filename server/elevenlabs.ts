const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";

export interface Voice {
  voice_id: string;
  name: string;
  category: string;
  description: string;
}

const VOICE_DESCRIPTIONS: Record<string, string> = {
  "Rachel": "Calm, young female",
  "Aria": "Expressive, young female",
  "Roger": "Confident male",
  "Sarah": "Soft, young female",
  "Laura": "Upbeat female",
  "Charlie": "Casual, Australian male",
  "George": "Warm, British male",
  "Callum": "Intense, transatlantic male",
  "River": "Confident, American non-binary",
  "Liam": "Articulate, young male",
  "Charlotte": "Seductive, Swedish female",
  "Alice": "Confident, British female",
  "Matilda": "Warm, friendly female",
  "Will": "Friendly, young male",
  "Jessica": "Expressive, female",
  "Eric": "Friendly, middle-aged male",
  "Chris": "Casual, male",
  "Brian": "Deep, narrator male",
  "Daniel": "Authoritative, British male",
  "Lily": "Warm, British female",
  "Bill": "Trustworthy, narrator male",
};

let cachedVoiceMap: Map<string, string> | null = null;

async function fetchVoiceMap(): Promise<Map<string, string>> {
  if (cachedVoiceMap) return cachedVoiceMap;

  if (!ELEVENLABS_API_KEY) return new Map();

  try {
    const res = await fetch(`${ELEVENLABS_API_URL}/voices`, {
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      const map = new Map<string, string>();
      for (const v of data.voices || []) {
        map.set(v.name.toLowerCase(), v.voice_id);
      }
      cachedVoiceMap = map;
      console.log(`[TTS] Cached ${map.size} voices from ElevenLabs`);
      return map;
    }
  } catch (err) {
    console.error(`[TTS] Failed to fetch voices from ElevenLabs:`, err);
  }
  return new Map();
}

export async function getVoices(): Promise<Voice[]> {
  const voiceMap = await fetchVoiceMap();

  const voices: Voice[] = [];
  for (const [name, description] of Object.entries(VOICE_DESCRIPTIONS)) {
    const realId = voiceMap.get(name.toLowerCase()) || name;
    voices.push({
      voice_id: realId,
      name,
      category: "premade",
      description,
    });
  }
  return voices;
}

export async function generateVoiceover(
  text: string,
  voiceId: string = "Brian"
): Promise<Buffer> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  const voiceMap = await fetchVoiceMap();

  let resolvedVoiceId = voiceId;
  const lookupById = voiceMap.get(voiceId.toLowerCase());
  if (lookupById) {
    resolvedVoiceId = lookupById;
  }

  console.log(`[TTS] Using ElevenLabs API with voice: ${voiceId} (id: ${resolvedVoiceId})`);

  const res = await fetch(`${ELEVENLABS_API_URL}/text-to-speech/${resolvedVoiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
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

  console.log(`[TTS] ElevenLabs response received, downloading audio...`);
  const arrayBuffer = await res.arrayBuffer();
  console.log(`[TTS] Audio downloaded: ${arrayBuffer.byteLength} bytes`);
  return Buffer.from(arrayBuffer);
}

import Anthropic from "@anthropic-ai/sdk";
import type { ScriptAnalysis } from "@shared/schema";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface StoryBible {
  analysis: ScriptAnalysis;
  narrativeArc: {
    opening: string;
    rising: string;
    climax: string;
    resolution: string;
  };
  moodTimeline: Array<{
    sentenceRange: string;
    mood: string;
    lighting: string;
    colorShift: string;
    weather?: string;
  }>;
}

export interface VisualScene {
  sentenceIndices: number[];
  sentences: string[];
  visualBeat: string;
  isVisual: boolean;
  sceneDescription: string;
  mood: string;
  timeOfDay: string;
  location: string;
  charactersPresent: string[];
  aircraftPresent: string[];
  vehiclesPresent: string[];
  keyObjectsPresent: string[];
  lightingNote: string;
  weatherConditions: string;
  dramaticPurpose?: string;
  emotionalState?: string;
  environmentalContinuity?: string;
  characterStates?: Record<string, string>;
  objectStates?: Record<string, string>;
}

export interface SceneSequencePrompts {
  prompts: string[];
  shotLabels: string[];
  motionPrompts: string[];
  sceneDescription: string;
  mood: string;
  timeOfDay: string;
  cameraAngle: string;
  transitionNote: string;
}

interface CumulativeVisualMemory {
  sceneSummaries: string[];
  lastCharacterStates: Record<string, string>;
  lastVehicleStates: Record<string, string>;
  lastObjectStates: Record<string, string>;
  lastWeather: string;
  lastLighting: string;
  lastTimeOfDay: string;
  lastLocation: string;
  narrativeProgression: string;
  emotionalArc: string[];
}

function buildCumulativeMemory(
  allScenes: VisualScene[],
  currentIndex: number,
  storyBible: StoryBible
): CumulativeVisualMemory {
  const memory: CumulativeVisualMemory = {
    sceneSummaries: [],
    lastCharacterStates: {},
    lastVehicleStates: {},
    lastObjectStates: {},
    lastWeather: storyBible.analysis.visualStyle.atmosphere || "",
    lastLighting: storyBible.analysis.visualStyle.lighting || "",
    lastTimeOfDay: "",
    lastLocation: "",
    narrativeProgression: "",
    emotionalArc: [],
  };

  const lookback = Math.min(currentIndex, 5);
  const startIdx = currentIndex - lookback;

  for (let i = startIdx; i < currentIndex; i++) {
    const scene = allScenes[i];
    if (!scene) continue;

    const recentIdx = i - startIdx;
    memory.sceneSummaries.push(
      `[Scene ${i + 1}] ${scene.visualBeat} | Location: ${scene.location} | Time: ${scene.timeOfDay} | Lighting: ${scene.lightingNote || "not specified"} | Mood: ${scene.mood} | Weather: ${scene.weatherConditions || "not specified"} | Characters: ${scene.charactersPresent.join(", ") || "none"} | Aircraft: ${scene.aircraftPresent.join(", ") || "none"} | Vehicles: ${scene.vehiclesPresent.join(", ") || "none"}`
    );

    memory.lastWeather = scene.weatherConditions || memory.lastWeather;
    memory.lastLighting = scene.lightingNote || memory.lastLighting;
    memory.lastTimeOfDay = scene.timeOfDay || memory.lastTimeOfDay;
    memory.lastLocation = scene.location || memory.lastLocation;
    memory.emotionalArc.push(`Scene ${i + 1}: ${scene.mood} — ${scene.emotionalState || scene.visualBeat}`);

    if (scene.characterStates) {
      Object.assign(memory.lastCharacterStates, scene.characterStates);
    }
    for (const charName of scene.charactersPresent) {
      if (!memory.lastCharacterStates[charName]) {
        memory.lastCharacterStates[charName] = `Present in scene ${i + 1}: ${scene.visualBeat}`;
      }
    }

    if (scene.objectStates) {
      Object.assign(memory.lastObjectStates, scene.objectStates);
    }
  }

  const totalScenes = allScenes.length;
  const position = currentIndex / totalScenes;
  if (position < 0.15) memory.narrativeProgression = "OPENING — establishing the world, characters, and situation";
  else if (position < 0.35) memory.narrativeProgression = "RISING ACTION — tension is building, stakes are being raised";
  else if (position < 0.55) memory.narrativeProgression = "ESCALATION — approaching the central conflict or crisis";
  else if (position < 0.75) memory.narrativeProgression = "CLIMAX ZONE — maximum intensity, the turning point";
  else if (position < 0.9) memory.narrativeProgression = "FALLING ACTION — consequences unfolding, aftermath";
  else memory.narrativeProgression = "RESOLUTION — the story reaching its conclusion";

  return memory;
}

function buildIdentityBlock(
  scene: VisualScene,
  analysis: ScriptAnalysis,
  includeAll: boolean = false
): string {
  const blocks: string[] = [];

  const charsToInclude = includeAll
    ? analysis.characters
    : analysis.characters.filter((c: any) =>
        scene.charactersPresent.some(name =>
          c.name.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(c.name.toLowerCase())
        )
      );

  for (const char of charsToInclude) {
    blocks.push(`═══ CHARACTER: ${char.name} (${char.role}) ═══
VISUAL DNA (COPY EXACTLY — DO NOT MODIFY, SUMMARIZE, OR PARAPHRASE):
${char.appearance}
${char.signatureFeatures ? `\nIDENTITY FINGERPRINT (repeat in EVERY prompt where ${char.name} appears): ${char.signatureFeatures}` : ""}
THIS CHARACTER MUST LOOK IDENTICAL IN EVERY SINGLE IMAGE. Same face, same body, same clothing, same distinctive features. If you change ANY detail, the visual story breaks.`);
  }

  const jetsToInclude = includeAll
    ? analysis.jets
    : analysis.jets.filter((j: any) =>
        scene.aircraftPresent.some(name =>
          j.name.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(j.name.toLowerCase())
        )
      );

  for (const jet of jetsToInclude) {
    blocks.push(`═══ AIRCRAFT: ${jet.name} (${jet.type}) ═══
VISUAL DNA (COPY EXACTLY — DO NOT MODIFY, SUMMARIZE, OR PARAPHRASE):
${jet.visualDetails}
${jet.signatureFeatures ? `\nIDENTITY FINGERPRINT (repeat in EVERY prompt where ${jet.name} appears): ${jet.signatureFeatures}` : ""}
THIS AIRCRAFT MUST LOOK IDENTICAL IN EVERY SINGLE IMAGE. Same paint scheme, same markings, same silhouette. If you change ANY detail, the visual story breaks.`);
  }

  const vehicles = analysis.vehicles || [];
  const vehiclesToInclude = includeAll
    ? vehicles
    : vehicles.filter((v: any) =>
        (scene.vehiclesPresent || []).some(name =>
          v.name.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(v.name.toLowerCase())
        )
      );

  for (const vehicle of vehiclesToInclude) {
    blocks.push(`═══ VEHICLE: ${vehicle.name} (${vehicle.type}) ═══
VISUAL DNA (COPY EXACTLY — DO NOT MODIFY, SUMMARIZE, OR PARAPHRASE):
${vehicle.visualDetails}
${vehicle.signatureFeatures ? `\nIDENTITY FINGERPRINT (repeat in EVERY prompt where ${vehicle.name} appears): ${vehicle.signatureFeatures}` : ""}
THIS VEHICLE MUST LOOK IDENTICAL IN EVERY SINGLE IMAGE. Same hull/body, same markings, same paint. If you change ANY detail, the visual story breaks.`);
  }

  const keyObjects = analysis.keyObjects || [];
  const objectsToInclude = includeAll
    ? keyObjects
    : keyObjects.filter((o: any) =>
        (scene.keyObjectsPresent || []).some(name =>
          o.name.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(o.name.toLowerCase())
        )
      );

  for (const obj of objectsToInclude) {
    blocks.push(`═══ KEY OBJECT: ${obj.name} (${obj.type}) ═══
VISUAL DNA (COPY EXACTLY — DO NOT MODIFY, SUMMARIZE, OR PARAPHRASE):
${obj.visualDetails}
${obj.signatureFeatures ? `\nIDENTITY FINGERPRINT: ${obj.signatureFeatures}` : ""}`);
  }

  const locationMatch = analysis.locations.find((l: any) =>
    l.name.toLowerCase().includes(scene.location.toLowerCase()) ||
    scene.location.toLowerCase().includes(l.name.toLowerCase())
  );

  if (locationMatch) {
    blocks.push(`═══ LOCATION: ${locationMatch.name} ═══
VISUAL DNA (COPY EXACTLY — DO NOT MODIFY, SUMMARIZE, OR PARAPHRASE):
${locationMatch.visualDetails}
${locationMatch.signatureFeatures ? `\nLOCATION FINGERPRINT: ${locationMatch.signatureFeatures}` : ""}
THIS LOCATION MUST LOOK IDENTICAL IN EVERY SCENE SET HERE. Same structures, same ground, same horizon, same architectural details.`);
  } else {
    blocks.push(`═══ LOCATION: ${scene.location} ═══
No detailed location reference available. Maintain visual consistency with any previous depictions of this location.`);
  }

  return blocks.join("\n\n");
}

function parseJsonResponse(text: string): any {
  let jsonStr = text.trim();

  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  } else {
    const firstBrace = jsonStr.indexOf("{");
    const lastBrace = jsonStr.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    }
  }

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    jsonStr = jsonStr
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]");
    try {
      return JSON.parse(jsonStr);
    } catch (e2) {
      const repaired = repairTruncatedJson(text);
      if (repaired) return repaired;
      throw new Error(`Failed to parse AI response as JSON. The AI may have returned an unexpected format. Please try again.`);
    }
  }
}

function repairTruncatedJson(text: string): any | null {
  let jsonStr = text.trim();
  const firstBrace = jsonStr.indexOf("{");
  if (firstBrace === -1) return null;
  jsonStr = jsonStr.substring(firstBrace);

  jsonStr = jsonStr
    .replace(/,\s*$/g, "")
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]");

  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escaped = false;
  let lastValidPos = 0;

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') openBraces++;
    if (ch === '}') { openBraces--; lastValidPos = i; }
    if (ch === '[') openBrackets++;
    if (ch === ']') { openBrackets--; lastValidPos = i; }
  }

  if (openBraces === 0 && openBrackets === 0 && lastValidPos > 0) {
    try {
      return JSON.parse(jsonStr);
    } catch {}
  }

  if (inString) {
    jsonStr += '"';
  }

  jsonStr = jsonStr.replace(/,\s*$/g, "");

  while (openBrackets > 0) { jsonStr += "]"; openBrackets--; }
  while (openBraces > 0) { jsonStr += "}"; openBraces--; }

  try {
    return JSON.parse(jsonStr);
  } catch {
    const truncPos = jsonStr.lastIndexOf('"}');
    if (truncPos > 0) {
      let attempt = jsonStr.substring(0, truncPos + 2);
      attempt = attempt.replace(/,\s*$/g, "");
      let ob = 0, obrk = 0;
      let inS = false, esc = false;
      for (let i = 0; i < attempt.length; i++) {
        const c = attempt[i];
        if (esc) { esc = false; continue; }
        if (c === '\\') { esc = true; continue; }
        if (c === '"') { inS = !inS; continue; }
        if (inS) continue;
        if (c === '{') ob++;
        if (c === '}') ob--;
        if (c === '[') obrk++;
        if (c === ']') obrk--;
      }
      while (obrk > 0) { attempt += "]"; obrk--; }
      while (ob > 0) { attempt += "}"; ob--; }
      try {
        return JSON.parse(attempt);
      } catch { return null; }
    }
    return null;
  }
}

function repairPromptArrayJson(text: string): any | null {
  try {
    let jsonStr = text.trim();
    const firstBrace = jsonStr.indexOf("{");
    if (firstBrace === -1) return null;
    jsonStr = jsonStr.substring(firstBrace);

    const promptsMatch = jsonStr.match(/"prompts"\s*:\s*\[/);
    if (!promptsMatch) return null;

    const promptsStart = jsonStr.indexOf(promptsMatch[0]) + promptsMatch[0].length;

    const completePrompts: string[] = [];
    let pos = promptsStart;
    let inStr = false;
    let escaped = false;
    let currentPrompt = "";

    while (pos < jsonStr.length) {
      const ch = jsonStr[pos];
      if (escaped) { escaped = false; currentPrompt += ch; pos++; continue; }
      if (ch === '\\' && inStr) { escaped = true; currentPrompt += ch; pos++; continue; }

      if (ch === '"' && !inStr) {
        inStr = true;
        currentPrompt = "";
        pos++;
        continue;
      }

      if (ch === '"' && inStr) {
        inStr = false;
        completePrompts.push(currentPrompt);
        pos++;
        continue;
      }

      if (inStr) {
        currentPrompt += ch;
        pos++;
        continue;
      }

      if (ch === ']') break;
      pos++;
    }

    if (completePrompts.length < 2) return null;

    const shotLabelsMatch = jsonStr.match(/"shotLabels"\s*:\s*\[/);
    let shotLabels: string[] = [];
    if (shotLabelsMatch) {
      const slStart = jsonStr.indexOf(shotLabelsMatch[0]) + shotLabelsMatch[0].length;
      let slPos = slStart;
      let slInStr = false;
      let slEsc = false;
      let slCurrent = "";

      while (slPos < jsonStr.length && slPos < promptsStart - promptsMatch[0].length) {
        const ch = jsonStr[slPos];
        if (slEsc) { slEsc = false; slCurrent += ch; slPos++; continue; }
        if (ch === '\\' && slInStr) { slEsc = true; slCurrent += ch; slPos++; continue; }
        if (ch === '"' && !slInStr) { slInStr = true; slCurrent = ""; slPos++; continue; }
        if (ch === '"' && slInStr) { slInStr = false; shotLabels.push(slCurrent); slPos++; continue; }
        if (!slInStr && ch === ']') break;
        if (slInStr) slCurrent += ch;
        slPos++;
      }
    }

    const sceneDescMatch = jsonStr.match(/"sceneDescription"\s*:\s*"([^"]*?)"/);
    const moodMatch = jsonStr.match(/"mood"\s*:\s*"([^"]*?)"/);
    const todMatch = jsonStr.match(/"timeOfDay"\s*:\s*"([^"]*?)"/);
    const camMatch = jsonStr.match(/"cameraAngle"\s*:\s*"([^"]*?)"/);
    const transMatch = jsonStr.match(/"transitionNote"\s*:\s*"([^"]*?)"/);

    return {
      sceneDescription: sceneDescMatch?.[1] || "",
      mood: moodMatch?.[1] || "",
      timeOfDay: todMatch?.[1] || "",
      cameraAngle: camMatch?.[1] || "",
      transitionNote: transMatch?.[1] || "",
      shotLabels: shotLabels,
      prompts: completePrompts,
    };
  } catch {
    return null;
  }
}

function validateAndFillSentenceCoverage(
  visualScenes: VisualScene[],
  sentences: string[],
  analysis: any
): VisualScene[] {
  const coveredIndices = new Set<number>();
  for (const scene of visualScenes) {
    for (const idx of scene.sentenceIndices) {
      coveredIndices.add(idx);
    }
  }

  const missingIndices: number[] = [];
  for (let i = 0; i < sentences.length; i++) {
    if (!coveredIndices.has(i)) {
      missingIndices.push(i);
    }
  }

  if (missingIndices.length === 0) {
    console.log(`Sentence coverage check: All ${sentences.length} sentences covered across ${visualScenes.length} visual scenes.`);
    return visualScenes;
  }

  console.warn(`Sentence coverage gap: ${missingIndices.length} of ${sentences.length} sentences were not covered. Filling gaps...`);

  const gaps: number[][] = [];
  let currentGap: number[] = [missingIndices[0]];
  for (let i = 1; i < missingIndices.length; i++) {
    if (missingIndices[i] === missingIndices[i - 1] + 1) {
      currentGap.push(missingIndices[i]);
    } else {
      gaps.push(currentGap);
      currentGap = [missingIndices[i]];
    }
  }
  gaps.push(currentGap);

  const fillScenes: VisualScene[] = [];
  for (const gap of gaps) {
    const chunkSize = 3;
    for (let i = 0; i < gap.length; i += chunkSize) {
      const indices = gap.slice(i, i + chunkSize);
      const gapSentences = indices.map(idx => sentences[idx]);
      fillScenes.push({
        sentenceIndices: indices,
        sentences: gapSentences,
        visualBeat: gapSentences.join(" "),
        isVisual: true,
        sceneDescription: gapSentences.join(" "),
        mood: "Cinematic",
        timeOfDay: analysis.timePeriod || "Day",
        location: analysis.setting || "Unspecified",
        charactersPresent: analysis.characters?.map((c: any) => c.name) || [],
        aircraftPresent: analysis.jets?.map((j: any) => j.name) || [],
        vehiclesPresent: (analysis.vehicles || []).map((v: any) => v.name) || [],
        keyObjectsPresent: (analysis.keyObjects || []).map((o: any) => o.name) || [],
        lightingNote: analysis.visualStyle?.lighting || "Cinematic lighting",
        weatherConditions: "",
      });
    }
  }

  console.log(`Created ${fillScenes.length} gap-fill scenes for ${missingIndices.length} missing sentences.`);

  const allScenes = [...visualScenes, ...fillScenes];
  allScenes.sort((a, b) => (a.sentenceIndices[0] ?? 0) - (b.sentenceIndices[0] ?? 0));
  return allScenes;
}

async function analyzeStoryBibleOnly(script: string): Promise<StoryBible> {
  const stream = anthropic.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 128000,
    messages: [
      {
        role: "user",
        content: `You are an elite film director, visual storytelling expert, and master of visual consistency. Read this ENTIRE script carefully and create a comprehensive Story Bible. The Story Bible is the SINGLE SOURCE OF TRUTH for how every character, aircraft, vehicle, object, and location looks across ALL generated images. Any vagueness here will destroy visual consistency.

SCRIPT:
"""
${script}
"""

Return ONLY a JSON object (no markdown, no code fences, no extra text).

{
  "analysis": {
    "title": "string",
    "genre": "string",
    "setting": "string",
    "timePeriod": "string",
    "characters": [
      {
        "name": "string",
        "role": "string",
        "description": "2-3 sentences about their role and significance in the story",
        "appearance": "EXHAUSTIVE visual description that will be COPIED WORD-FOR-WORD into every image prompt. This is the MASTER REFERENCE. You MUST include ALL of the following with EXTREME specificity — no vague terms like 'average build' or 'military uniform':\\n\\n1. BODY: Exact age (e.g. 'mid-40s'), height (e.g. '6 foot 1'), build (e.g. 'broad-shouldered and barrel-chested with thick forearms'), posture (e.g. 'stands ramrod straight with shoulders back'), skin tone (e.g. 'weathered olive complexion with sun-darkened forearms')\\n\\n2. FACE: Eye color AND shape (e.g. 'narrow steel-gray eyes with deep crow's feet'), eyebrow style (e.g. 'thick dark eyebrows with a natural arch'), nose (e.g. 'slightly crooked aquiline nose, broken once'), jaw and chin (e.g. 'square jaw with a shallow cleft chin'), cheekbones (e.g. 'high prominent cheekbones'), facial hair status (e.g. 'clean-shaven with visible five-o'clock shadow along the jawline'), scars/marks (e.g. 'thin 2-inch scar across left temple'), expression lines (e.g. 'deep furrows between eyebrows from years of squinting into sun')\\n\\n3. HAIR: Exact color (e.g. 'dark brown with silver-gray streaks at temples'), length (e.g. 'close-cropped, approximately 1 inch on top'), style (e.g. 'regulation military cut, slightly longer on top, combed back'), texture (e.g. 'thick and coarse')\\n\\n4. CLOTHING: Every garment with EXACT colors, materials, fit, and condition. Military: exact uniform type (e.g. 'olive-drab Nomex CWU-27/P flight suit'), patches and insignia with EXACT placement (e.g. 'American flag patch on left shoulder, squadron patch on right — a black falcon diving through a red circle'), rank insignia (e.g. 'silver oak leaf on collar points'), name tape (e.g. 'HARRISON stitched in black block letters on right breast'), zippers, pockets, pen holder, condition (e.g. 'slightly faded at the knees and elbows from wear')\\n\\n5. ACCESSORIES: Every item — helmet (exact type, color, visor style, any markings or custom paint), goggles/visor, gloves (type, color, material), watch (wrist, type), dog tags (how they hang), G-suit or harness (color, condition), survival vest, boots (color, type, condition), belt, sidearm holster, oxygen mask (type, how it connects)\\n\\n6. DISTINCTIVE FEATURES (3-5 unique traits that MUST appear in EVERY image): These are the visual anchors that make this character instantly recognizable — e.g. 'the distinctive crooked nose, the silver-gray streaks at the temples, the thin scar on the left temple, and the black falcon squadron patch on the right shoulder'\\n\\nMinimum 8-12 sentences. The more specific detail here, the more consistent this character will look across ALL generated images. Never use vague terms.",
        "signatureFeatures": "ONE sentence with the 4-5 most instantly recognizable visual features of this character that MUST appear identically in every single image. Format: 'The [descriptor] [feature], the [descriptor] [feature], the [descriptor] [feature], and the [descriptor] [feature].' Example: 'The crooked aquiline nose, the steel-gray eyes with deep crow's feet, the silver-gray streaks at the temples, and the black falcon squadron patch on the right shoulder.'"
      }
    ],
    "jets": [
      {
        "name": "string",
        "type": "string",
        "description": "1-2 sentences about its role in the story",
        "visualDetails": "EXHAUSTIVE visual description that will be COPIED WORD-FOR-WORD into every image prompt. You MUST include ALL of the following with EXTREME specificity:\\n\\n1. SILHOUETTE: Overall airframe shape from multiple angles (front, side, 3/4), wing planform (e.g. 'sharply swept delta wings at 42-degree leading edge sweep'), distinctive profile features\\n\\n2. WINGS: Configuration (high/mid/low mount), sweep angle, wing fences/leading edge extensions, hardpoints and pylons (number, position), wingtip details (rails, pods, lights), control surfaces\\n\\n3. FUSELAGE: Cross-section shape (e.g. 'faceted angular fuselage with flat panel surfaces'), intake design (e.g. 'twin angular trapezoidal intakes with radar-absorbing wedges'), nose section, radome shape\\n\\n4. ENGINES: Count, type, intake shape, exhaust nozzle style (e.g. 'twin General Electric F404 turbofans with convergent-divergent nozzles'), afterburner appearance when lit, exhaust staining patterns\\n\\n5. COCKPIT: Canopy style (e.g. 'bubble canopy with single-piece polycarbonate, gold-tinted anti-glare coating'), canopy frame structure, HUD visible, ejection seat headrest visible through canopy\\n\\n6. TAIL: Configuration (conventional, V-tail, twin vertical, canted), tail shape, rudder details\\n\\n7. PAINT AND MARKINGS: EXACT paint scheme with specific colors and finish (e.g. 'overall matte dark gray FS36118 with lighter ghost gray FS36375 underside'), squadron markings with EXACT placement and design, tail code/numbers (e.g. 'tail number AF-142 in white stencil on vertical stabilizer'), national insignia (exact position), nose art if any, any unique markings\\n\\n8. WEATHERING: Exhaust staining pattern, gun gas staining, oil streaks, paint wear, panel line visibility, rain streaks, battle damage if applicable\\n\\n9. DISTINCTIVE FEATURES that make this aircraft instantly recognizable across frames\\n\\nMinimum 8-12 sentences.",
        "signatureFeatures": "ONE sentence with the 4-5 most instantly recognizable visual features. Example: 'The sharply faceted matte-black angular fuselage, the flat-panel stealth geometry, the distinctive V-tail ruddervators, and the gold-tinted single-piece canopy.'"
      }
    ],
    "vehicles": [
      {
        "name": "string",
        "type": "string (warship, aircraft carrier, tank, helicopter, truck, submarine, destroyer, frigate, patrol boat, APC, HUMVEE, etc.)",
        "description": "1-2 sentences about its role in the story",
        "visualDetails": "EXHAUSTIVE visual description — same level of detail as aircraft. Include: hull/body shape, dimensions/scale relative to people, superstructure layout, armament positions, radar/antenna arrays, EXACT paint scheme with specific colors and finish, hull numbers and markings with EXACT placement, national insignia/flags, deck features, weathering/rust/damage, wake pattern or exhaust, and distinctive identification features. Minimum 8-12 sentences.",
        "signatureFeatures": "ONE sentence with the 4-5 most instantly recognizable visual features."
      }
    ],
    "keyObjects": [
      {
        "name": "string",
        "type": "string (control panel, radar screen, missile, ejection seat, helmet, weapon system, radio, command console, etc.)",
        "description": "1 sentence about its narrative significance",
        "visualDetails": "EXHAUSTIVE visual description — dimensions/scale, shape, materials and surface finish with texture, EXACT color scheme, labels/markings/text/numbers, wear condition, illumination (screens, LEDs, gauges), and distinctive features. Minimum 4-8 sentences.",
        "signatureFeatures": "ONE sentence with the 3-4 most recognizable features."
      }
    ],
    "locations": [
      {
        "name": "string",
        "description": "1 sentence about its narrative significance",
        "visualDetails": "EXHAUSTIVE visual description — terrain type and ground surface texture, ALL structures with architectural details (shape, materials, scale), default sky conditions, lighting quality and direction, atmosphere/visibility, dominant colors, scale at near/mid/far distances, vegetation, ambient environmental details (heat shimmer, wind debris, sea state), unique features. Minimum 8-12 sentences.",
        "signatureFeatures": "ONE sentence with the 4-5 most recognizable environmental features."
      }
    ],
    "visualStyle": {
      "baseStyle": "Unreal Engine 5 cinematic 3D render, high-fidelity CGI with slight stylization, cinematic 8K, 16:9 widescreen",
      "lighting": "Comprehensive lighting approach: primary light direction, fill light, key-to-fill ratio, color temperature ranges, how lighting evolves through the story from opening to climax to resolution",
      "colorPalette": "Specific colors with emotional weight — not 'blue' but 'cold steel blue of predawn anxiety'. Define the core palette and how it shifts through the narrative arc",
      "atmosphere": "The visual feeling of the air itself — density, clarity, particles, emotional weight. How the atmosphere changes with the story's tension",
      "weatherProgression": "DETAILED progression of weather through the entire story. Example: 'Opens with crystal-clear pre-dawn sky with scattered high cirrus, builds to partly cloudy by mid-morning as tension rises, transitions to building cumulonimbus towers during the escalation phase, breaks into full thunderstorm with rain and lightning at the climax, clears to dramatic post-storm golden light for the resolution.' This is critical for scene-to-scene visual continuity."
    }
  },
  "narrativeArc": {
    "opening": "What the audience feels at the start — the emotional hook and visual tone",
    "rising": "How tension builds beat by beat — what's at stake and how the visuals should escalate",
    "climax": "The moment of maximum intensity — the visual and emotional peak",
    "resolution": "How it resolves — what visual tone lingers with the audience"
  },
  "moodTimeline": [
    {
      "sentenceRange": "Sentences X-Y",
      "mood": "SPECIFIC emotional state, not generic. Example: 'quiet dread beneath forced professional calm' not just 'tense'",
      "lighting": "How lighting reinforces this mood — EXACT direction, quality (hard/soft), color temperature (in Kelvin if possible), shadow depth, any special effects (god rays, rim light, volumetric fog)",
      "colorShift": "How the color palette shifts from the previous segment to support the new emotion — what warms, what cools, what saturates, what desaturates",
      "weather": "EXACT weather and atmospheric conditions during this segment — cloud types, coverage percentage, precipitation, wind direction and speed indicators, visibility range, atmospheric particles"
    }
  ]
}

CRITICAL REQUIREMENTS:
1. ALL visual descriptions MUST be EXHAUSTIVELY detailed because they get COPIED WORD-FOR-WORD into every image prompt. Vague descriptions = inconsistent images.
2. The signatureFeatures for each element is the MOST IMPORTANT field — it's the 4-5 features that MUST appear identically in every single generated image. Choose the most visually distinctive and recognizable features.
3. weatherProgression must describe weather changes through the ENTIRE story — this is how we maintain weather continuity across scenes.
4. Character appearances must be so detailed that an artist could draw them from the description alone, with zero ambiguity.
5. NEVER use vague terms like "military uniform" — specify the EXACT type, color, patches, condition.
Output ONLY valid JSON, nothing else.`,
      },
    ],
  });

  const message = await stream.finalMessage();
  if (message.stop_reason === "max_tokens") {
    console.warn("Story Bible: Claude response truncated (max_tokens). Attempting JSON repair...");
  }
  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type from Claude");

  const result = parseJsonResponse(content.text);
  if (!result.analysis) throw new Error("AI returned an incomplete story analysis. Please try again.");

  const analysis = result.analysis;
  if (!analysis.characters) analysis.characters = [];
  if (!analysis.jets) analysis.jets = [];
  if (!analysis.vehicles) analysis.vehicles = [];
  if (!analysis.keyObjects) analysis.keyObjects = [];
  if (!analysis.locations) analysis.locations = [];
  if (!analysis.visualStyle) {
    analysis.visualStyle = {
      baseStyle: "Unreal Engine 5 cinematic 3D render, high-fidelity CGI with slight stylization, cinematic",
      lighting: "Dramatic cinematic lighting",
      colorPalette: "Military tones",
      atmosphere: "Cinematic",
      weatherProgression: "",
    };
  }

  return {
    analysis,
    narrativeArc: result.narrativeArc || { opening: "", rising: "", climax: "", resolution: "" },
    moodTimeline: result.moodTimeline || [],
  };
}

async function analyzeVisualScenesChunk(
  script: string,
  sentences: string[],
  startIndex: number,
  endIndex: number,
  storyBible: StoryBible,
  chunkNumber: number,
  totalChunks: number,
): Promise<VisualScene[]> {
  const chunkSentences = sentences.slice(startIndex, endIndex);
  const numberedSentences = chunkSentences.map((s, i) => `[${startIndex + i}] ${s}`).join("\n");

  const charSummary = storyBible.analysis.characters.map((c: any) =>
    `${c.name} (${c.role}): ${c.description}. Visual Fingerprint: ${c.signatureFeatures || "See appearance details"}`
  ).join("\n");

  const jetSummary = storyBible.analysis.jets.map((j: any) =>
    `${j.name} (${j.type}): ${j.description}. Visual Fingerprint: ${j.signatureFeatures || "See visual details"}`
  ).join("\n");

  const vehicleSummary = (storyBible.analysis.vehicles || []).map((v: any) =>
    `${v.name} (${v.type}): ${v.description}. Visual Fingerprint: ${v.signatureFeatures || "See visual details"}`
  ).join("\n");

  const objectSummary = (storyBible.analysis.keyObjects || []).map((o: any) =>
    `${o.name} (${o.type}): ${o.description}`
  ).join("\n");

  const locationSummary = storyBible.analysis.locations.map((l: any) =>
    `${l.name}: ${l.description}. Visual Fingerprint: ${l.signatureFeatures || "See visual details"}`
  ).join("\n");

  const stream = anthropic.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 128000,
    messages: [
      {
        role: "user",
        content: `You are an elite film director creating visual scene breakdowns with deep narrative understanding. You already have the Story Bible. Now break this PORTION of the script into visual beats.

═══════════════════════════════════════════
STORY BIBLE CONTEXT:
═══════════════════════════════════════════
- Title: "${storyBible.analysis.title}" (${storyBible.analysis.genre}, ${storyBible.analysis.timePeriod})
- Setting: ${storyBible.analysis.setting}
- Narrative Arc:
  OPENING: ${storyBible.narrativeArc.opening}
  RISING: ${storyBible.narrativeArc.rising}
  CLIMAX: ${storyBible.narrativeArc.climax}
  RESOLUTION: ${storyBible.narrativeArc.resolution}

CHARACTERS:
${charSummary || "None identified"}

AIRCRAFT:
${jetSummary || "None identified"}

VEHICLES:
${vehicleSummary || "None identified"}

KEY OBJECTS:
${objectSummary || "None identified"}

LOCATIONS:
${locationSummary || "None identified"}

WEATHER PROGRESSION:
${storyBible.analysis.visualStyle.weatherProgression || "Not specified"}

MOOD TIMELINE:
${storyBible.moodTimeline.map(m => `${m.sentenceRange}: ${m.mood} | Lighting: ${m.lighting} | Weather: ${m.weather || "not specified"}`).join("\n") || "Not specified"}
═══════════════════════════════════════════

This is chunk ${chunkNumber} of ${totalChunks} of the full script.
Sentences are numbered with their GLOBAL index.

SCRIPT CHUNK (sentences ${startIndex} to ${endIndex - 1}):
${numberedSentences}

FULL SCRIPT for overall context:
"""
${script}
"""

Return ONLY a JSON object with a "visualScenes" array:
{
  "visualScenes": [
    {
      "sentenceIndices": [${startIndex}, ${startIndex + 1}],
      "sentences": ["The grouped sentences from the script"],
      "visualBeat": "What this moment shows visually AND what it MEANS emotionally — the subtext, not just the surface action (1-2 sentences)",
      "isVisual": true,
      "sceneDescription": "Rich cinematic description of what a camera would capture — character body language, facial micro-expressions, environmental details that mirror emotional state, what the audience should FEEL seeing this frame (3-4 sentences)",
      "dramaticPurpose": "ESTABLISH/ESCALATE/REVEAL/CLIMAX/TRANSITION/AFTERMATH/CONTRAST — and a brief explanation of WHY",
      "emotionalState": "What each character present is feeling right now, based on what just happened and what's about to happen. Be specific: 'forced calm masking rising dread' not just 'nervous'",
      "mood": "Specific emotional atmosphere — 'oppressive silence before the storm' not just 'tense'",
      "timeOfDay": "Exact time reference consistent with the weather progression timeline",
      "location": "Match EXACTLY to a location name from the Story Bible",
      "charactersPresent": ["Name — must match Story Bible names EXACTLY"],
      "aircraftPresent": ["Aircraft name — must match Story Bible names EXACTLY"],
      "vehiclesPresent": ["Vehicle name — must match Story Bible names EXACTLY"],
      "keyObjectsPresent": ["Object name — must match Story Bible names EXACTLY"],
      "lightingNote": "Specific lighting tied to emotion AND time of day AND weather — 'harsh overhead noon sun casting deep shadows under brow ridges, emphasizing the character's grim determination' not just 'bright'",
      "weatherConditions": "EXACT weather matching the weather progression timeline — cloud types, coverage, precipitation, wind, visibility, atmospheric particles. Must be consistent with the mood timeline.",
      "environmentalContinuity": "What PERSISTS from the previous scene and what has CHANGED — 'Smoke from the explosion in the previous scene is still visible on the horizon, but the sky has darkened further with approaching storm clouds. Debris from the impact is scattered across the tarmac.' Leave empty ONLY for the very first scene.",
      "characterStates": {"CharacterName": "Current physical and emotional state — 'standing rigid at attention, jaw clenched, left hand gripping helmet at his side, knuckles white, eyes fixed on the horizon with barely contained fury'"},
      "objectStates": {"ObjectName": "Current state of any important objects — 'radar screen showing two blips converging from the northwest, green phosphor glow illuminating the operator's face'"}
    }
  ]
}

CRITICAL RULES:
1. NEVER skip any sentence. Every sentence index from ${startIndex} to ${endIndex - 1} MUST appear in exactly one visual beat.
2. sentenceIndices MUST use the GLOBAL indices shown in brackets.
3. Group 1-5 sentences per visual beat. Merge dialogue with action.
4. READ FOR SUBTEXT: "He's on his own" isn't just a fact — it's isolation, vulnerability, the weight of responsibility. Capture THAT in the sceneDescription.
5. EMOTIONAL CONTINUITY: Each scene's emotionalState should acknowledge what just happened in the previous beat and how that affects the characters NOW.
6. ENVIRONMENTAL CONTINUITY: Weather, smoke, damage, debris, lighting changes — these PERSIST between scenes. A battle leaves wreckage. An explosion leaves smoke. Time passing changes sun position.
7. CHARACTER STATES: Track how each character's physical and emotional state EVOLVES. If they were tense in scene 3, that tension should still be visible in scene 4 unless something has changed.
8. WEATHER MUST follow the weatherProgression from the Story Bible. Don't invent random weather — it should match the timeline.
9. Think like a film editor. Include B-roll beats, reaction shots, environmental establishing shots where the story implies them.
10. Mark truly non-visual content as isVisual:false, but try hard to find visual anchors for everything.
- Output ONLY valid JSON, nothing else.`,
      },
    ],
  });

  const message = await stream.finalMessage();
  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type from Claude");

  if (message.stop_reason === "max_tokens") {
    console.warn(`Chunk ${chunkNumber}: Claude response truncated. Attempting repair...`);
  }

  const result = parseJsonResponse(content.text);

  if (!result.visualScenes || !Array.isArray(result.visualScenes) || result.visualScenes.length === 0) {
    console.warn(`Chunk ${chunkNumber}: No visual scenes returned. Creating fallback.`);
    const fallbackScenes: VisualScene[] = [];
    for (let i = startIndex; i < endIndex; i += 3) {
      const indices = [];
      const sents = [];
      for (let j = i; j < Math.min(i + 3, endIndex); j++) {
        indices.push(j);
        sents.push(sentences[j]);
      }
      fallbackScenes.push({
        sentenceIndices: indices,
        sentences: sents,
        visualBeat: sents.join(" "),
        isVisual: true,
        sceneDescription: sents.join(" "),
        mood: "Cinematic",
        timeOfDay: storyBible.analysis.timePeriod || "Day",
        location: storyBible.analysis.setting || "Unspecified",
        charactersPresent: storyBible.analysis.characters?.map((c: any) => c.name) || [],
        aircraftPresent: storyBible.analysis.jets?.map((j: any) => j.name) || [],
        vehiclesPresent: (storyBible.analysis.vehicles || []).map((v: any) => v.name) || [],
        keyObjectsPresent: (storyBible.analysis.keyObjects || []).map((o: any) => o.name) || [],
        lightingNote: storyBible.analysis.visualStyle?.lighting || "Cinematic lighting",
        weatherConditions: "",
      });
    }
    return fallbackScenes;
  }

  return result.visualScenes.map((vs: any) => ({
    sentenceIndices: vs.sentenceIndices || [],
    sentences: vs.sentences || [],
    visualBeat: vs.visualBeat || "",
    isVisual: vs.isVisual !== false,
    sceneDescription: vs.sceneDescription || vs.visualBeat || "",
    mood: vs.mood || "Intense",
    timeOfDay: vs.timeOfDay || "Day",
    location: vs.location || "Unspecified",
    charactersPresent: vs.charactersPresent || [],
    aircraftPresent: vs.aircraftPresent || [],
    vehiclesPresent: vs.vehiclesPresent || [],
    keyObjectsPresent: vs.keyObjectsPresent || [],
    lightingNote: vs.lightingNote || storyBible.analysis.visualStyle?.lighting || "Cinematic lighting",
    weatherConditions: vs.weatherConditions || "",
    dramaticPurpose: vs.dramaticPurpose || "",
    emotionalState: vs.emotionalState || vs.mood || "",
    environmentalContinuity: vs.environmentalContinuity || "",
    characterStates: vs.characterStates || {},
    objectStates: vs.objectStates || {},
  }));
}

export async function analyzeFullStory(
  script: string,
  onProgress?: (detail: string, current: number, total: number) => void
): Promise<{ storyBible: StoryBible; visualScenes: VisualScene[] }> {
  const sentences = splitIntoSentences(script);
  const CHUNK_THRESHOLD = 150;

  if (sentences.length > CHUNK_THRESHOLD) {
    console.log(`Long script detected: ${sentences.length} sentences. Using chunked analysis.`);

    onProgress?.("AI is reading your entire script to build a comprehensive Story Bible...", 1, 4);
    const storyBible = await analyzeStoryBibleOnly(script);

    const CHUNK_SIZE = 50;
    const chunks: { start: number; end: number }[] = [];
    for (let i = 0; i < sentences.length; i += CHUNK_SIZE) {
      chunks.push({ start: i, end: Math.min(i + CHUNK_SIZE, sentences.length) });
    }

    let allVisualScenes: VisualScene[] = [];
    for (let c = 0; c < chunks.length; c++) {
      const chunk = chunks[c];
      onProgress?.(
        `Breaking sentences ${chunk.start + 1}-${chunk.end} into visual beats (chunk ${c + 1}/${chunks.length})...`,
        2,
        4
      );

      const chunkScenes = await analyzeVisualScenesChunk(
        script,
        sentences,
        chunk.start,
        chunk.end,
        storyBible,
        c + 1,
        chunks.length,
      );
      allVisualScenes = allVisualScenes.concat(chunkScenes);
    }

    const visualScenes = validateAndFillSentenceCoverage(allVisualScenes, sentences, storyBible.analysis);
    return { storyBible, visualScenes };
  }

  onProgress?.("AI is reading your entire script to understand the full story...", 1, 4);

  const stream = anthropic.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 128000,
    messages: [
      {
        role: "user",
        content: `You are an elite film director, visual storytelling expert, and master of visual consistency. Read this ENTIRE script in one pass and create TWO things:

1. A COMPREHENSIVE STORY BIBLE — the single source of truth for how every character, aircraft, vehicle, object, and location looks
2. VISUAL SCENE BREAKDOWNS — the script broken into filmable visual beats

SCRIPT:
"""
${script}
"""

Split the script into individual sentences for indexing. Number them starting from 0.

Return ONLY a JSON object (no markdown, no code fences, no extra text).

{
  "analysis": {
    "title": "string",
    "genre": "string",
    "setting": "string",
    "timePeriod": "string",
    "characters": [
      {
        "name": "string",
        "role": "string",
        "description": "2-3 sentences about their role and significance",
        "appearance": "EXHAUSTIVE visual description — the MASTER REFERENCE copied word-for-word into every prompt. Must include with EXTREME specificity: BODY (exact age, height, build with specific proportions, posture, skin tone with details), FACE (eye color AND shape, eyebrow style, nose specifics, jaw/chin, cheekbones, facial hair status, scars/marks, expression lines), HAIR (exact color with highlights/graying, length in measurable terms, style, texture), CLOTHING (every garment with exact type name, colors, materials, fit, condition, patches/insignia with EXACT placement and design, rank, name tape text), ACCESSORIES (helmet type/color/markings, goggles, gloves, dog tags, watch, harness, boots with details). DISTINCTIVE FEATURES: 4-5 unique visual anchors. Minimum 8-12 sentences. No vague terms.",
        "signatureFeatures": "ONE sentence: the 4-5 most instantly recognizable features that MUST appear identically in every image."
      }
    ],
    "jets": [
      {
        "name": "string",
        "type": "string",
        "description": "1-2 sentences about story role",
        "visualDetails": "EXHAUSTIVE visual description — MASTER REFERENCE copied word-for-word. Must include: SILHOUETTE (airframe shape), WINGS (configuration, sweep, hardpoints), FUSELAGE (cross-section, intakes), ENGINES (count, type, nozzle style), COCKPIT (canopy style, tint), TAIL (configuration), PAINT (exact scheme with military color codes if applicable, finish type), MARKINGS (squadron markings with exact design and placement, tail numbers, national insignia, nose art), WEATHERING (staining patterns, wear, damage). Minimum 8-12 sentences.",
        "signatureFeatures": "ONE sentence: 4-5 most recognizable features."
      }
    ],
    "vehicles": [
      {
        "name": "string",
        "type": "string",
        "description": "1-2 sentences",
        "visualDetails": "EXHAUSTIVE — hull/body shape, scale, superstructure, armament positions, radar arrays, exact paint scheme, hull numbers/markings with placement, flags, deck features, weathering, wake/exhaust. Minimum 8-12 sentences.",
        "signatureFeatures": "ONE sentence: 4-5 most recognizable features."
      }
    ],
    "keyObjects": [
      {
        "name": "string",
        "type": "string",
        "description": "1 sentence",
        "visualDetails": "EXHAUSTIVE — dimensions, shape, materials with texture, exact colors, labels/markings, wear, illumination, distinctive features. 4-8 sentences.",
        "signatureFeatures": "ONE sentence: 3-4 most recognizable features."
      }
    ],
    "locations": [
      {
        "name": "string",
        "description": "1 sentence",
        "visualDetails": "EXHAUSTIVE — terrain/ground texture, ALL structures with details, sky conditions, lighting, atmosphere/visibility, colors, scale at near/mid/far, vegetation, environmental details. 8-12 sentences.",
        "signatureFeatures": "ONE sentence: 4-5 most recognizable features."
      }
    ],
    "visualStyle": {
      "baseStyle": "Unreal Engine 5 cinematic 3D render, high-fidelity CGI with slight stylization, cinematic 8K, 16:9 widescreen",
      "lighting": "Comprehensive lighting approach with color temperatures and how it evolves through the story",
      "colorPalette": "Specific colors with emotional associations, not generic. How palette shifts through narrative arc",
      "atmosphere": "Visual feeling of the air — density, clarity, particles, emotional weight",
      "weatherProgression": "DETAILED weather progression through the ENTIRE story beat by beat. Critical for continuity."
    }
  },
  "narrativeArc": {
    "opening": "Emotional hook and visual tone",
    "rising": "How tension builds visually",
    "climax": "Visual and emotional peak",
    "resolution": "What visual tone lingers"
  },
  "moodTimeline": [
    {
      "sentenceRange": "Sentences X-Y",
      "mood": "SPECIFIC emotional state with subtext",
      "lighting": "How lighting reinforces mood — direction, quality, color temperature, shadow depth, special effects",
      "colorShift": "How palette shifts from previous segment",
      "weather": "EXACT atmospheric conditions — cloud types, coverage, precipitation, wind, visibility, particles"
    }
  ],
  "visualScenes": [
    {
      "sentenceIndices": [0,1],
      "sentences": ["The grouped sentences"],
      "visualBeat": "What this moment shows AND what it MEANS emotionally — the subtext (1-2 sentences)",
      "isVisual": true,
      "sceneDescription": "Rich cinematic description — character body language, facial expressions, environmental details mirroring emotion. What should the audience FEEL? (3-4 sentences)",
      "dramaticPurpose": "ESTABLISH/ESCALATE/REVEAL/CLIMAX/TRANSITION/AFTERMATH/CONTRAST with brief explanation",
      "emotionalState": "What each character is feeling RIGHT NOW based on context. Specific: 'forced calm masking rising dread' not 'nervous'",
      "mood": "Specific atmosphere, not generic",
      "timeOfDay": "Consistent with weather progression",
      "location": "Match Story Bible location names EXACTLY",
      "charactersPresent": ["Name — match Story Bible EXACTLY"],
      "aircraftPresent": ["Aircraft name — match EXACTLY"],
      "vehiclesPresent": ["Vehicle name — match EXACTLY"],
      "keyObjectsPresent": ["Object name — match EXACTLY"],
      "lightingNote": "Specific lighting tied to emotion AND time AND weather",
      "weatherConditions": "EXACT weather matching the progression timeline",
      "environmentalContinuity": "What PERSISTS from previous scene and what CHANGED. Empty only for first scene.",
      "characterStates": {"CharacterName": "Current physical and emotional state in detail"},
      "objectStates": {"ObjectName": "Current state of important objects"}
    }
  ]
}

CRITICAL RULES:
1. ALL visual descriptions must be EXHAUSTIVELY detailed — they're the master reference for every image.
2. signatureFeatures is the MOST IMPORTANT field — the features that MUST be identical across all images.
3. NEVER skip any sentence. Every sentence index must appear in exactly one visual beat.
4. READ FOR SUBTEXT — capture what moments MEAN, not just what happens.
5. EMOTIONAL CONTINUITY — each scene acknowledges what just happened.
6. ENVIRONMENTAL CONTINUITY — damage, smoke, debris, weather changes PERSIST.
7. CHARACTER STATE TRACKING — evolve each character's physical and emotional state.
8. WEATHER follows the weatherProgression timeline consistently.
9. Character, aircraft, vehicle, object, and location names in visualScenes must EXACTLY match Story Bible names.
- Output ONLY valid JSON, nothing else.`,
      },
    ],
  });

  const message = await stream.finalMessage();

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  if (message.stop_reason === "max_tokens") {
    console.warn("Claude response was truncated due to max_tokens limit. Attempting JSON repair...");
  }

  const result = parseJsonResponse(content.text);

  if (!result.analysis) {
    throw new Error("AI returned an incomplete story analysis. Please try again.");
  }

  if (!result.visualScenes || !Array.isArray(result.visualScenes) || result.visualScenes.length === 0) {
    console.warn("No visualScenes in response (possibly truncated). Using fallback scene generation from script.");
    result.visualScenes = [];
  }

  const analysis = result.analysis;
  if (!analysis.characters) analysis.characters = [];
  if (!analysis.jets) analysis.jets = [];
  if (!analysis.vehicles) analysis.vehicles = [];
  if (!analysis.keyObjects) analysis.keyObjects = [];
  if (!analysis.locations) analysis.locations = [];
  if (!analysis.visualStyle) {
    analysis.visualStyle = {
      baseStyle: "Unreal Engine 5 cinematic 3D render, high-fidelity CGI with slight stylization, cinematic",
      lighting: "Dramatic cinematic lighting",
      colorPalette: "Military tones",
      atmosphere: "Cinematic",
      weatherProgression: "",
    };
  }

  const storyBible: StoryBible = {
    analysis,
    narrativeArc: result.narrativeArc || { opening: "", rising: "", climax: "", resolution: "" },
    moodTimeline: result.moodTimeline || [],
  };

  let visualScenes: VisualScene[];

  if (result.visualScenes.length > 0) {
    visualScenes = result.visualScenes.map((vs: any) => ({
      sentenceIndices: vs.sentenceIndices || [],
      sentences: vs.sentences || [],
      visualBeat: vs.visualBeat || "",
      isVisual: vs.isVisual !== false,
      sceneDescription: vs.sceneDescription || vs.visualBeat || "",
      mood: vs.mood || "Intense",
      timeOfDay: vs.timeOfDay || "Day",
      location: vs.location || "Unspecified",
      charactersPresent: vs.charactersPresent || [],
      aircraftPresent: vs.aircraftPresent || [],
      vehiclesPresent: vs.vehiclesPresent || [],
      keyObjectsPresent: vs.keyObjectsPresent || [],
      lightingNote: vs.lightingNote || analysis.visualStyle.lighting,
      weatherConditions: vs.weatherConditions || "",
      dramaticPurpose: vs.dramaticPurpose || "",
      emotionalState: vs.emotionalState || vs.mood || "",
      environmentalContinuity: vs.environmentalContinuity || "",
      characterStates: vs.characterStates || {},
      objectStates: vs.objectStates || {},
    }));

    visualScenes = validateAndFillSentenceCoverage(visualScenes, sentences, analysis);
  } else {
    const chunkSize = 3;
    visualScenes = [];
    for (let i = 0; i < sentences.length; i += chunkSize) {
      const chunk = sentences.slice(i, i + chunkSize);
      const indices = chunk.map((_, j) => i + j);
      visualScenes.push({
        sentenceIndices: indices,
        sentences: chunk,
        visualBeat: chunk.join(" "),
        isVisual: true,
        sceneDescription: chunk.join(" "),
        mood: "Cinematic",
        timeOfDay: analysis.timePeriod || "Day",
        location: analysis.setting || "Unspecified",
        charactersPresent: analysis.characters?.map((c: any) => c.name) || [],
        aircraftPresent: analysis.jets?.map((j: any) => j.name) || [],
        vehiclesPresent: (analysis.vehicles || []).map((v: any) => v.name) || [],
        keyObjectsPresent: (analysis.keyObjects || []).map((o: any) => o.name) || [],
        lightingNote: analysis.visualStyle?.lighting || "Cinematic lighting",
        weatherConditions: "",
      });
    }
    console.log(`Generated ${visualScenes.length} fallback scenes from ${sentences.length} sentences`);
  }

  return { storyBible, visualScenes };
}

export async function generateSequencePrompts(
  scene: VisualScene,
  sceneIndex: number,
  totalScenes: number,
  storyBible: StoryBible,
  prevScene: VisualScene | null,
  nextScene: VisualScene | null,
  allScenes: VisualScene[],
): Promise<SceneSequencePrompts> {
  const analysis = storyBible.analysis;

  const memory = buildCumulativeMemory(allScenes, sceneIndex, storyBible);

  const identityBlocks = buildIdentityBlock(scene, analysis);

  const storyPosition = sceneIndex < totalScenes * 0.15 ? "OPENING" :
    sceneIndex < totalScenes * 0.35 ? "RISING ACTION" :
    sceneIndex < totalScenes * 0.55 ? "ESCALATION" :
    sceneIndex < totalScenes * 0.75 ? "CLIMAX" :
    sceneIndex < totalScenes * 0.9 ? "FALLING ACTION" :
    "RESOLUTION";

  const recentScenesContext = memory.sceneSummaries.length > 0
    ? `RECENT SCENE HISTORY (what the audience has already seen — use this for visual and emotional continuity):
${memory.sceneSummaries.map(s => `  ${s}`).join("\n")}`
    : "This is the OPENING of the story — no previous visual context.";

  const emotionalArcContext = memory.emotionalArc.length > 0
    ? `EMOTIONAL JOURNEY SO FAR:
${memory.emotionalArc.map(e => `  ${e}`).join("\n")}
The audience has been on THIS emotional journey. Scene ${sceneIndex + 1} must acknowledge and build upon this arc.`
    : "";

  const characterStateContext = Object.keys(memory.lastCharacterStates).length > 0
    ? `LAST KNOWN CHARACTER STATES (these persist unless something explicitly changes them):
${Object.entries(memory.lastCharacterStates).map(([name, state]) => `  ${name}: ${state}`).join("\n")}`
    : "";

  const continuityDelta = scene.environmentalContinuity
    ? `ENVIRONMENTAL CONTINUITY FROM PREVIOUS SCENE:
${scene.environmentalContinuity}
These environmental details MUST be visible in the opening shots of this scene unless explicitly contradicted by the script.`
    : prevScene
    ? `CONTINUITY FROM PREVIOUS SCENE:
Previous location: ${prevScene.location} | Previous weather: ${prevScene.weatherConditions || "not specified"} | Previous mood: ${prevScene.mood}
Previous visual moment: "${prevScene.sentences[prevScene.sentences.length - 1]}"
If this scene is in the same location, ALL environmental details from the previous scene must persist. If the location changed, establish the new location clearly.`
    : "This is the OPENING scene — establish the world vividly.";

  const weatherContext = `WEATHER STATE FOR THIS SCENE:
Current weather: ${scene.weatherConditions || memory.lastWeather || "Match story context"}
Previous weather: ${memory.lastWeather || "Not established yet"}
Weather progression from Story Bible: ${analysis.visualStyle.weatherProgression || "Not specified"}
The weather MUST be consistent across ALL images in this scene. Clouds don't change formation between frames. Rain doesn't start and stop. Wind direction stays constant.`;

  const moodTimelineMatch = storyBible.moodTimeline.find(m => {
    const range = m.sentenceRange.match(/(\d+)-(\d+)/);
    if (!range) return false;
    const start = parseInt(range[1]);
    const end = parseInt(range[2]);
    const sceneStart = scene.sentenceIndices[0] ?? 0;
    return sceneStart >= start && sceneStart <= end;
  });

  const moodContext = moodTimelineMatch
    ? `MOOD TIMELINE REFERENCE FOR THIS POINT IN THE STORY:
Mood: ${moodTimelineMatch.mood}
Lighting: ${moodTimelineMatch.lighting}
Color shift: ${moodTimelineMatch.colorShift}
Weather: ${moodTimelineMatch.weather || "Not specified"}`
    : "";

  const prevSceneSummary = prevScene
    ? `IMMEDIATELY PREVIOUS SCENE (scene ${sceneIndex}/${totalScenes}):
Visual beat: "${prevScene.visualBeat}"
Mood: ${prevScene.mood}
Emotional state: ${prevScene.emotionalState || prevScene.mood}
Location: ${prevScene.location}
Weather: ${prevScene.weatherConditions || "not specified"}
Last visual moment: "${prevScene.sentences[prevScene.sentences.length - 1]}"
Characters present: ${prevScene.charactersPresent.join(", ") || "none"}
Aircraft present: ${prevScene.aircraftPresent.join(", ") || "none"}
Vehicles present: ${prevScene.vehiclesPresent.join(", ") || "none"}`
    : "This is the OPENING scene of the story — no previous scene.";

  const nextSceneSummary = nextScene
    ? `NEXT SCENE (scene ${sceneIndex + 2}/${totalScenes}):
Visual beat: "${nextScene.visualBeat}"
Mood: ${nextScene.mood}
The last image of THIS scene should visually bridge toward the next scene.`
    : "This is the FINAL scene of the story — end with visual closure and emotional resolution.";

  const stream = anthropic.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 128000,
    messages: [
      {
        role: "user",
        content: `You are a world-class cinematographer, director, and visual storytelling master. You are creating image prompts for ONE scene of a visual story. These images will be rendered as Unreal Engine 5 cinematic CGI frames — high-fidelity 3D renders with slight stylization (NOT photographs, NOT photorealistic). Characters should look like premium video game cutscene quality, clearly CGI but extremely detailed. The frames must flow like actual film frames with PERFECT visual consistency.

You have COMPLETE creative freedom for camera angles, shot types, lens choices, and compositions. There is NO formula — a dialogue scene needs different shots than a dogfight. You decide everything based on what serves this specific moment.

BUT: Every image must convey not just WHAT is happening, but HOW characters FEEL and WHY this moment MATTERS. A pilot looking out a canopy isn't "a pilot looking" — it's determination, or fear, or resolve. SHOW that through composition, framing, lighting, and body language.

╔═══════════════════════════════════════════════════════════════╗
║  SECTION 1: STORY CONTEXT & NARRATIVE POSITION               ║
╚═══════════════════════════════════════════════════════════════╝
Story: "${analysis.title}" (${analysis.genre}, ${analysis.timePeriod})
Scene ${sceneIndex + 1} of ${totalScenes} — ${storyPosition} phase
Narrative position: ${memory.narrativeProgression}

Full narrative arc:
  OPENING: ${storyBible.narrativeArc.opening}
  RISING: ${storyBible.narrativeArc.rising || "Building tension"}
  CLIMAX: ${storyBible.narrativeArc.climax}
  RESOLUTION: ${storyBible.narrativeArc.resolution}

${recentScenesContext}

${emotionalArcContext}

${characterStateContext}

╔═══════════════════════════════════════════════════════════════╗
║  SECTION 2: SCENE-TO-SCENE CONTINUITY                        ║
╚═══════════════════════════════════════════════════════════════╝
${prevSceneSummary}

CURRENT SCENE (scene ${sceneIndex + 1}/${totalScenes}):
Script text: ${scene.sentences.map(s => `"${s}"`).join(" ")}
Visual beat: ${scene.visualBeat}
Scene description: ${scene.sceneDescription}
Dramatic purpose: ${scene.dramaticPurpose || storyPosition}
Emotional state: ${scene.emotionalState || scene.mood}
Mood: ${scene.mood}
Time of day: ${scene.timeOfDay}
Lighting: ${scene.lightingNote}
Location: ${scene.location}

LIGHTING BASELINE (MAINTAIN ACROSS ALL IMAGES):
Previous scene lighting: ${memory.lastLighting || "Not yet established"}
Current scene lighting note: ${scene.lightingNote}
Time of day: ${scene.timeOfDay}
CRITICAL: All images in this scene MUST share identical brightness, exposure level, sun position, shadow direction, and color temperature. Images must appear bright, vivid, and professionally exposed — never dark, muddy, or underexposed unless the story explicitly requires night or darkness. Treat this as a cinema camera with correct exposure metering at all times.

${nextSceneSummary}

${continuityDelta}

${weatherContext}

${moodContext}

╔═══════════════════════════════════════════════════════════════╗
║  SECTION 3: VISUAL IDENTITY BIBLE                            ║
║  COPY THESE DESCRIPTIONS WORD-FOR-WORD INTO EVERY PROMPT     ║
║  WHERE EACH ELEMENT APPEARS. DO NOT SUMMARIZE OR SHORTEN.    ║
╚═══════════════════════════════════════════════════════════════╝
${identityBlocks}

GLOBAL VISUAL STYLE (apply to ALL prompts):
- Render: ${analysis.visualStyle.baseStyle}
- Lighting approach: ${analysis.visualStyle.lighting}
- Color palette: ${analysis.visualStyle.colorPalette}
- Atmosphere: ${analysis.visualStyle.atmosphere}
- Weather progression: ${analysis.visualStyle.weatherProgression || "Consistent with scene context"}

╔═══════════════════════════════════════════════════════════════╗
║  SECTION 4: YOUR TASK                                        ║
╚═══════════════════════════════════════════════════════════════╝

IMPORTANT: Read the script text in Section 2 CAREFULLY. Your images must illustrate what the script ACTUALLY SAYS — not what you imagine or invent. Every image should be traceable to a specific sentence or phrase from the script. If the script describes a pilot walking across a flight deck, show THAT. Do not substitute a different action.

Decide how many images this scene needs (minimum 3, maximum 15):
- Quick transition or simple moment: 3-4 images
- Standard scene with clear action: 5-8 images
- Complex action, battle, or emotionally rich moment: 9-15 images
- Include B-roll, reaction shots, detail inserts, environmental cutaways, POV shots
- Think about what best conveys the story — choose the number that captures every important visual beat without padding

CINEMATOGRAPHIC STORYTELLING TECHNIQUES:
1. EMOTIONAL FRAMING: Composition conveys emotion. Character alone in vast sky = isolation. Tight cockpit with instruments pressing in = claustrophobia. Two aircraft side by side = partnership.
2. VISUAL FORESHADOWING: If next scene brings danger, last image should subtly hint (darkening clouds, ominous silhouette, shadows encroaching).
3. CONTRAST CUTS: If previous scene was calm, open with energy. If chaotic, open with eerie stillness. Amplify emotional shifts.
4. CHARACTER STATE THROUGH BODY LANGUAGE: Specific physical manifestations — white-knuckled grip, clenched jaw beneath oxygen mask, hunched shoulders, narrowed eyes scanning horizon, trembling fingers on throttle.
5. ENVIRONMENTAL STORYTELLING: Environment mirrors emotion — turbulent skies for turmoil, golden light for hope, cold blue for isolation, red/amber for danger.
6. CONTINUITY BRIDGES: Last image connects visually to next scene. If next scene is aerial maneuver, end showing aircraft positioned to begin it.

For EACH image, choose the perfect:
- Shot type (wide establishing, medium, close-up, extreme close-up, OTS, POV, bird's eye, worm's eye, Dutch angle, tracking, crane, dolly zoom, etc.)
- Camera lens (16mm wide-angle for epic scope, 35mm natural, 50mm portrait, 85mm intimate, 200mm telephoto compression, anamorphic for cinematic flare)
- Camera position and movement (static, pan, tilt, tracking, orbiting, pull-back reveal, push-in)
- Composition (rule of thirds, centered, leading lines, foreground framing, depth layers, silhouette)
- Short descriptive label (e.g. "Cockpit POV", "Wide Aerial", "Reaction Close-up", "Detail Insert")

╔═══════════════════════════════════════════════════════════════╗
║  SECTION 5: ABSOLUTE RULES FOR EVERY IMAGE PROMPT            ║
║  THESE ARE NON-NEGOTIABLE                                    ║
╚═══════════════════════════════════════════════════════════════╝

RULE 1 — OPENING: Start EVERY prompt with:
"Unreal Engine 5 cinematic 3D render, high-fidelity CGI with slight stylization — NOT a photograph, cinematic 8K, 16:9 widescreen aspect ratio."

RULE 2 — CHARACTER IDENTITY (the #1 cause of visual inconsistency — get this right):
For EACH character visible in the frame:
a) COPY their COMPLETE appearance description WORD-FOR-WORD from Section 3. Do NOT summarize, paraphrase, abbreviate, or skip ANY part.
b) Add IDENTITY FINGERPRINT: Repeat their signatureFeatures from Section 3 verbatim, prefixed with "IDENTITY ANCHOR: This is the same [name] with [fingerprint]."
c) Add CURRENT EMOTIONAL STATE: Specific facial expression (furrowed brow, clenched jaw, wide eyes, tight lips), body language (white-knuckled grip, hunched shoulders, rigid posture, trembling hands), and what they're feeling in this exact moment.
d) Add CURRENT POSE AND ACTION: Exactly what they're physically doing — hands on controls, leaning forward, turning head left, pointing, gripping railing.
e) If multiple characters: describe EACH one fully. NEVER merge or abbreviate secondary characters.

RULE 3 — AIRCRAFT IDENTITY:
For EACH aircraft in frame:
a) COPY their COMPLETE visual details WORD-FOR-WORD from Section 3. Do NOT summarize.
b) Add IDENTITY FINGERPRINT verbatim from Section 3.
c) Add CURRENT STATE: gear up/down, weapons bay status, afterburner glow, damage, exact position in sky, bank angle, vapor trails, exhaust effects.

RULE 4 — VEHICLE IDENTITY:
For EACH vehicle in frame:
a) COPY COMPLETE visual details WORD-FOR-WORD from Section 3.
b) Add IDENTITY FINGERPRINT verbatim.
c) Add CURRENT STATE: position, orientation, speed indicators (wake, dust, exhaust), damage, operational status, crew visible, flags.

RULE 5 — KEY OBJECT IDENTITY:
For EACH key object in frame:
a) COPY COMPLETE visual details WORD-FOR-WORD from Section 3.
b) Add IDENTITY FINGERPRINT verbatim.
c) Add CURRENT STATE: what it's displaying, condition, position relative to characters.

RULE 6 — LOCATION IDENTITY:
a) COPY COMPLETE location visual details WORD-FOR-WORD from Section 3.
b) Add LOCATION FINGERPRINT verbatim.
c) Location MUST look IDENTICAL across all images set there.

RULE 7 — TIME OF DAY ANCHORING:
State EXACT time of day. Describe: shadow direction and length, sky gradient colors (horizon to zenith), sun/moon altitude, ambient light quality. MUST be IDENTICAL across all images in this scene.

RULE 8 — WEATHER ANCHORING:
Describe EXACT weather: cloud type and coverage, precipitation, wind indicators, visibility range, atmospheric particles. MUST remain IDENTICAL across all images in this scene. Match the weather state from Section 2.

RULE 9 — CAMERA SPECIFICATION:
State exact camera angle, lens focal length (mm), distance from subject, camera movement direction, and composition technique.

RULE 10 — LIGHTING PARAGRAPH (CRITICAL FOR IMAGE QUALITY):
Dedicated paragraph with ALL of the following — NEVER skip any:
a) PRIMARY LIGHT: Direction (e.g. "from upper-left at 45 degrees"), quality (hard/soft), color temperature in Kelvin (e.g. 5500K daylight, 3200K golden hour, 6500K overcast). State EXACT intensity — "bright, well-exposed" or "high-key lighting" for daylight scenes. NEVER allow muddy, underexposed, or dim results unless the scene explicitly calls for darkness (night, enclosed space).
b) FILL LIGHT: Secondary ambient light source, ratio to key light (e.g. "fill at 2:1 ratio from ambient sky"), color temperature. Fill light PREVENTS dark, dull images — always specify adequate fill.
c) EXPOSURE TARGET: State overall brightness goal — "well-lit and properly exposed", "bright and vivid", "high dynamic range with lifted shadows". For outdoor daytime: "Bright, sunlit, exposure set for midtones with visible detail in both highlights and shadows." For overcast: "Even, diffused lighting, bright and clear despite cloud cover."
d) SHADOW HANDLING: Shadow depth (never crushed black unless stylistic), shadow edge quality, shadow color (cool blue fill in shadows, not black). State: "Shadows are lifted and show detail, not crushed to black."
e) RIM/BACKLIGHT: Rim lighting on subjects for separation from background, backlight glow, hair/edge light.
f) VOLUMETRIC EFFECTS: God rays, atmospheric haze, light shafts — only when appropriate for the scene.
g) SPECULAR AND REFLECTIONS: Highlights on metal, glass, water — adds life and brightness to the image.
h) GLOBAL BRIGHTNESS ANCHOR: "This image must appear bright, vivid, and properly exposed as if captured by a professional cinema camera with correct exposure settings. Avoid dark, muddy, underexposed, or washed-out results."
MUST be 100% consistent with time of day, weather, and ALL other images in this scene. The sun position, light direction, shadow angle, and overall brightness CANNOT change between frames.

RULE 11 — DEPTH AND COMPOSITION:
Describe foreground, midground, and background as THREE DISTINCT LAYERS. Include: depth of field (what's sharp, what's bokeh), leading lines, framing elements, negative space.

RULE 12 — COLOR GRADING:
Dominant color palette for this frame, color temperature, warm vs cool contrast, saturation level, how colors support emotional tone.

RULE 13 — SCENE NARRATIVE (CRITICAL — STAY GROUNDED IN THE SCRIPT):
Each image MUST depict something that ACTUALLY HAPPENS in the script text provided in Section 2. Read the sentences carefully — they are the SOURCE OF TRUTH for what each shot should show. Do NOT invent events, actions, or moments that are not described or clearly implied by the script text. If the script says "the pilot checks his instruments," show THAT — not something you made up.
- Map each image to a specific sentence or phrase from the script text.
- State which sentence/moment this image captures.
- Every scene should be TRACEABLE back to the script. The images should illustrate the story as written, not a different story.
- Include dramatic purpose: "This shot reveals...", "This image contrasts with...", "The audience should feel..."

RULE 14 — NO WORD LIMIT:
Write each prompt as LONG as necessary. More detail = better results. NEVER abbreviate. NEVER say "as described above" — ALWAYS write out the FULL description of every element in every prompt. Each prompt should be 800-2000+ words.

RULE 15 — CLOSING:
End EVERY prompt with: "Cinematic military aviation CGI, Unreal Engine 5 quality, volumetric lighting, atmospheric haze, motion blur where appropriate, film grain, lens flares, bright and properly exposed cinematic image, no dark or underexposed rendering, no text, no watermarks, no UI elements, no cartoons, no anime, no illustrations, NOT a real photograph."

RULE 16 — STRICT INTRA-SCENE CONTINUITY:
Weather, time of day, lighting direction, cloud formations, atmospheric conditions, location features, character clothing, vehicle positions — ALL must stay visually IDENTICAL within this scene across all images. The sun cannot jump. Clouds cannot change. Clothing cannot differ. BRIGHTNESS AND EXPOSURE must remain consistent — if image 1 is bright daylight, image 4 cannot be dim or dark.

RULE 17 — CROSS-SCENE LIGHTING CONSISTENCY:
Unless the story explicitly transitions between different times of day (dawn to noon, day to night), the overall lighting brightness and exposure level MUST remain consistent across scenes. Scenes sharing the same time of day and weather MUST have matching brightness levels. Define a LIGHTING BASELINE at the start: state the sun position, ambient light level, and overall exposure target — then MAINTAIN that baseline across all images. Never let rendering drift toward dark, dim, or underexposed results.

Return JSON only (no markdown, no code fences):
{
  "sceneDescription": "Description of this visual beat and its emotional weight",
  "mood": "${scene.mood}",
  "timeOfDay": "${scene.timeOfDay}",
  "cameraAngle": "Overall cinematography approach and why it serves the story",
  "transitionNote": "How the last image visually bridges to the next scene",
  "shotLabels": ["Short descriptive label for each shot"],
  "motionPrompts": ["IMPORTANT: These prompts will be sent to an image-to-video AI model that animates a STILL IMAGE into a short video clip (5-8 seconds). The model receives ONE frozen frame and must add motion to it. Write 2-3 sentences, max 50 words. Structure: CAMERA MOVE + SUBJECT MOTION + ATMOSPHERE. CAMERA: Choose ONE smooth camera move (slow dolly in, gentle crane up, steady tracking left, subtle push-in, slow pull-back, smooth orbit). Avoid fast or complex camera work. SUBJECT MOTION must describe ONLY what is already visible in the image continuing its natural motion — aircraft maintaining flight path with control surface micro-adjustments, propeller blur continuing to spin, ship holding course with bow cutting waves. NEVER describe events that would change the composition (crashes, explosions starting, new objects appearing, takeoffs, landings). ATMOSPHERE: ONE environmental motion detail (exhaust heat shimmer, clouds drifting slowly, gentle wave motion, smoke wisping). CRITICAL ANTI-MORPHING RULES: Never describe the subject changing shape, transforming, or doing anything that would require the AI to redraw it. If a jet is shown, it must remain the EXACT same jet design — same wing shape, same engine count, same paint scheme. Describe the jet as 'maintaining steady flight' not 'banking hard' which causes the model to redraw wings. Keep all motion GENTLE and CONTINUOUS, not sudden. NO dialogue, NO narration, NO text, NO sound descriptions."],
  "prompts": ["Full ultra-detailed prompt for each image — NO word limit, write as much as needed"]
}

The shotLabels, motionPrompts, and prompts arrays MUST all have the same length (between 2 and 10).`,
      },
    ],
  });

  const message = await stream.finalMessage();

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  if (message.stop_reason === "max_tokens") {
    console.warn(`Scene ${sceneIndex + 1}: Claude response truncated (max_tokens). Attempting repair...`);
  }

  let result: any;
  try {
    result = parseJsonResponse(content.text);
  } catch (parseErr) {
    console.error(`Scene ${sceneIndex + 1}: JSON parse failed. Raw response length: ${content.text.length}`);
    console.error(`Scene ${sceneIndex + 1}: First 500 chars: ${content.text.substring(0, 500)}`);
    console.error(`Scene ${sceneIndex + 1}: Last 500 chars: ${content.text.substring(content.text.length - 500)}`);

    result = repairPromptArrayJson(content.text);
    if (!result) {
      throw parseErr;
    }
    console.log(`Scene ${sceneIndex + 1}: Repaired truncated response, recovered ${result.prompts?.length || 0} prompts`);
  }

  if (!result.prompts || !Array.isArray(result.prompts) || result.prompts.length < 2) {
    throw new Error("Claude did not return at least 2 prompts for this scene");
  }

  const promptCount = Math.min(result.prompts.length, 10);
  const prompts = result.prompts.slice(0, promptCount);

  let shotLabels: string[] = result.shotLabels || [];
  if (shotLabels.length < prompts.length) {
    while (shotLabels.length < prompts.length) {
      shotLabels.push(`Shot ${shotLabels.length + 1}`);
    }
  }
  shotLabels = shotLabels.slice(0, promptCount);

  let motionPrompts: string[] = result.motionPrompts || [];
  if (motionPrompts.length < prompts.length) {
    while (motionPrompts.length < prompts.length) {
      motionPrompts.push("Cinematic slow camera motion with subtle parallax depth, smooth atmospheric movement");
    }
  }
  motionPrompts = motionPrompts.slice(0, promptCount);

  return {
    prompts,
    shotLabels,
    motionPrompts,
    sceneDescription: result.sceneDescription || scene.visualBeat,
    mood: result.mood || scene.mood,
    timeOfDay: result.timeOfDay || scene.timeOfDay,
    cameraAngle: result.cameraAngle || "Cinematic sequence",
    transitionNote: result.transitionNote || "",
  };
}

export function splitIntoSentences(script: string): string[] {
  let text = script;
  const decimalPlaceholder = "<<DECIMAL>>";
  const abbreviationPlaceholder = "<<ABBR>>";
  const ellipsisPlaceholder = "<<ELLIPSIS>>";
  const quotedPeriodPlaceholder = "<<QPERIOD>>";

  text = text.replace(/\.\.\./g, ellipsisPlaceholder);

  text = text.replace(/(\d)\.(\d)/g, `$1${decimalPlaceholder}$2`);

  const abbreviations = [
    "Mr", "Mrs", "Ms", "Dr", "Lt", "Col", "Gen", "Sgt", "Cpl", "Pvt",
    "Cmdr", "Capt", "Adm", "Maj", "Jr", "Sr", "St", "vs", "etc", "approx",
    "Inc", "Corp", "Ltd", "Ft", "Mt", "Ave", "Blvd", "Dept", "Est",
    "Gov", "Pres", "Prof", "Rep", "Rev", "Sen", "Supt",
    "No", "Vol", "Ch", "Fig", "Sec", "Art",
    "Jan", "Feb", "Mar", "Apr", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    "U.S", "U.K", "E.U",
  ];
  for (const abbr of abbreviations) {
    const regex = new RegExp(`\\b${abbr.replace(/\./g, "\\.")}\\.`, "gi");
    text = text.replace(regex, `${abbr.replace(/\./g, "")}${abbreviationPlaceholder}`);
  }

  text = text.replace(/"([^"]*?)\.([^"]*?)"/g, (match, before, after) => {
    return `"${before}${quotedPeriodPlaceholder}${after}"`;
  });
  text = text.replace(/'([^']*?)\.([^']*?)'/g, (match, before, after) => {
    return `'${before}${quotedPeriodPlaceholder}${after}'`;
  });

  const rawSentences = text.split(/(?<=[.!?])\s+/);

  const restorePlaceholders = (s: string): string => {
    return s
      .replace(new RegExp(decimalPlaceholder.replace(/[<>]/g, "\\$&"), "g"), ".")
      .replace(new RegExp(abbreviationPlaceholder.replace(/[<>]/g, "\\$&"), "g"), ".")
      .replace(new RegExp(ellipsisPlaceholder.replace(/[<>]/g, "\\$&"), "g"), "...")
      .replace(new RegExp(quotedPeriodPlaceholder.replace(/[<>]/g, "\\$&"), "g"), ".");
  };

  const restored = rawSentences.map(s => restorePlaceholders(s).trim()).filter(s => s.length > 0);

  const merged: string[] = [];
  for (let i = 0; i < restored.length; i++) {
    const s = restored[i];
    const wordCount = s.split(/\s+/).filter(w => w.length > 0).length;

    if (wordCount <= 3 && merged.length > 0) {
      merged[merged.length - 1] = merged[merged.length - 1] + " " + s;
    } else if (wordCount <= 3 && i + 1 < restored.length) {
      merged.push(s + " " + restored[i + 1]);
      i++;
    } else {
      merged.push(s);
    }
  }

  return merged.filter(s => s.trim().length > 0);
}

export async function analyzeAndImprovePrompt(
  originalPrompt: string,
  sceneDescription: string,
  shotLabel: string,
  mood: string,
  storyBible: StoryBible | null,
): Promise<string> {
  const analysis = storyBible?.analysis;

  const characterRef = analysis?.characters?.map(
    (c: any) => `═══ CHARACTER: ${c.name} (${c.role}) ═══\nVISUAL DNA: ${c.appearance}\n${c.signatureFeatures ? `IDENTITY FINGERPRINT: ${c.signatureFeatures}` : ""}`
  ).join("\n\n") || "";

  const aircraftRef = analysis?.jets?.map(
    (j: any) => `═══ AIRCRAFT: ${j.name} (${j.type}) ═══\nVISUAL DNA: ${j.visualDetails}\n${j.signatureFeatures ? `IDENTITY FINGERPRINT: ${j.signatureFeatures}` : ""}`
  ).join("\n\n") || "";

  const vehicleRef = (analysis?.vehicles || []).map(
    (v: any) => `═══ VEHICLE: ${v.name} (${v.type}) ═══\nVISUAL DNA: ${v.visualDetails}\n${v.signatureFeatures ? `IDENTITY FINGERPRINT: ${v.signatureFeatures}` : ""}`
  ).join("\n\n") || "";

  const keyObjectRef = (analysis?.keyObjects || []).map(
    (o: any) => `═══ KEY OBJECT: ${o.name} (${o.type}) ═══\nVISUAL DNA: ${o.visualDetails}\n${o.signatureFeatures ? `IDENTITY FINGERPRINT: ${o.signatureFeatures}` : ""}`
  ).join("\n\n") || "";

  const locationRef = analysis?.locations?.map(
    (l: any) => `═══ LOCATION: ${l.name} ═══\nVISUAL DNA: ${l.visualDetails}\n${l.signatureFeatures ? `LOCATION FINGERPRINT: ${l.signatureFeatures}` : ""}`
  ).join("\n\n") || "";

  const stream = anthropic.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 128000,
    messages: [
      {
        role: "user",
        content: `You are an expert prompt engineer and master cinematographer. A user is regenerating an image because the previous result was unsatisfactory. Analyze the original prompt, identify weaknesses, and write a DRAMATICALLY BETTER prompt.

ORIGINAL PROMPT THAT PRODUCED AN UNSATISFACTORY IMAGE:
"""
${originalPrompt}
"""

SCENE CONTEXT:
- Scene description: ${sceneDescription}
- Shot type: ${shotLabel}
- Mood: ${mood}

╔═══════════════════════════════════════════════════════════════╗
║  VISUAL IDENTITY REFERENCES — COPY WORD-FOR-WORD             ║
╚═══════════════════════════════════════════════════════════════╝
${characterRef || "(No character references)"}

${aircraftRef || "(No aircraft references)"}

${vehicleRef || "(No vehicle references)"}

${keyObjectRef || "(No key object references)"}

${locationRef || "(No location references)"}

${analysis?.visualStyle ? `VISUAL STYLE:\n- Base: ${analysis.visualStyle.baseStyle}\n- Lighting: ${analysis.visualStyle.lighting}\n- Colors: ${analysis.visualStyle.colorPalette}\n- Atmosphere: ${analysis.visualStyle.atmosphere}\n- Weather: ${analysis.visualStyle.weatherProgression || "Match scene context"}` : ""}
╚═══════════════════════════════════════════════════════════════╝

DIAGNOSE the original prompt for these common failures:
1. VAGUE DESCRIPTIONS — Replace generic phrases with extremely specific visual details
2. ABBREVIATED OR SUMMARIZED IDENTITY DESCRIPTIONS — #1 cause of inconsistency. ALL element descriptions MUST be copied in FULL from references
3. MISSING IDENTITY FINGERPRINTS — The signatureFeatures/identity anchor was not included or was weakened
4. CONFLICTING INSTRUCTIONS — Contradictions in composition, lighting, or camera angle
5. POOR COMPOSITION — Missing foreground/midground/background layering
6. WEAK EMOTIONAL WEIGHT — Missing body language, facial expression, environmental mood
7. INCONSISTENT OR POOR LIGHTING — Light direction, quality, color temperature not explicit. Dark, dim, underexposed, or muddy results. Missing fill light specification. Missing exposure target.
8. INCONSISTENT WEATHER — Weather details vague or contradictory
9. PROMPT TOO SHORT — Longer = better for consistency
10. STYLE DRIFT — Missing UE5 opening and quality closing tags
11. DIM OR UNDEREXPOSED IMAGE — The #1 visual quality problem. Always specify bright, well-exposed lighting with proper fill light ratios and an explicit exposure/brightness target.

Write a COMPLETELY NEW prompt with NO WORD LIMIT. The prompt MUST:
- Start with: "Unreal Engine 5 cinematic 3D render, high-fidelity CGI with slight stylization — NOT a photograph, cinematic 8K, 16:9 widescreen aspect ratio."
- COPY ALL element descriptions WORD-FOR-WORD from references. Include IDENTITY FINGERPRINTS.
- Include: character emotional state + body language + pose, current aircraft/vehicle state, time of day anchoring, weather anchoring, dedicated lighting paragraph, depth composition (3 layers), color grading
- LIGHTING PARAGRAPH MUST include: primary light direction and color temperature in Kelvin, fill light ratio, explicit exposure/brightness target ("bright and well-exposed", "vivid cinematic exposure"), shadow handling ("shadows lifted with visible detail, not crushed to black"), rim/backlight for subject separation, and specular highlights. End the lighting paragraph with: "This image must appear bright, vivid, and properly exposed as if captured by a professional cinema camera with correct exposure settings."
- End with: "Cinematic military aviation CGI, Unreal Engine 5 quality, volumetric lighting, atmospheric haze, motion blur where appropriate, film grain, lens flares, bright and properly exposed cinematic image, no dark or underexposed rendering, no text, no watermarks, no UI elements, no cartoons, no anime, no illustrations, NOT a real photograph."
- Take a DIFFERENT creative approach — different camera angle, different composition, different moment within the beat

Return ONLY the new prompt text. No JSON, no explanation, no markdown. Just the prompt.`,
      },
    ],
  });

  const message = await stream.finalMessage();
  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  let improvedPrompt = content.text.trim();
  if (improvedPrompt.startsWith('"') && improvedPrompt.endsWith('"')) {
    improvedPrompt = improvedPrompt.slice(1, -1);
  }
  if (improvedPrompt.startsWith("```")) {
    improvedPrompt = improvedPrompt.replace(/```\w*\n?/g, "").trim();
  }

  return improvedPrompt;
}

export async function applyFeedbackToPrompt(
  originalPrompt: string,
  userFeedback: string,
  isCharacterPortrait: boolean,
): Promise<string> {
  const stream = anthropic.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: `You are an expert prompt engineer. A user generated an image using the prompt below but wants specific changes. Apply their feedback to create an improved prompt.

CRITICAL RULES:
- Keep the SAME overall style, format, and structure of the original prompt
- Do NOT dramatically rewrite or shorten the prompt — make TARGETED modifications based on the feedback only
- Preserve ALL identity anchoring, signature features, and visual DNA descriptions word-for-word UNLESS the feedback specifically asks to change them
- The image style is: Unreal Engine 5 cinematic 3D render — high-fidelity CGI with slight stylization, NOT a real photograph
- Characters should look like high-quality cinematic CGI (think Unreal Engine 5 cutscene quality), not like a real photograph of a real person
- Keep all existing lighting, composition, and technical details unless feedback contradicts them
${isCharacterPortrait ? "- This is a CHARACTER REFERENCE PORTRAIT — maintain the portrait format (medium close-up, clean background, direct eye contact)" : ""}

ORIGINAL PROMPT:
"""
${originalPrompt}
"""

USER FEEDBACK (what they want changed):
"""
${userFeedback}
"""

Apply the user's feedback to the original prompt. Make only the changes needed to address their feedback. Return ONLY the modified prompt text. No JSON, no explanation, no markdown. Just the prompt.`,
      },
    ],
  });

  const message = await stream.finalMessage();
  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  let modifiedPrompt = content.text.trim();
  if (modifiedPrompt.startsWith('"') && modifiedPrompt.endsWith('"')) {
    modifiedPrompt = modifiedPrompt.slice(1, -1);
  }
  if (modifiedPrompt.startsWith("```")) {
    modifiedPrompt = modifiedPrompt.replace(/```\w*\n?/g, "").trim();
  }

  return modifiedPrompt;
}

export async function generateSmartMotionPrompt(
  imagePrompt: string,
  sceneDescription: string,
  shotLabel: string,
  mood: string,
  rawMotionPrompt: string | null,
  videoDuration: number,
  storyBible: StoryBible | null,
  videoModelId?: string | null,
): Promise<string> {
  const analysis = storyBible?.analysis;

  const aircraftList = analysis?.jets?.map((j: any) => `${j.name} (${j.type})`).join(", ") || "";
  const aircraftContext = aircraftList ? `\nAIRCRAFT IN STORY: ${aircraftList}. These aircraft must maintain their EXACT design — same wing geometry, engine count, tail shape, markings — throughout the video clip. The model will try to morph or redesign aircraft; your prompt must prevent this.` : "";

  const imageContext = imagePrompt.substring(0, 1000);

  let modelGuidance = "";
  switch (videoModelId) {
    case "grok":
      modelGuidance = "\nVIDEO MODEL: Grok Imagine Video (6s, 720p). This model handles subtle motion well but struggles with complex perspective changes. Keep motion minimal — favor slow push-ins and gentle atmospheric effects. Avoid any banking, rolling, or rotation.";
      break;
    case "seedance":
      modelGuidance = "\nVIDEO MODEL: Seedance 1.5 Pro (8s, 720p). ByteDance model with decent camera control. You can use slightly more confident camera moves (steady tracking shots, smooth crane), but still avoid subject rotation or perspective shifts.";
      break;
    case "hailuo":
      modelGuidance = "\nVIDEO MODEL: Hailuo 2.3 (6s, 768p). MiniMax model good at expressions and organic motion. Best for character scenes — subtle facial micro-expressions and natural body sway work well. Keep mechanical subjects (aircraft, vehicles) extremely static.";
      break;
    case "veo31":
      modelGuidance = "\nVIDEO MODEL: Veo 3.1 (8s, 1080p). Google model with good cinematic quality. Handles smooth camera dollies and gentle atmospheric effects well. Can tolerate slightly more environmental motion (water, clouds) but still keep subjects locked in place.";
      break;
    case "kling":
      modelGuidance = "\nVIDEO MODEL: Kling 3.0 (15s, 1080p). Premium model with best motion continuity over longer duration. Since it generates 15 seconds, keep motion EXTREMELY slow and gradual — what would be a 5-second push-in should be stretched to 15 seconds. Avoid any abrupt motion.";
      break;
    case "sora2pro":
      modelGuidance = "\nVIDEO MODEL: Sora 2 Pro (15s, 1080p). OpenAI model with physics-aware motion. Best at realistic environmental physics (water, smoke, fabric). Over 15 seconds, describe a single very slow continuous camera move. Subject identity preservation is still critical.";
      break;
    case "ltx23":
      modelGuidance = "\nVIDEO MODEL: LTX 2.3 (8s, 1080p). Lightricks model that's fast but can drift on subject details over time. Front-load subject identity description at the start of your prompt. Keep camera and subject motion very conservative.";
      break;
    default:
      modelGuidance = "\nVIDEO MODEL: Unknown — use the most conservative motion guidance. Minimal camera movement, no subject transformation.";
      break;
  }

  const sceneContext = sceneDescription ? `\nSCENE CONTEXT: ${sceneDescription.substring(0, 300)}` : "";

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `You are an expert at writing motion prompts for IMAGE-TO-VIDEO AI models. These models take a SINGLE STILL IMAGE and animate it into a ${videoDuration}-second video clip. You must understand their limitations deeply.

HOW IMAGE-TO-VIDEO AI WORKS:
- The model receives ONE frozen frame (the source image) and generates video frames from it
- It does NOT understand 3D geometry — it approximates motion by warping/morphing pixels
- Large movements cause the model to "redraw" subjects, which changes their design (this is the #1 problem)
- The less the subject needs to change, the more consistent the output looks
- Slow, gentle, continuous motion produces dramatically better results than fast or complex motion

THE STILL IMAGE SHOWS:
${imageContext}
${aircraftContext}${modelGuidance}${sceneContext}

SCENE MOOD: ${mood || "cinematic"}
SHOT: ${shotLabel}
DURATION: ${videoDuration} seconds
${rawMotionPrompt ? `DIRECTOR'S MOTION NOTE: ${rawMotionPrompt}` : ""}

YOUR TASK: Write a motion prompt that will produce a cinematic, visually consistent ${videoDuration}-second clip.

STRUCTURE YOUR PROMPT IN THIS ORDER:
1. SUBJECT IDENTITY LOCK (required): Start by describing what the main subject IS and that it must stay unchanged. Example: "A P-51 Mustang fighter with checkered nose art maintains steady level flight" — this tells the model WHAT to preserve.
2. CAMERA MOTION (pick ONE, keep it slow): slow dolly in, gentle tracking shot, subtle crane up, steady push-in, slow pull-back, static with minimal drift. NEVER use fast pans, whip pans, or rapid zooms — these cause severe morphing.
3. SUBJECT MOTION (minimal and natural): Describe ONLY motion that continues what's already happening in the still frame. If a plane is flying level, it stays flying level with subtle wing micro-adjustments. If a person is standing, they breathe and shift weight. NEVER introduce new events (no crashes, no takeoffs, no landings, no explosions starting, no objects appearing).
4. ENVIRONMENTAL MOTION (ONE detail): clouds drifting, water rippling, exhaust shimmer, smoke wisping, dust particles, heat haze, light rays shifting. Pick the most cinematic one.

CRITICAL ANTI-MORPHING RULES:
- AIRCRAFT: Say "maintains steady flight path" NOT "banks left" or "rolls" — banking requires the model to redraw the entire aircraft from a new angle, which changes its design
- VEHICLES: Say "holds course" NOT "turns" — turning changes the perspective and forces a redraw
- PEOPLE: Say "subtle breathing, slight eye movement" NOT "turns head" or "walks" — large body movements cause face/body morphing
- EXPLOSIONS/FIRE: Say "flames continue flickering and billowing" NOT "explosion expands" — expansion requires generating new imagery
- WATER: Say "gentle wave motion continues" NOT "waves crash" — crashing requires dramatic new geometry
- GENERAL: If something is static in the image, keep it static. Only animate things that would naturally have continuous subtle motion.

FORBIDDEN (these ALWAYS produce bad results):
- Story progression (torpedo hitting, plane crashing, person reacting to something new)
- Perspective changes (subject turning, rotating, banking sharply)
- New objects entering frame
- Dramatic speed changes
- Text, speech, narration, dialogue, sound effects
- Complex multi-step actions
- Rapid camera movement

FORMAT: Write 2-3 sentences, 30-50 words total. No quotes, no labels, no explanation. Just the motion prompt text.`,
      },
    ],
  });

  const message = await stream.finalMessage();
  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  let motionPrompt = content.text.trim();
  if (motionPrompt.startsWith('"') && motionPrompt.endsWith('"')) {
    motionPrompt = motionPrompt.slice(1, -1);
  }
  if (motionPrompt.startsWith("```")) {
    motionPrompt = motionPrompt.replace(/```\w*\n?/g, "").trim();
  }

  return motionPrompt;
}

export async function generateMotionPromptWithFeedback(
  imagePrompt: string,
  sceneDescription: string,
  shotLabel: string,
  mood: string,
  previousMotionPrompt: string,
  feedback: string,
  videoDuration: number,
  storyBible: StoryBible | null,
  videoModelId?: string | null,
): Promise<string> {
  const analysis = storyBible?.analysis;

  const aircraftList = analysis?.jets?.map((j: any) => `${j.name} (${j.type})`).join(", ") || "";
  const aircraftContext = aircraftList ? `\nAIRCRAFT IN STORY: ${aircraftList}. These must maintain EXACT design throughout.` : "";

  const imageContext = imagePrompt.substring(0, 800);

  let modelName = "image-to-video AI";
  switch (videoModelId) {
    case "grok": modelName = "Grok Imagine Video (6s, 720p)"; break;
    case "seedance": modelName = "Seedance 1.5 Pro (8s, 720p)"; break;
    case "hailuo": modelName = "Hailuo 2.3 (6s, 768p)"; break;
    case "veo31": modelName = "Veo 3.1 (8s, 1080p)"; break;
    case "kling": modelName = "Kling 3.0 (15s, 1080p)"; break;
    case "sora2pro": modelName = "Sora 2 Pro (15s, 1080p)"; break;
    case "ltx23": modelName = "LTX 2.3 (8s, 1080p)"; break;
  }

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `You write motion prompts for ${modelName} image-to-video generation. A previous motion prompt produced unsatisfactory results and the user has provided feedback on what went wrong.

THE STILL IMAGE SHOWS:
${imageContext}
${aircraftContext}

SCENE: ${sceneDescription.substring(0, 300)}
MOOD: ${mood || "cinematic"}
SHOT: ${shotLabel}
DURATION: ${videoDuration} seconds

PREVIOUS MOTION PROMPT THAT PRODUCED BAD RESULTS:
"${previousMotionPrompt}"

USER FEEDBACK ON WHAT WENT WRONG:
"${feedback}"

Write a NEW motion prompt that addresses the user's feedback while following these rules:
1. START with a subject identity lock — describe what the main subject IS so the model preserves it
2. Use ONE slow camera move (slow dolly, gentle push-in, subtle tracking, or static)
3. Keep subject motion minimal — only continue what's already visible, never introduce new events
4. Add ONE atmospheric detail (clouds, water, heat shimmer, smoke)
5. ANTI-MORPHING: Never describe perspective changes, banking, rotating, or anything that forces the model to redraw subjects
6. If the feedback mentions "morphing" or "changing design" — make the prompt even MORE conservative with less motion
7. If the feedback mentions "too static" — add slightly more environmental motion while keeping subjects locked

FORMAT: 2-3 sentences, 30-50 words total. No quotes, no labels, no explanation. Just the motion prompt.`,
      },
    ],
  });

  const message = await stream.finalMessage();
  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  let motionPrompt = content.text.trim();
  if (motionPrompt.startsWith('"') && motionPrompt.endsWith('"')) {
    motionPrompt = motionPrompt.slice(1, -1);
  }
  if (motionPrompt.startsWith("```")) {
    motionPrompt = motionPrompt.replace(/```\w*\n?/g, "").trim();
  }

  return motionPrompt;
}

import Anthropic from "@anthropic-ai/sdk";
import type { ScriptAnalysis } from "@shared/schema";

function getAnthropicClient(userApiKey?: string): Anthropic {
  const key = userApiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "No Anthropic API key found. Please enter your API key in Settings (gear icon) or set the ANTHROPIC_API_KEY environment variable."
    );
  }
  return new Anthropic({ apiKey: key });
}

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

export interface DirectorsShotPlanEntry {
  sceneIndex: number;
  primaryAngle: string;
  shotScale: string;
  isHeroShot: boolean;
  isEstablishing: boolean;
  rhythmNote: string;
  avoidAngles: string[];
  suggestedTechniques: string[];
  recommendedImageCount: { min: number; max: number };
}

export type DirectorsShotPlan = DirectorsShotPlanEntry[];

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

  const lookback = Math.min(currentIndex, 12);
  const startIdx = currentIndex - lookback;

  for (let i = startIdx; i < currentIndex; i++) {
    const scene = allScenes[i];
    if (!scene) continue;

    const recentIdx = i - startIdx;
    memory.sceneSummaries.push(
      `[Scene ${i + 1}] ${scene.visualBeat} | Location: ${scene.location} | Time: ${scene.timeOfDay} | Lighting: ${scene.lightingNote || "not specified"} | Mood: ${scene.mood} | Emotional state: ${scene.emotionalState || scene.mood} | Weather: ${scene.weatherConditions || "not specified"} | Characters: ${scene.charactersPresent.join(", ") || "none"} | Aircraft: ${scene.aircraftPresent.join(", ") || "none"} | Vehicles: ${scene.vehiclesPresent.join(", ") || "none"}`
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

    if (completePrompts.length < 3) return null;

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

export function validateAndFillSentenceCoverage(
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
      const combinedText = gapSentences.join(" ").toLowerCase();

      const matchedCharacters = (analysis.characters || [])
        .filter((c: any) => c.name && combinedText.includes(c.name.toLowerCase()))
        .map((c: any) => c.name);
      const matchedAircraft = (analysis.jets || [])
        .filter((j: any) => j.name && combinedText.includes(j.name.toLowerCase()))
        .map((j: any) => j.name);
      const matchedVehicles = (analysis.vehicles || [])
        .filter((v: any) => v.name && combinedText.includes(v.name.toLowerCase()))
        .map((v: any) => v.name);
      const matchedObjects = (analysis.keyObjects || [])
        .filter((o: any) => o.name && combinedText.includes(o.name.toLowerCase()))
        .map((o: any) => o.name);

      fillScenes.push({
        sentenceIndices: indices,
        sentences: gapSentences,
        visualBeat: gapSentences.join(" "),
        isVisual: true,
        sceneDescription: gapSentences.join(" "),
        mood: "Cinematic",
        timeOfDay: analysis.timePeriod || "Day",
        location: analysis.setting || "Unspecified",
        charactersPresent: matchedCharacters.length > 0 ? matchedCharacters : (analysis.characters?.slice(0, 2).map((c: any) => c.name) || []),
        aircraftPresent: matchedAircraft,
        vehiclesPresent: matchedVehicles,
        keyObjectsPresent: matchedObjects,
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

export function buildStoryBibleMessageContent(script: string): string {
  return `You are an elite film director, visual storytelling expert, and master of visual consistency. Read this ENTIRE script carefully and create a comprehensive Story Bible. The Story Bible is the SINGLE SOURCE OF TRUTH for how every character, aircraft, vehicle, object, and location looks across ALL generated images. Any vagueness here will destroy visual consistency.

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
Output ONLY valid JSON, nothing else.`;
}

export function buildStoryBibleParams(script: string) {
  return {
    model: "claude-opus-4-6" as const,
    max_tokens: 128000,
    messages: [{ role: "user" as const, content: buildStoryBibleMessageContent(script) }],
  };
}

export function parseStoryBibleResult(text: string): StoryBible {
  const result = parseJsonResponse(text);
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

export async function analyzeStoryBibleOnly(script: string, userApiKey?: string): Promise<StoryBible> {
  const params = buildStoryBibleParams(script);
  const stream = getAnthropicClient(userApiKey).messages.stream(params);

  const message = await stream.finalMessage();
  if (message.stop_reason === "max_tokens") {
    console.warn("Story Bible: Claude response truncated (max_tokens). Attempting JSON repair...");
  }
  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type from Claude");

  return parseStoryBibleResult(content.text);
}

export function buildVisualScenesChunkParams(
  script: string,
  sentences: string[],
  startIndex: number,
  endIndex: number,
  storyBible: StoryBible,
  chunkNumber: number,
  totalChunks: number,
) {
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

  return {
    model: "claude-opus-4-6" as const,
    max_tokens: 128000,
    messages: [
      {
        role: "user" as const,
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

NARRATIVE TECHNIQUE DETECTION — identify these in the sceneDescription and mood fields:
11. FLASHBACK/MEMORY: If the script references a past event, memory, or flashback — flag it clearly in sceneDescription with "FLASHBACK:" prefix. Note what visual treatment it needs (desaturated, sepia, softer focus, vignetting).
12. INTERNAL MONOLOGUE: If the script describes thoughts/feelings rather than visible action — note in sceneDescription how to SHOW this visually (facial close-ups, environmental metaphor, symbolic imagery).
13. TIME TRANSITIONS: If there's a time jump within the chunk — flag it so image generation creates visual distinction between before/after.
14. PARALLEL ACTION: If the script intercuts between two simultaneous events — create separate visual beats for each strand so they can be properly visualized.
15. REVELATION/TWIST: If a key piece of information is revealed — note the dramatic weight so image generation can use appropriate framing (push-in, reaction shot, dramatic lighting shift).
- Output ONLY valid JSON, nothing else.`,
      },
    ],
  };
}

export function parseVisualScenesChunkResult(
  text: string,
  sentences: string[],
  startIndex: number,
  endIndex: number,
  storyBible: StoryBible,
  chunkLabel: string,
): VisualScene[] {
  const result = parseJsonResponse(text);

  if (!result.visualScenes || !Array.isArray(result.visualScenes) || result.visualScenes.length === 0) {
    console.warn(`${chunkLabel}: No visual scenes returned. Creating fallback.`);
    const fallbackScenes: VisualScene[] = [];
    for (let i = startIndex; i < endIndex; i += 3) {
      const indices = [];
      const sents = [];
      for (let j = i; j < Math.min(i + 3, endIndex); j++) {
        indices.push(j);
        sents.push(sentences[j]);
      }
      const fbText = sents.join(" ").toLowerCase();
      const fbAnalysis = storyBible.analysis;
      const fbChars = (fbAnalysis.characters || []).filter((c: any) => c.name && fbText.includes(c.name.toLowerCase())).map((c: any) => c.name);
      const fbJets = (fbAnalysis.jets || []).filter((j: any) => j.name && fbText.includes(j.name.toLowerCase())).map((j: any) => j.name);
      const fbVehicles = (fbAnalysis.vehicles || []).filter((v: any) => v.name && fbText.includes(v.name.toLowerCase())).map((v: any) => v.name);
      const fbObjects = (fbAnalysis.keyObjects || []).filter((o: any) => o.name && fbText.includes(o.name.toLowerCase())).map((o: any) => o.name);
      fallbackScenes.push({
        sentenceIndices: indices,
        sentences: sents,
        visualBeat: sents.join(" "),
        isVisual: true,
        sceneDescription: sents.join(" "),
        mood: "Cinematic",
        timeOfDay: storyBible.analysis.timePeriod || "Day",
        location: storyBible.analysis.setting || "Unspecified",
        charactersPresent: fbChars.length > 0 ? fbChars : (fbAnalysis.characters?.slice(0, 2).map((c: any) => c.name) || []),
        aircraftPresent: fbJets,
        vehiclesPresent: fbVehicles,
        keyObjectsPresent: fbObjects,
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

export async function analyzeVisualScenesChunk(
  script: string,
  sentences: string[],
  startIndex: number,
  endIndex: number,
  storyBible: StoryBible,
  chunkNumber: number,
  totalChunks: number,
  userApiKey?: string,
): Promise<VisualScene[]> {
  const params = buildVisualScenesChunkParams(script, sentences, startIndex, endIndex, storyBible, chunkNumber, totalChunks);
  const stream = getAnthropicClient(userApiKey).messages.stream(params);

  const message = await stream.finalMessage();
  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type from Claude");

  if (message.stop_reason === "max_tokens") {
    console.warn(`Chunk ${chunkNumber}: Claude response truncated. Attempting repair...`);
  }

  return parseVisualScenesChunkResult(content.text, sentences, startIndex, endIndex, storyBible, `Chunk ${chunkNumber}`);
}

export function buildFullStoryParams(script: string) {
  return {
    model: "claude-opus-4-6" as const,
    max_tokens: 128000,
    messages: [
      {
        role: "user" as const,
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
  };
}

export function parseFullStoryResult(text: string, sentences: string[]): { storyBible: StoryBible; visualScenes: VisualScene[] } {
  const result = parseJsonResponse(text);

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
      const fbText2 = chunk.join(" ").toLowerCase();
      const fbChars2 = (analysis.characters || []).filter((c: any) => c.name && fbText2.includes(c.name.toLowerCase())).map((c: any) => c.name);
      const fbJets2 = (analysis.jets || []).filter((j: any) => j.name && fbText2.includes(j.name.toLowerCase())).map((j: any) => j.name);
      const fbVehicles2 = (analysis.vehicles || []).filter((v: any) => v.name && fbText2.includes(v.name.toLowerCase())).map((v: any) => v.name);
      const fbObjects2 = (analysis.keyObjects || []).filter((o: any) => o.name && fbText2.includes(o.name.toLowerCase())).map((o: any) => o.name);
      visualScenes.push({
        sentenceIndices: indices,
        sentences: chunk,
        visualBeat: chunk.join(" "),
        isVisual: true,
        sceneDescription: chunk.join(" "),
        mood: "Cinematic",
        timeOfDay: analysis.timePeriod || "Day",
        location: analysis.setting || "Unspecified",
        charactersPresent: fbChars2.length > 0 ? fbChars2 : (analysis.characters?.slice(0, 2).map((c: any) => c.name) || []),
        aircraftPresent: fbJets2,
        vehiclesPresent: fbVehicles2,
        keyObjectsPresent: fbObjects2,
        lightingNote: analysis.visualStyle?.lighting || "Cinematic lighting",
        weatherConditions: "",
      });
    }
  }

  return { storyBible, visualScenes };
}

export async function analyzeFullStory(
  script: string,
  onProgress?: (detail: string, current: number, total: number) => void,
  userApiKey?: string
): Promise<{ storyBible: StoryBible; visualScenes: VisualScene[] }> {
  const sentences = splitIntoSentences(script);
  const CHUNK_THRESHOLD = 150;

  if (sentences.length > CHUNK_THRESHOLD) {
    console.log(`Long script detected: ${sentences.length} sentences. Using chunked analysis.`);

    onProgress?.("AI is reading your entire script to build a comprehensive Story Bible...", 1, 4);
    const storyBible = await analyzeStoryBibleOnly(script, userApiKey);

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
        userApiKey,
      );
      allVisualScenes = allVisualScenes.concat(chunkScenes);
    }

    const visualScenes = validateAndFillSentenceCoverage(allVisualScenes, sentences, storyBible.analysis);
    return { storyBible, visualScenes };
  }

  onProgress?.("AI is reading your entire script to understand the full story...", 1, 4);

  const fullStoryParams = buildFullStoryParams(script);
  const stream = getAnthropicClient(userApiKey).messages.stream(fullStoryParams);

  const message = await stream.finalMessage();

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  if (message.stop_reason === "max_tokens") {
    console.warn("Claude response was truncated due to max_tokens limit. Attempting JSON repair...");
  }

  return parseFullStoryResult(content.text, sentences);
}

export function buildDirectorsShotPlanParams(
  visualScenes: VisualScene[],
  storyBible: StoryBible,
) {
  const analysis = storyBible.analysis;

  const sceneSummaries = visualScenes.map((vs, i) => {
    const totalScenes = visualScenes.length;
    const position = i / totalScenes;
    const phase = position < 0.15 ? "OPENING" : position < 0.35 ? "RISING" : position < 0.55 ? "ESCALATION" : position < 0.75 ? "CLIMAX" : position < 0.9 ? "FALLING" : "RESOLUTION";
    const locationChanged = i > 0 && vs.location !== visualScenes[i - 1].location;
    return `Scene ${i + 1} [${phase}]${locationChanged ? " [NEW LOCATION]" : ""}: "${vs.visualBeat}" | Location: ${vs.location} | Mood: ${vs.mood} | Characters: ${vs.charactersPresent.join(", ") || "none"} | Dramatic purpose: ${vs.dramaticPurpose || "STANDARD"}`;
  }).join("\n");

  const content = `You are an elite film director planning the cinematography for an entire story. You must create a SHOT PLAN that ensures maximum visual variety, creative camera work, and cinematic storytelling across ALL scenes.

STORY OVERVIEW:
Genre/Style: ${analysis.visualStyle.baseStyle}
Total scenes: ${visualScenes.length}
Narrative arc: ${storyBible.narrativeArc.opening} → ${storyBible.narrativeArc.rising} → ${storyBible.narrativeArc.climax} → ${storyBible.narrativeArc.resolution}

ALL SCENES:
${sceneSummaries}

YOUR TASK — Create a per-scene shot plan with these STRICT rules:

ANGLE DIVERSITY RULES (NON-NEGOTIABLE):
1. NO two consecutive scenes may share the same primaryAngle. If scene 5 uses "Low angle hero shot", scene 6 MUST use something different.
2. Track the last 4 angles used. The avoidAngles array for each scene MUST list these so the prompt generator knows what NOT to repeat.
3. Use the FULL creative range — not just "medium shot" and "wide shot". Include: Dutch angle, bird's eye, worm's eye, POV, over-the-shoulder, tracking, crane, ground-level, through-object, reflection, split diopter, dolly zoom, silhouette, overhead.
4. Vary lenses too — mention specific mm (14mm, 24mm, 35mm, 50mm, 85mm, 135mm, anamorphic).

SHOT SCALE RHYTHM:
- Alternate between WIDE, MEDIUM, CLOSE, and MIXED across consecutive scenes.
- After 2 close/medium scenes, force a WIDE establishing.
- After an intense close sequence, pull back to a breathing wide shot.

HERO SHOTS:
- Mark scenes at dramatic peaks (CLIMAX, major REVEAL, key emotional moments) as hero shots.
- Hero shots deserve the most creative and impactful camera angle.
- Limit hero shots to roughly 15-20% of total scenes — they lose impact if overused.

ESTABLISHING SHOTS:
- ANY scene where the location changes from the previous scene MUST be marked as establishing.
- The first scene is ALWAYS establishing.

RHYTHM NOTES:
- Describe the visual rhythm transition from the previous scene. Examples: "Open wide after tight claustrophobic sequence", "Match the energy — stay close and intense", "Contrast: pull way back to show insignificance after intimate moment", "Slow the pace — contemplative drifting camera after action".

SUGGESTED TECHNIQUES:
- 2-4 specific cinematic techniques per scene, chosen to serve that scene's dramatic purpose and mood. Examples: "Frame through cockpit struts for entrapment", "Use negative space for isolation", "Split composition for moral dilemma", "Rack focus from instrument to pilot's face", "Low angle with sky behind for heroic moment".

IMAGE COUNT BUDGET (recommendedImageCount):
The PRIMARY factor is SENTENCE LENGTH. Count the words in the scene's sentence(s). Then adjust based on content type.

STEP 1 — BASE COUNT FROM SENTENCE LENGTH:
- Very short (1-8 words): {"min": 2, "max": 3}
- Short (9-18 words): {"min": 2, "max": 4}
- Medium (19-35 words): {"min": 3, "max": 5}
- Long (36-60 words): {"min": 4, "max": 7}
- Very long (60+ words): {"min": 5, "max": 8}

STEP 2 — CONTENT MULTIPLIER (only increases, never decreases):
- Quiet emotion / facial expression / internal thought → use the MINIMUM from Step 1
- Dialogue / narration / establishing → use Step 1 as-is
- Fight scene / battle / chase / explosion / complex action → multiply max by 1.5x (up to max 12)
- Climax / hero moment with multiple characters in action → multiply max by 1.5x (up to max 12)

EXAMPLES:
- "His face does not tighten." (6 words, quiet) → 2 images
- "The soldiers charged across the open field under heavy fire." (10 words, fight) → 4-6 images
- "Dawn broke over the ridge." (5 words, establishing) → 2-3 images
- A 50-word paragraph describing an intense dogfight with multiple aircraft → 7-12 images

CRITICAL: Short sentences = few images. ALWAYS. The only exception is if a short sentence describes intense action (fight/battle), then add a few more. But "His jaw does not set" is NEVER more than 2-3 images regardless of mood or dramatic importance.

Return JSON only (no markdown, no code fences):
{
  "plan": [
    {
      "sceneIndex": 0,
      "primaryAngle": "Sweeping crane establishing shot, 24mm wide lens",
      "shotScale": "WIDE",
      "isHeroShot": false,
      "isEstablishing": true,
      "rhythmNote": "Opening — establish the world with scope and atmosphere",
      "avoidAngles": [],
      "suggestedTechniques": ["Environmental framing through foreground elements", "Golden hour lighting sweep", "Slow reveal of location scale"],
      "recommendedImageCount": {"min": 3, "max": 5}
    }
  ]
}

The plan array MUST have exactly ${visualScenes.length} entries, one per scene, in order.`;

  return {
    model: "claude-sonnet-4-20250514" as const,
    max_tokens: 16000,
    messages: [
      { role: "user" as const, content },
    ],
  };
}

export async function generateDirectorsShotPlan(
  visualScenes: VisualScene[],
  storyBible: StoryBible,
  userApiKey?: string,
): Promise<DirectorsShotPlan> {
  const params = buildDirectorsShotPlanParams(visualScenes, storyBible);
  const client = getAnthropicClient(userApiKey);
  const stream = client.messages.stream(params);
  const message = await stream.finalMessage();
  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type from Claude");

  let parsed: any;
  try {
    parsed = parseJsonResponse(content.text);
  } catch {
    console.warn("[directors-shot-plan] JSON parse failed, attempting repair...");
    parsed = repairTruncatedJson(content.text);
  }

  if (!parsed?.plan || !Array.isArray(parsed.plan)) {
    console.warn("[directors-shot-plan] Invalid plan structure, generating fallback plan");
    return visualScenes.map((_, i) => ({
      sceneIndex: i,
      primaryAngle: i % 5 === 0 ? "Wide establishing shot, 24mm" : i % 5 === 1 ? "Medium tracking shot, 35mm" : i % 5 === 2 ? "Close-up, 85mm" : i % 5 === 3 ? "Low angle, 50mm" : "Over-the-shoulder, 50mm",
      shotScale: i % 4 === 0 ? "WIDE" : i % 4 === 1 ? "MEDIUM" : i % 4 === 2 ? "CLOSE" : "MIXED",
      isHeroShot: false,
      isEstablishing: i === 0 || (i > 0 && visualScenes[i].location !== visualScenes[i - 1].location),
      rhythmNote: "",
      avoidAngles: [],
      suggestedTechniques: [],
      recommendedImageCount: { min: 3, max: 6 },
    }));
  }

  return parsed.plan.map((entry: any, i: number) => ({
    sceneIndex: entry.sceneIndex ?? i,
    primaryAngle: entry.primaryAngle || "Medium cinematic shot",
    shotScale: entry.shotScale || "MIXED",
    isHeroShot: !!entry.isHeroShot,
    isEstablishing: !!entry.isEstablishing,
    rhythmNote: entry.rhythmNote || "",
    avoidAngles: Array.isArray(entry.avoidAngles) ? entry.avoidAngles : [],
    suggestedTechniques: Array.isArray(entry.suggestedTechniques) ? entry.suggestedTechniques : [],
    recommendedImageCount: entry.recommendedImageCount && typeof entry.recommendedImageCount === "object"
      ? { min: entry.recommendedImageCount.min || 2, max: entry.recommendedImageCount.max || 6 }
      : { min: 3, max: 6 },
  }));
}

export function buildSequencePromptParams(
  scene: VisualScene,
  sceneIndex: number,
  totalScenes: number,
  storyBible: StoryBible,
  prevScene: VisualScene | null,
  nextScene: VisualScene | null,
  allScenes: VisualScene[],
  directorsPlan?: DirectorsShotPlanEntry,
) {
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

  const storyWearLevel = sceneIndex < totalScenes * 0.15 ? "FRESH — characters and equipment are at their baseline, clean and composed"
    : sceneIndex < totalScenes * 0.35 ? "EARLY WEAR — slight signs of strain, minor perspiration, focused intensity beginning to show"
    : sceneIndex < totalScenes * 0.55 ? "MODERATE WEAR — visible fatigue, sweat, dust/grime accumulating, equipment showing use marks, emotional strain visible in eyes and posture"
    : sceneIndex < totalScenes * 0.75 ? "HEAVY WEAR — exhaustion evident, significant dirt/damage/sweat, equipment battered, deep emotional weight visible in every gesture and expression"
    : sceneIndex < totalScenes * 0.9 ? "SEVERE WEAR — characters pushed to their limits, clothing torn/stained, faces drawn and haggard, equipment barely functional, the full cost of events written on everything"
    : "AFTERMATH — the weight of the entire story visible on characters and world, whatever state they've earned through the narrative";

  const characterEvolutionContext = `CHARACTER & EQUIPMENT VISUAL EVOLUTION (scene ${sceneIndex + 1} of ${totalScenes}, ${storyPosition} phase):
Current wear level: ${storyWearLevel}
Characters, clothing, equipment, and vehicles should show CUMULATIVE effects of everything that has happened so far in the story. Each scene should look slightly more worn than the last. This is NOT optional — a character in scene 20 must look noticeably different from scene 1. Show the physical and emotional toll of the narrative through visual details.`;

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

  return {
    model: "claude-opus-4-6" as const,
    max_tokens: 128000,
    messages: [
      {
        role: "user" as const,
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

${characterEvolutionContext}

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

${directorsPlan ? `╔═══════════════════════════════════════════════════════════════╗
║  DIRECTOR'S SHOT PLAN — FOLLOW THIS CREATIVE DIRECTION       ║
╚═══════════════════════════════════════════════════════════════╝

The Director has planned the cinematography for the ENTIRE story to ensure visual variety and creative storytelling. You MUST follow these directives for this scene:

PRIMARY CAMERA ANGLE FOR THIS SCENE: ${directorsPlan.primaryAngle}
SHOT SCALE: ${directorsPlan.shotScale}
${directorsPlan.isHeroShot ? "★ THIS IS A HERO SHOT — Give this scene your most impactful, creative, and visually stunning treatment. This is a key dramatic moment that deserves a signature visual." : ""}
${directorsPlan.isEstablishing ? "★ ESTABLISHING SHOT REQUIRED — The first image MUST be a wide establishing shot that clearly shows the new location/environment before moving into closer shots." : ""}
${directorsPlan.rhythmNote ? `VISUAL RHYTHM: ${directorsPlan.rhythmNote}` : ""}
${directorsPlan.avoidAngles.length > 0 ? `DO NOT REPEAT THESE RECENTLY USED ANGLES: ${directorsPlan.avoidAngles.join(", ")}. Choose something DIFFERENT from these — the audience has already seen these angles in recent scenes and needs visual freshness.` : ""}
${directorsPlan.suggestedTechniques.length > 0 ? `RECOMMENDED TECHNIQUES FOR THIS SCENE:\n${directorsPlan.suggestedTechniques.map(t => `- ${t}`).join("\n")}` : ""}
IMAGE BUDGET: The Director recommends ${directorsPlan.recommendedImageCount.min}-${directorsPlan.recommendedImageCount.max} images for this scene based on its dramatic importance in the overall story. ${directorsPlan.isHeroShot ? "As a hero/climax scene, lean toward the HIGHER end of this range." : "Stay within this range — DO NOT EXCEED the max. Images are costly ($0.12-$0.19 each). Be efficient."}

While you must use the primary angle as your DOMINANT approach for this scene, you should still vary individual shot angles within the scene for dynamic storytelling. The primary angle is your ANCHOR — start from there and build around it.

` : ""}╔═══════════════════════════════════════════════════════════════╗
║  SECTION 4: YOUR TASK                                        ║
╚═══════════════════════════════════════════════════════════════╝

IMPORTANT: Read the script text in Section 2 CAREFULLY. Your images must illustrate what the script ACTUALLY SAYS — not what you imagine or invent. Every image should be traceable to a specific sentence or phrase from the script. If the script describes a pilot walking across a flight deck, show THAT. Do not substitute a different action.

Decide how many images this scene needs. The PRIMARY factor is SENTENCE LENGTH — count the words first, then adjust for content.

STEP 1 — COUNT THE WORDS in the script text for this scene:
- Very short sentence (1-8 words): 2-3 images MAX
- Short sentence (9-18 words): 2-4 images
- Medium sentence (19-35 words): 3-5 images
- Long sentence (36-60 words): 4-7 images
- Very long / multiple sentences (60+ words): 5-8 images

STEP 2 — ADJUST FOR CONTENT TYPE:
- Quiet emotion / facial expression / internal state → stay at MINIMUM from Step 1
- Dialogue / narration / establishing → use Step 1 range as-is
- Fight / battle / chase / explosion / action → add 2-4 extra images on top of Step 1 (up to max 12)

COST-AWARENESS — IMAGES ARE EXPENSIVE ($0.12-$0.19 each):
- "His face does not change" (6 words) = 2 images. Period. Not 13.
- "The soldiers charged across the field under heavy fire" (9 words, action) = 4-6 images.
- A 50-word paragraph describing an intense dogfight = 8-12 images.
- Short sentence + quiet emotion = ALWAYS 2-3 images. No exceptions.
- NEVER create more than 3 images for a sentence under 10 words unless it describes physical action.
- DO create many images for fight scenes, battles, and complex action — that's where the budget belongs.

KEY STORY BEATS: Every distinct visual moment should be captured, but ONE good shot per beat is enough. Don't create 5 variations of the same face from slightly different angles.

SENTENCE-TO-IMAGE MAPPING (CRITICAL — DO NOT SKIP STORY MOMENTS):
Before deciding your shot list, go through EACH sentence in the script text and ask:
1. What is the KEY VISUAL MOMENT in this sentence? (action, reaction, reveal, detail)
2. Does this sentence introduce a NEW piece of information the audience needs to see?
3. Is there an EMOTIONAL SHIFT within this sentence that deserves its own image?
4. Are there IMPLIED visuals — things the script doesn't explicitly state but the audience should see? (a character's reaction to what was just said, the environment changing, a meaningful detail)
Create at least one image for each key visual moment. Complex sentences with multiple actions may need 2-3 images.

UNDERSTANDING NARRATIVE TECHNIQUES — MATCH THE VISUAL STYLE TO THE WRITING:
- FLASHBACK: If the script references a memory or past event, render it with DISTINCT visual treatment — desaturated color palette shifting toward warm sepia or cool blue-grey, slightly softer focus, film grain overlay, subtle vignetting at the edges, lighting that feels more golden/nostalgic or harsh/traumatic depending on the memory's nature. The audience must instantly recognize "this is a memory, not the present."
- INTERNAL THOUGHT/REALIZATION: When the script describes what a character thinks, feels, or realizes — show it through EXTREME CLOSE-UPS of face (eyes, jaw, hands), environmental metaphor (storm clouds for turmoil, clear sky for clarity), or abstract composition (isolating the character in negative space, rack focus revealing what they're looking at).
- MONTAGE/TIME PASSAGE: If the script implies time passing or repeated action — vary the camera angles dramatically between images to create visual rhythm. Wide→Close→Wide→Detail→Wide.
- TENSION/SUSPENSE: Tight compositions, claustrophobic framing, shallow depth of field, characters pressed to frame edges, Dutch angles, extreme close-ups of details (ticking gauges, sweating hands, narrowing eyes).
- CALM/PEACEFUL: Open compositions with breathing room, wide shots, centered subjects, warm light, high-key lighting, natural framing through environment.
- HORROR/DREAD: Low angles looking up, wide-angle lens distortion, deep shadows, silhouettes, empty space where something should be, negative space suggesting threat.
- TRIUMPH/VICTORY: Low angles heroicizing subjects, golden light, expansive skies, dramatic backlighting, subjects centered and dominant in frame.
- LOSS/GRIEF: High angles looking down (diminishing subjects), cold blue tones, characters small in vast empty spaces, soft focus, rain or mist.

CINEMATOGRAPHIC STORYTELLING TECHNIQUES:
1. EMOTIONAL FRAMING: Composition conveys emotion. Character alone in vast sky = isolation. Tight cockpit with instruments pressing in = claustrophobia. Two aircraft side by side = partnership.
2. VISUAL FORESHADOWING: If next scene brings danger, last image should subtly hint (darkening clouds, ominous silhouette, shadows encroaching).
3. CONTRAST CUTS: If previous scene was calm, open with energy. If chaotic, open with eerie stillness. Amplify emotional shifts.
4. CHARACTER STATE THROUGH BODY LANGUAGE: Specific physical manifestations — white-knuckled grip, clenched jaw beneath oxygen mask, hunched shoulders, narrowed eyes scanning horizon, trembling fingers on throttle.
5. ENVIRONMENTAL STORYTELLING: Environment mirrors emotion — turbulent skies for turmoil, golden light for hope, cold blue for isolation, red/amber for danger.
6. CONTINUITY BRIDGES: Last image connects visually to next scene. If next scene is aerial maneuver, end showing aircraft positioned to begin it.
7. VISUAL RHYTHM: Vary your shot scale deliberately — don't chain three wide shots or three close-ups in a row. Create a rhythm: Wide→Medium→Close-up→Detail→Wide→POV. This keeps the visual storytelling dynamic and engaging.
8. MEANINGFUL INSERTS: Detail shots that ADVANCE THE STORY — a fuel gauge needle dropping, a photograph in a locker, a crack spreading across glass, blood on a glove. These inserts add subtext and tension.
9. REACTION PRIORITY: After any significant action or event, include a REACTION shot showing how characters respond. The reaction is often more powerful than the action itself.

For EACH image, choose the MOST CREATIVE and STORY-APPROPRIATE combination of:
- Shot type: Don't default to medium shots. USE THE FULL RANGE: extreme wide establishing, wide, medium wide, medium, medium close-up, close-up, extreme close-up, over-the-shoulder, POV (first-person through character's eyes), bird's eye (directly overhead), worm's eye (from ground looking up), Dutch angle (tilted for unease), tracking shot (moving alongside), crane shot (rising/descending), dolly zoom (Vertigo effect for disorientation), split diopter (two focal planes), silhouette shot, reflection shot (in water, glass, metal), through-frame (shooting through objects), rack focus (shifting focus between planes)
- Camera lens: 14mm ultra-wide for distortion/claustrophobia, 16mm wide-angle for epic scope, 24mm wide for environmental context, 35mm natural eye-level, 50mm portrait standard, 85mm intimate close-up, 135mm telephoto for compression/isolation, 200mm extreme telephoto for flattened perspective, anamorphic for horizontal lens flares and cinematic aspect
- Camera position: high angle (power over subject), low angle (subject empowerment), eye-level (neutral/documentary), canted/Dutch (unease), overhead (god's eye/vulnerability), ground-level (intimacy/danger), through-object (voyeuristic)
- Composition: rule of thirds, dead center (confrontational), golden ratio, leading lines drawing eye, foreground framing (shooting through doorways, cockpit frames, foliage), depth layers (foreground silhouette, midground subject, background environment), negative space (isolation), symmetry (order/power), broken symmetry (unease), frame-within-frame
- Short descriptive label (e.g. "Cockpit POV — Fuel Gauge Detail", "Bird's Eye — Formation Over Ocean", "Dutch Angle — Emergency Close-up", "Worm's Eye — Hero Reveal", "Reflection Shot — Canopy Glass")

╔═══════════════════════════════════════════════════════════════╗
║  SECTION 5: VISUAL STORYTELLING MASTERY                       ║
║  THESE TECHNIQUES SEPARATE GREAT STORYBOARDS FROM GENERIC ONES║
╚═══════════════════════════════════════════════════════════════╝

TECHNIQUE A — EMOTIONAL ARC WITHIN THE SCENE:
Plan your image sequence as a MINI STORY ARC within this scene. Don't just illustrate events — build emotional momentum:
- Image 1-2: ESTABLISH the emotional baseline (where are we, how do characters feel right now?)
- Middle images: ESCALATE or DEVELOP the emotion (tension builds, hope grows, fear deepens)
- Final images: PEAK or TRANSFORM (the emotional payoff — the moment that matters most)
Your shot scale should reflect this arc: start wider for context, get progressively tighter as emotion intensifies, pull back out for release or transition. The audience should FEEL the emotional journey just from the shot progression.

TECHNIQUE B — VISUAL METAPHOR & SYMBOLISM:
Don't just show literal events — find the VISUAL METAPHOR that makes the moment resonate:
- ISOLATION: Character's reflection in glass (canopy, window, water) — they're trapped inside their own world
- POWERLESSNESS: Tiny human figure dwarfed by enormous machinery, landscape, or sky
- DECISION/CROSSROADS: Composition splits the frame — light on one side, shadow on the other; two paths; character at a junction point
- ENTRAPMENT: Frame the character THROUGH objects — cockpit struts, doorframes, barbed wire, cage-like structures
- MEMORY/NOSTALGIA: A detail that connects to an earlier moment — the same object seen differently now
- FORESHADOWING: A shadow, reflection, or background element that hints at what's coming
- CONNECTION: Two characters framed together, sharing the same light, mirroring each other's poses
- LOSS: Empty space where someone/something used to be — an empty chair, an abandoned tool, a gap in a formation
Use at least ONE visual metaphor per scene. State it explicitly in the prompt: "This composition uses [technique] to convey [emotion]."

TECHNIQUE C — "SHOW DON'T TELL" FOR INTERNAL STATES:
When the script describes what a character THINKS, FEELS, or REALIZES — NEVER just show them "looking thoughtful." Instead:
- FEAR: Show it through the ENVIRONMENT reflecting their state — instrument panel casting red warning light on their face, shadows closing in around them, hands white-knuckled on controls, sweat beads on metal surfaces, shallow panicked breathing visible in cold air
- DETERMINATION: Show it through BODY LANGUAGE and FRAMING — jaw set, eyes locked forward, hands steady on controls, lit from ahead (moving toward the light), centered and dominant in frame
- GRIEF: Show it through ABSENCE and EMPTINESS — empty space where someone was, character small in vast landscape, muted colors, soft unfocused background suggesting the world has lost its clarity
- REALIZATION: Show it through FOCUS SHIFT — rack focus from one element to another, character's eyes widening with light reflecting in them, a detail suddenly sharp while everything else blurs
- CONFLICT: Show it through DIVIDED COMPOSITION — character positioned between two opposing elements (duty vs safety, past vs future), split lighting (half in light, half in shadow), conflicting colors in the frame

TECHNIQUE D — PACING THROUGH SHOT SCALE:
Control the RHYTHM of your image sequence like a film editor controls pacing:
- ACTION SEQUENCES: Rapid alternation between scales — Wide→Close→Detail→Wide→POV→Close. Each image captures a single beat. Quick, punchy, varied angles. More images, each showing one moment.
- TENSION/SUSPENSE: Gradual, creeping tightening — Wide→Medium→Medium Close→Close-up→Extreme Close-up. Each image slightly closer, slightly more claustrophobic. Fewer cuts, lingering on details.
- EMOTIONAL/QUIET MOMENTS: Linger on wide shots and medium shots. Let the environment breathe. Use longer, contemplative compositions with space. Fewer images, each given more weight.
- REVELATION: Build with tight shots that hide context, then PULL BACK to a wide shot that reveals everything. Or: establish with a wide shot, then PUSH IN to an extreme close-up on the crucial detail.
- TRANSITIONS: End a scene with a visual that bridges to the next scene — similar composition, color, or shape that connects them.

TECHNIQUE E — CONTRAST & JUXTAPOSITION:
The most powerful images come from CONTRAST. Actively seek these opportunities:
- BEAUTY vs HORROR: A gorgeous sunset behind a scene of destruction. Flowers growing through wreckage. A peaceful landscape with war machines crossing it.
- SCALE CONTRAST: A tiny human figure against a massive aircraft, ship, or landscape. Or the reverse — an extreme close-up of a small detail (a photograph, a medal, a bullet casing) that carries enormous emotional weight.
- EMOTIONAL CONTRAST: A character's calm exterior vs visual clues of their inner turmoil (steady hands but tensed shoulders, composed face but white knuckles)
- TEMPORAL CONTRAST: The same location/object shown at different points — pristine vs damaged, full vs empty, day vs night
- ORDER vs CHAOS: A neatly organized cockpit panel next to a shattered windshield. A formation of aircraft with one breaking away. Geometric military order against organic natural landscape.
Include at least ONE powerful contrast per scene. State it: "This image creates a contrast between [X] and [Y] to convey [emotion]."

TECHNIQUE F — CHARACTER VISUAL EVOLUTION:
Characters should NOT look identical throughout the story. They EVOLVE based on what they've been through:
- PHYSICAL WEAR: As the story progresses, show accumulating evidence of the journey — increasing sweat, dirt, grime, oil stains, torn fabric, ruffled hair, bloodshot eyes, five o'clock shadow, chapped lips, sunburn
- EMOTIONAL WEAR: Posture changes through the story — starting upright and confident, gradually slumping under exhaustion or weight of events; or starting defeated and gradually straightening with resolve
- EQUIPMENT DEGRADATION: Helmets get scratched, goggles get cracked or dusty, flight suits get stained, instruments get damaged, paint gets chipped. Show the physical toll of events on everything.
- LIGHTING ON FACE: How light falls on a character's face should evolve with their emotional state — even lighting for calm, harsh side-lighting for conflict, underlighting for dread, backlighting for heroism, soft diffused light for vulnerability
- CONTEXTUAL EVOLUTION: The same character in different contexts should feel different — confident in their element (cockpit, bridge) vs vulnerable out of it (in water, on ground, captured)
Track where THIS scene falls in the story arc (${storyPosition}) and show appropriate wear and evolution. Characters in the CLIMAX should look significantly more worn than in the OPENING. Characters in the RESOLUTION should show the full weight of what they've been through.

╔═══════════════════════════════════════════════════════════════╗
║  SECTION 6: ABSOLUTE RULES FOR EVERY IMAGE PROMPT            ║
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
e) Add VISUAL EVOLUTION: Based on where this scene falls in the story, describe CUMULATIVE wear — additional sweat, grime, exhaustion, damage, emotional toll since the story began. Characters should look progressively more affected by events. Reference the wear level from Section 1.
f) If multiple characters: describe EACH one fully. NEVER merge or abbreviate secondary characters.

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
  "motionPrompts": ["IMPORTANT — EACH MOTION PROMPT MUST BE UNIQUE AND CONTEXTUAL TO ITS CORRESPONDING IMAGE. These prompts animate a STILL IMAGE into a short video clip (5-8 seconds). The model receives ONE frozen frame and must add motion to it. Write 3-5 sentences, max 80 words per prompt. EVERY motion prompt MUST be DIFFERENT from the others — each one describes what is happening in THAT specific image based on the story moment it captures. START each prompt with a brief context phrase about what this shot depicts in the story (e.g., 'A tense cockpit moment as the pilot scans the horizon —' or 'The aftermath of the ambush with smoke still rising —' or 'A quiet dawn over the airfield before the mission begins —'). Then describe: CAMERA MOVE suited to the emotional tone of this specific moment (tense = slow creeping push-in, epic = confident tracking, quiet = near-static with drift, chaotic = subtle handheld feel). SUBJECT MOTION: what is already visible in the image continuing its natural motion appropriate to the story beat. ATMOSPHERE: environmental motion details specific to what is shown in THIS image. ANTI-MORPHING RULES: Never describe subjects changing shape, transforming, or doing anything requiring the AI to redraw them. Keep all motion GENTLE and CONTINUOUS. NO dialogue, NO narration, NO text, NO sound descriptions."],
  "prompts": ["Full ultra-detailed prompt for each image — NO word limit, write as much as needed"]
}

The shotLabels, motionPrompts, and prompts arrays MUST all have the same length (between 3 and 17).`,
      },
    ],
  };
}

export function parseSequencePromptResult(text: string, scene: VisualScene, sceneIndex: number): SceneSequencePrompts {
  let result: any;
  try {
    result = parseJsonResponse(text);
  } catch (parseErr) {
    console.error(`Scene ${sceneIndex + 1}: JSON parse failed. Raw response length: ${text.length}`);
    console.error(`Scene ${sceneIndex + 1}: First 500 chars: ${text.substring(0, 500)}`);
    console.error(`Scene ${sceneIndex + 1}: Last 500 chars: ${text.substring(text.length - 500)}`);

    result = repairPromptArrayJson(text);
    if (!result) {
      throw parseErr;
    }
    console.log(`Scene ${sceneIndex + 1}: Repaired truncated response, recovered ${result.prompts?.length || 0} prompts`);
  }

  if (!result.prompts || !Array.isArray(result.prompts) || result.prompts.length < 3) {
    throw new Error("Claude did not return at least 3 prompts for this scene");
  }

  const promptCount = Math.min(result.prompts.length, 17);
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
      const idx = motionPrompts.length;
      const imgPrompt = prompts[idx] || "";
      const briefContext = imgPrompt.substring(0, 120).replace(/[.,;:]$/, "");
      motionPrompts.push(
        briefContext
          ? `Scene depicting: ${briefContext}... — Gentle cinematic camera motion with subtle atmospheric movement suited to this moment.`
          : "Cinematic slow camera motion with subtle parallax depth, smooth atmospheric movement"
      );
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

export async function generateSequencePrompts(
  scene: VisualScene,
  sceneIndex: number,
  totalScenes: number,
  storyBible: StoryBible,
  prevScene: VisualScene | null,
  nextScene: VisualScene | null,
  allScenes: VisualScene[],
  userApiKey?: string,
): Promise<SceneSequencePrompts> {
  const params = buildSequencePromptParams(scene, sceneIndex, totalScenes, storyBible, prevScene, nextScene, allScenes);
  const stream = getAnthropicClient(userApiKey).messages.stream(params);

  const message = await stream.finalMessage();

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  if (message.stop_reason === "max_tokens") {
    console.warn(`Scene ${sceneIndex + 1}: Claude response truncated (max_tokens). Attempting repair...`);
  }

  return parseSequencePromptResult(content.text, scene, sceneIndex);
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
  userApiKey?: string,
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

  const stream = getAnthropicClient(userApiKey).messages.stream({
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

export async function rewriteSafePrompt(
  originalPrompt: string,
  errorMessage: string,
  userApiKey?: string,
): Promise<string> {
  const stream = getAnthropicClient(userApiKey).messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: `You are an expert prompt engineer. An image generation prompt was REJECTED by the AI image model's safety filter.

REJECTED PROMPT:
"""
${originalPrompt}
"""

REJECTION ERROR:
"""
${errorMessage}
"""

REWRITE this prompt so it will NOT be rejected, while keeping the EXACT SAME visual scene, composition, characters, camera angle, lighting, mood, and artistic intent. Rules:

1. REMOVE or REPHRASE any violence, weapons, combat, gore, blood, death, nudity, drugs, or other unsafe content
2. Replace military/combat actions with neutral alternatives (e.g. "firing weapons" → "standing at the ready", "explosion" → "dramatic cloud of dust and debris", "battle" → "tense standoff", "gun" → "equipment")
3. Keep ALL character descriptions, clothing, appearance details, and visual identity EXACTLY the same
4. Keep the same camera angle, composition, lighting, color palette, and atmosphere
5. Keep the same environment, location, time of day, and weather
6. Maintain the dramatic and emotional tone through body language, facial expressions, and environmental mood — NOT through violent actions
7. The rewritten prompt should be the same length and level of detail as the original
8. Start with the same style opening (e.g. "Unreal Engine 5 cinematic..." if original has it)

Return ONLY the rewritten prompt. No JSON, no explanation, no markdown.`,
      },
    ],
  });

  const message = await stream.finalMessage();
  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  let safePrompt = content.text.trim();
  if (safePrompt.startsWith('"') && safePrompt.endsWith('"')) {
    safePrompt = safePrompt.slice(1, -1);
  }
  if (safePrompt.startsWith("```")) {
    safePrompt = safePrompt.replace(/```\w*\n?/g, "").trim();
  }

  return safePrompt;
}

export async function applyFeedbackToPrompt(
  originalPrompt: string,
  userFeedback: string,
  isCharacterPortrait: boolean,
  sceneContext?: { sceneDescription?: string; mood?: string; shotLabel?: string; storyBible?: any },
  userApiKey?: string,
): Promise<string> {
  let contextBlock = "";
  if (sceneContext) {
    const parts: string[] = [];
    if (sceneContext.sceneDescription) {
      parts.push(`SCENE DESCRIPTION: ${sceneContext.sceneDescription}`);
    }
    if (sceneContext.mood) {
      parts.push(`MOOD: ${sceneContext.mood}`);
    }
    if (sceneContext.shotLabel) {
      parts.push(`SHOT TYPE: ${sceneContext.shotLabel}`);
    }
    if (sceneContext.storyBible?.analysis) {
      const analysis = sceneContext.storyBible.analysis;
      if (analysis.characters?.length > 0) {
        const charDescriptions = analysis.characters.map((c: any) => {
          const desc = c.appearance || c.visualDetails || "";
          const sig = c.signatureFeatures ? `\n    IDENTITY FINGERPRINT: ${c.signatureFeatures}` : "";
          return `  ${c.name} (${c.role || "character"}):\n    VISUAL DNA: ${desc}${sig}`;
        }).join("\n");
        parts.push(`═══ CHARACTERS (FULL references — copy word-for-word) ═══\n${charDescriptions}`);
      }
      if (analysis.jets?.length > 0) {
        const jetDescriptions = analysis.jets.map((j: any) => {
          const details = j.visualDetails || "";
          const sig = j.signatureFeatures ? `\n    IDENTITY FINGERPRINT: ${j.signatureFeatures}` : "";
          return `  ${j.name} (${j.type}):\n    VISUAL DNA: ${details}${sig}`;
        }).join("\n");
        parts.push(`═══ AIRCRAFT (FULL references — copy word-for-word) ═══\n${jetDescriptions}`);
      }
      if (analysis.vehicles?.length > 0) {
        const vehicleDescriptions = analysis.vehicles.map((v: any) => {
          const details = v.visualDetails || "";
          const sig = v.signatureFeatures ? `\n    IDENTITY FINGERPRINT: ${v.signatureFeatures}` : "";
          return `  ${v.name} (${v.type}):\n    VISUAL DNA: ${details}${sig}`;
        }).join("\n");
        parts.push(`═══ VEHICLES (FULL references) ═══\n${vehicleDescriptions}`);
      }
      if (analysis.locations?.length > 0) {
        const locDescriptions = analysis.locations.map((l: any) => {
          const details = l.visualDetails || "";
          return `  ${l.name}: ${details}`;
        }).join("\n");
        parts.push(`═══ LOCATIONS ═══\n${locDescriptions}`);
      }
    }
    if (parts.length > 0) {
      contextBlock = `\nSCENE CONTEXT (use this to maintain accuracy):\n${parts.join("\n")}\n`;
    }
  }

  const systemPrompt = `You are an expert prompt engineer who modifies image generation prompts based on user feedback. You MUST faithfully apply what the user asks for.

CORE RULES:

1. APPLY THE FEEDBACK FULLY: The user's feedback is your primary directive. If they say "make it a bird's eye view", rewrite the entire camera/composition section to be a bird's eye view. If they say "make it darker and more dramatic", change lighting, mood, color grading throughout the prompt. Do NOT under-apply — the user expects to see a VISIBLE DIFFERENCE in the regenerated image.

2. SUBJECT IDENTITY LOCK: Characters, aircraft, vehicles, and locations keep their identity descriptions (appearance, visual DNA, signature features) UNLESS the user explicitly asks to change them.

3. PRESERVE UNRELATED SECTIONS: Parts of the prompt that have nothing to do with the feedback should stay intact. Don't randomly rewrite sections the user didn't mention.

4. MAINTAIN PROMPT LENGTH: Your output should be approximately the same length as the original. Don't shorten or condense — the detail level matters for image generation quality.

5. ERA AND CONTEXT LOCK: Keep the historical era and setting unless feedback explicitly changes it.

6. STYLE: Maintain "Unreal Engine 5 cinematic 3D render" style unless feedback says otherwise.

${isCharacterPortrait ? "7. PORTRAIT FORMAT: This is a CHARACTER REFERENCE PORTRAIT — maintain portrait format unless feedback specifically changes framing.\n" : ""}
IMPORTANT: The user's feedback takes PRIORITY. If there's any conflict between preserving the original and applying feedback, the feedback wins. The whole point is that the user wants something DIFFERENT from what they got.`;

  const stream = getAnthropicClient(userApiKey).messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 128000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `${contextBlock}
ORIGINAL PROMPT:
"""
${originalPrompt}
"""

MY FEEDBACK — apply these changes:
"""
${userFeedback}
"""

Return the modified prompt text only — no JSON, no explanation, no markdown, no quotes.`,
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
  userApiKey?: string,
): Promise<string> {
  const analysis = storyBible?.analysis;

  const aircraftList = analysis?.jets?.map((j: any) => `${j.name} (${j.type})`).join(", ") || "";
  const characterList = analysis?.characters?.map((c: any) => `${c.name} (${c.role || "character"})`).join(", ") || "";

  let storyContext = "";
  if (aircraftList) storyContext += `\nKEY AIRCRAFT: ${aircraftList}`;
  if (characterList) storyContext += `\nKEY CHARACTERS: ${characterList}`;

  let modelGuidance = "";
  let modelMotionBudget = "moderate";
  switch (videoModelId) {
    case "grok":
      modelGuidance = "Grok Imagine Video (6s, 720p). Handles subtle-to-moderate motion. Good with atmospheric effects and gentle camera moves. Can handle moderate subject motion for organic subjects (people, nature) but keep mechanical subjects (aircraft, vehicles) more controlled.";
      modelMotionBudget = "moderate";
      break;
    case "seedance":
      modelGuidance = "Seedance 1.5 Pro (8s, 720p). ByteDance model with good camera control. Supports confident camera moves — steady tracking, smooth crane, dolly shots. Can handle moderate subject motion.";
      modelMotionBudget = "moderate-high";
      break;
    case "hailuo":
      modelGuidance = "Hailuo 2.3 (6s, 768p). MiniMax model excellent at expressions, organic motion, and character scenes. Facial micro-expressions, natural gestures, and body language work great. Keep mechanical subjects more controlled.";
      modelMotionBudget = "moderate";
      break;
    case "veo31":
      modelGuidance = "Veo 3.1 (8s, 1080p). Google model with high cinematic quality. Handles smooth dollies, environmental motion (water, clouds, particles) very well. Good at physics-based motion.";
      modelMotionBudget = "moderate-high";
      break;
    case "kling":
      modelGuidance = "Kling 3.0 (15s, 1080p). Premium long-duration model. Since it generates 15 seconds, stretch all motion slowly and gradually across the full duration. What would be a 5-second move should unfold over 15 seconds.";
      modelMotionBudget = "slow-extended";
      break;
    case "klingmc":
      modelGuidance = "Kling 3.0 Motion Control (up to 10s, 1080p). Transfers motion from a reference video onto the character in the source image. Focus on describing the character pose and scene context — the motion trajectory comes from the reference video. Keep subject identity descriptions strong.";
      modelMotionBudget = "moderate-high";
      break;
    case "sora2pro":
      modelGuidance = "Sora 2 Pro (15s, 1080p). OpenAI model with physics-accurate motion. Excellent at realistic environmental physics (water, smoke, fabric, particles). Over 15 seconds, describe a continuous evolving motion that unfolds naturally.";
      modelMotionBudget = "slow-extended";
      break;
    case "ltx23":
      modelGuidance = "LTX 2.3 (8s, 1080p). Lightricks model — fast but can drift on details over time. Front-load subject description. Keep camera and subject motion more conservative.";
      modelMotionBudget = "conservative";
      break;
    default:
      modelGuidance = "Unknown model — use conservative motion guidance.";
      modelMotionBudget = "conservative";
      break;
  }

  const sceneContext = sceneDescription ? `\nSCENE CONTEXT: ${sceneDescription}` : "";

  const stream = getAnthropicClient(userApiKey).messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `You are an expert cinematic motion director who writes motion prompts for IMAGE-TO-VIDEO AI models. Your job is to READ the image prompt deeply, UNDERSTAND what story moment it captures, and craft a UNIQUE motion prompt that brings that specific image to life cinematically.

CRITICAL RULE — STORY-GROUNDED MOTION:
Every motion prompt you write MUST be grounded in what THIS specific image depicts in the story. Do NOT write generic "cinematic camera motion" prompts. Instead, your motion direction should reflect: what is happening in this moment of the narrative, what emotion the audience should feel, and what makes this shot different from every other shot in the project. Open your prompt with a brief contextual phrase that anchors the motion in the story moment (e.g., "As the damaged aircraft limps homeward through darkening skies..." or "In the tense stillness of the command bunker..." or "The vast emptiness of the Pacific stretches before the carrier group..."). This contextual grounding is NOT dialogue or narration — it tells the video model WHAT the scene is about so it can animate appropriately.

STEP 1 — ANALYZE THE IMAGE (do this mentally, don't output it):
Read the full image prompt below and identify:
- What is the PRIMARY SUBJECT? (person, aircraft, landscape, battle scene, etc.)
- What EMOTION/MOOD does the image convey? (tension, serenity, chaos, triumph, loss, determination)
- What is the COMPOSITION? (close-up, wide shot, aerial, ground-level, over-shoulder)
- What ELEMENTS are present? (fire, water, smoke, clouds, dust, rain, people, vehicles, structures)
- What MOMENT in the story is this? (calm before storm, climax of battle, quiet aftermath, hero's introduction)
- What makes this shot DIFFERENT from a generic shot of the same subject?

THE IMAGE PROMPT:
${imagePrompt}
${storyContext}

VIDEO MODEL: ${modelGuidance}
MOTION BUDGET: ${modelMotionBudget}
${sceneContext}
SCENE MOOD: ${mood || "cinematic"}
SHOT TYPE: ${shotLabel}
DURATION: ${videoDuration} seconds
${rawMotionPrompt ? `DIRECTOR'S NOTE: ${rawMotionPrompt}` : ""}

STEP 2 — CRAFT MOTION THAT SERVES THE STORY:
Based on your analysis, write a motion prompt that makes this specific image feel ALIVE and CINEMATIC. Match the motion intensity to the story moment. There is NO word limit — write as much rich, detailed cinematic direction as this image deserves, up to 700 words maximum. More complex scenes with many elements deserve longer, more detailed motion prompts. Simple scenes can be shorter. Let the content dictate the length.

Your prompt MUST convey what this image is about — not just "slow dolly in with atmospheric haze" but motion that reflects the specific narrative beat, environment, and emotional weight of this particular moment in the story.

MOOD → MOTION MAPPING:
- Tense/suspenseful → Slow creeping dolly, barely perceptible zoom, heavy atmosphere
- Epic/triumphant → Confident tracking shot, rising crane, billowing elements
- Quiet/reflective → Nearly static with breathing environmental motion, gentle light shifts
- Chaotic/intense → Handheld drift feel, active environmental elements (smoke, debris, sparks)
- Dramatic/emotional → Slow push-in toward emotional focal point, subtle depth-of-field shift
- Mysterious/ominous → Slow lateral drift, fog/mist movement, shifting shadows

CAMERA VOCABULARY (choose what fits THIS image):
- Slow dolly in/out, tracking shot (lateral), crane up/down, push-in, pull-back
- Static with subtle drift, orbiting micro-movement, rack focus feel
- For ${modelMotionBudget === "slow-extended" ? "15-second duration: stretch the camera move across the full duration, ultra-gradual" : modelMotionBudget === "conservative" ? "this model: favor static or very gentle push-in" : "this model: use confident but smooth camera motion"}

SUBJECT MOTION GUIDELINES:
- People/characters: Natural human motion — breathing, weight shifts, hair movement, fabric flutter, eye micro-movements, hand gestures if contextually appropriate
- Aircraft in flight: Maintain flight path with subtle wing micro-adjustments, engine exhaust shimmer, vapor trails
- Ships/vessels: Hold course with gentle hull pitch on waves, wake ripple
- Vehicles: Maintain heading with suspension micro-movements, wheel rotation continuity
- Landscapes/structures: Static subjects stay static — motion comes from environment around them
- Fire/explosions: Continue existing fire dynamics — flickering, billowing, embers rising
- Water: Existing wave patterns continue naturally, reflections shift with light

ENVIRONMENT — bring the world alive:
Don't pick just ONE environmental detail — describe ALL the natural environmental motion that would exist in this specific scene. A battlefield has smoke AND dust AND distant fire. An ocean scene has waves AND spray AND shifting clouds. A forest has rustling leaves AND dappled light AND ambient particles. Describe the atmosphere, the particles in the air, the quality of light shifting, reflections, shadows — everything that would move naturally in this specific scene.

IDENTITY PROTECTION:
- Name the primary subject specifically at the start of your prompt (e.g., "A P-51 Mustang with invasion stripes" not just "the aircraft")
- Avoid any motion that would require the AI to show a NEW ANGLE of the subject it hasn't seen
- No banking, sharp turns, rotation revealing unseen sides, or drastic perspective shifts
- Continuing existing motion direction is fine — changing direction is risky

FORBIDDEN:
- New story events not present in the image (no new explosions, crashes, arrivals)
- Subject rotation or perspective reversal
- New objects appearing in frame
- Text, dialogue, narration, sound descriptions
- Rapid or jerky camera movement

FORMAT: Write as many sentences as needed — no minimum, no maximum word count, up to 700 words. No quotes, no labels, no section headers, no explanation. Just the motion prompt text, written as fluid cinematic direction. Let the complexity of the image dictate how much detail you provide.`,
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
  userApiKey?: string,
): Promise<string> {
  const analysis = storyBible?.analysis;

  const aircraftList = analysis?.jets?.map((j: any) => `${j.name} (${j.type})`).join(", ") || "";
  const characterList = analysis?.characters?.map((c: any) => `${c.name} (${c.role || "character"})`).join(", ") || "";

  let storyContext = "";
  if (aircraftList) storyContext += `\nKEY AIRCRAFT: ${aircraftList}`;
  if (characterList) storyContext += `\nKEY CHARACTERS: ${characterList}`;

  let modelName = "image-to-video AI";
  switch (videoModelId) {
    case "grok": modelName = "Grok Imagine Video (6s, 720p)"; break;
    case "seedance": modelName = "Seedance 1.5 Pro (8s, 720p)"; break;
    case "hailuo": modelName = "Hailuo 2.3 (6s, 768p)"; break;
    case "veo31": modelName = "Veo 3.1 (8s, 1080p)"; break;
    case "kling": modelName = "Kling 3.0 (15s, 1080p)"; break;
    case "klingmc": modelName = "Kling 3.0 Motion Control (10s, 1080p)"; break;
    case "sora2pro": modelName = "Sora 2 Pro (15s, 1080p)"; break;
    case "ltx23": modelName = "LTX 2.3 (8s, 1080p)"; break;
  }

  const feedbackLower = feedback.toLowerCase();
  let feedbackStrategy = "";
  if (feedbackLower.includes("morph") || feedbackLower.includes("changing design") || feedbackLower.includes("distort") || feedbackLower.includes("deform")) {
    feedbackStrategy = "\nFEEDBACK STRATEGY: The user reported morphing/distortion. Make this version MORE conservative — reduce subject motion, use a simpler camera move, and emphasize subject identity preservation. Keep environmental motion but lock the main subject.";
  } else if (feedbackLower.includes("static") || feedbackLower.includes("boring") || feedbackLower.includes("no motion") || feedbackLower.includes("too slow") || feedbackLower.includes("lifeless")) {
    feedbackStrategy = "\nFEEDBACK STRATEGY: The user wants MORE motion/life. Add richer environmental motion, more confident camera movement, and natural subject motion (breathing, gestures, fabric movement). Make the scene feel alive and cinematic.";
  } else if (feedbackLower.includes("camera") || feedbackLower.includes("zoom") || feedbackLower.includes("pan")) {
    feedbackStrategy = "\nFEEDBACK STRATEGY: The user wants different camera work. Try a completely different camera approach — if the previous used push-in, try tracking or crane. Match the camera style to the emotional content of the scene.";
  }

  const stream = getAnthropicClient(userApiKey).messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `You are an expert cinematic motion director. A previous motion prompt produced unsatisfactory results. You need to deeply understand the image, understand what went wrong, and write a completely NEW motion prompt.

STEP 1 — UNDERSTAND THE IMAGE (do this mentally):
Read the full image prompt and understand what subjects, mood, composition, and story moment it captures.

THE IMAGE PROMPT:
${imagePrompt}
${storyContext}

VIDEO MODEL: ${modelName}
SCENE: ${sceneDescription}
MOOD: ${mood || "cinematic"}
SHOT: ${shotLabel}
DURATION: ${videoDuration} seconds

PREVIOUS MOTION PROMPT (produced bad results):
"${previousMotionPrompt}"

USER FEEDBACK:
"${feedback}"
${feedbackStrategy}

STEP 2 — WRITE A NEW MOTION PROMPT:
Address the user's specific feedback while crafting motion that serves THIS specific image's story moment. There is NO word limit — write as much rich, detailed cinematic direction as this image deserves, up to 700 words maximum. More complex scenes deserve longer prompts. Let the content dictate the length.

Match motion intensity to mood:
- Tense/suspenseful → Slow creeping motion, heavy atmosphere
- Epic/triumphant → Confident camera, billowing environmental elements
- Quiet/reflective → Nearly static, breathing environmental motion
- Chaotic/intense → Active environmental elements, handheld drift feel
- Dramatic/emotional → Slow push-in toward emotional focal point

SUBJECT MOTION — natural and contextual:
- People: breathing, weight shifts, hair movement, fabric flutter, eye movements, natural gestures
- Aircraft: maintain flight path, subtle wing adjustments, exhaust shimmer
- Ships: hold course, gentle hull pitch, wake ripple
- Landscapes: environmental motion around static structures

ENVIRONMENT — bring the full world alive:
Describe ALL natural environmental motion for this scene — not just one element. Describe the atmosphere, particles, light quality, reflections, shadows — everything that would move naturally.

IDENTITY PROTECTION:
- Name the primary subject specifically at the start
- No rotation revealing unseen angles, no perspective reversal
- Continuing existing motion is fine, changing direction is risky

FORBIDDEN:
- New story events not in the image
- Subject rotation or perspective reversal
- New objects appearing
- Text, dialogue, narration, sound descriptions

FORMAT: Write as many sentences as needed — no minimum, no maximum word count, up to 700 words. No quotes, no labels, no headers. Just fluid cinematic motion direction. Let the complexity of the image dictate how much detail you provide.`,
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

function buildFullStoryBibleContext(analysis: any): string {
  const parts: string[] = [];

  if (analysis.characters?.length > 0) {
    parts.push("═══ CHARACTERS ═══");
    for (const c of analysis.characters) {
      parts.push(`CHARACTER: ${c.name} (${c.role})`);
      parts.push(`FULL VISUAL DNA: ${c.appearance}`);
      if (c.signatureFeatures) parts.push(`IDENTITY FINGERPRINT: ${c.signatureFeatures}`);
      parts.push("");
    }
  }

  if (analysis.jets?.length > 0) {
    parts.push("═══ AIRCRAFT ═══");
    for (const j of analysis.jets) {
      parts.push(`AIRCRAFT: ${j.name} (${j.type})`);
      parts.push(`FULL VISUAL DNA: ${j.visualDetails}`);
      if (j.signatureFeatures) parts.push(`IDENTITY FINGERPRINT: ${j.signatureFeatures}`);
      parts.push("");
    }
  }

  if (analysis.vehicles?.length > 0) {
    parts.push("═══ VEHICLES ═══");
    for (const v of analysis.vehicles) {
      parts.push(`VEHICLE: ${v.name} (${v.type})`);
      parts.push(`FULL VISUAL DNA: ${v.visualDetails}`);
      if (v.signatureFeatures) parts.push(`IDENTITY FINGERPRINT: ${v.signatureFeatures}`);
      parts.push("");
    }
  }

  if (analysis.keyObjects?.length > 0) {
    parts.push("═══ KEY OBJECTS ═══");
    for (const o of analysis.keyObjects) {
      parts.push(`OBJECT: ${o.name} (${o.type})`);
      parts.push(`FULL VISUAL DNA: ${o.visualDetails}`);
      if (o.signatureFeatures) parts.push(`IDENTITY FINGERPRINT: ${o.signatureFeatures}`);
      parts.push("");
    }
  }

  if (analysis.locations?.length > 0) {
    parts.push("═══ LOCATIONS ═══");
    for (const l of analysis.locations) {
      parts.push(`LOCATION: ${l.name}`);
      parts.push(`FULL VISUAL DNA: ${l.visualDetails}`);
      if (l.signatureFeatures) parts.push(`LOCATION FINGERPRINT: ${l.signatureFeatures}`);
      parts.push("");
    }
  }

  if (analysis.visualStyle) {
    parts.push("═══ VISUAL STYLE ═══");
    parts.push(`Base: ${analysis.visualStyle.baseStyle}`);
    parts.push(`Lighting: ${analysis.visualStyle.lighting}`);
    parts.push(`Colors: ${analysis.visualStyle.colorPalette}`);
    parts.push(`Atmosphere: ${analysis.visualStyle.atmosphere}`);
    if (analysis.visualStyle.weatherProgression) parts.push(`Weather: ${analysis.visualStyle.weatherProgression}`);
  }

  return parts.join("\n");
}

export interface SceneChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function sceneChatResponse(
  chatHistory: SceneChatMessage[],
  sceneDescription: string,
  mood: string,
  shotLabels: string[],
  imagePrompts: string[],
  storyBible: StoryBible | null,
  userApiKey?: string,
): Promise<string> {
  const analysis = storyBible?.analysis;
  const storyBibleContext = analysis ? buildFullStoryBibleContext(analysis) : "(No Story Bible available)";

  const systemPrompt = `You are an expert cinematographer and visual director helping a user improve their scene's images. You have DEEP knowledge of the story, characters, and visual style.

YOUR ROLE:
- Help the user refine what they want changed in this scene
- Ask clarifying questions if their request is vague or could be interpreted multiple ways
- Confirm your understanding before they apply changes
- Suggest creative alternatives when appropriate
- ALWAYS maintain subject identity — never suggest changing aircraft types, character appearances, or historical era

SCENE CONTEXT:
- Description: ${sceneDescription}
- Mood: ${mood}
- Shot types: ${shotLabels.join(", ")}
- Number of images: ${imagePrompts.length}

CURRENT IMAGE PROMPTS:
${imagePrompts.map((p, i) => `[Image ${i + 1} — ${shotLabels[i] || "Shot"}]: ${p.substring(0, 200)}...`).join("\n\n")}

FULL STORY BIBLE (all visual references):
${storyBibleContext}

RULES:
- Keep responses concise (2-4 sentences max unless the user asks for details)
- When the user describes changes, confirm what you'll modify and what stays the same
- If they give complex multi-part feedback, break it down and confirm each part
- End your response by asking if they're ready to apply, or if they want to refine further
- Never output image prompts yourself — just discuss the changes conversationally`;

  const messages = [
    { role: "user" as const, content: systemPrompt },
    { role: "assistant" as const, content: "I understand. I'm ready to help refine this scene. What would you like to change?" },
    ...chatHistory.map(m => ({ role: m.role, content: m.content })),
  ];

  const stream = getAnthropicClient(userApiKey).messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages,
  });

  const message = await stream.finalMessage();
  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type from Claude");
  return content.text.trim();
}

export async function applySceneChatFeedback(
  originalPrompt: string,
  chatSummary: string,
  shotLabel: string,
  sceneDescription: string,
  mood: string,
  storyBible: StoryBible | null,
  userApiKey?: string,
): Promise<string> {
  const analysis = storyBible?.analysis;
  const storyBibleContext = analysis ? buildFullStoryBibleContext(analysis) : "";

  const stream = getAnthropicClient(userApiKey).messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 16384,
    messages: [
      {
        role: "user",
        content: `You are an expert prompt engineer applying user feedback to an image generation prompt. The user had a conversation with an AI director about what they want changed. Apply their requests SURGICALLY.

╔═══════════════════════════════════════════════════════════════╗
║  ABSOLUTE IDENTITY LOCK — VIOLATION IS CRITICAL FAILURE       ║
╚═══════════════════════════════════════════════════════════════╝
The subject identity (aircraft type, model, era, character appearance, vehicle design) MUST remain EXACTLY the same unless the user EXPLICITLY asked to change the subject itself. A WWII P-51 stays a WWII P-51. A Japanese B5N2 stays a B5N2. Characters keep their exact appearance from the Story Bible.

SCENE CONTEXT:
- Description: ${sceneDescription}
- Shot type: ${shotLabel}
- Mood: ${mood}

FULL STORY BIBLE REFERENCES (copy word-for-word for any elements present):
${storyBibleContext}

ORIGINAL PROMPT:
"""
${originalPrompt}
"""

USER'S REQUESTED CHANGES (from their conversation with the director):
"""
${chatSummary}
"""

RULES:
1. SURGICAL MODIFICATION — Change ONLY what the user asked for. Everything else stays WORD-FOR-WORD identical.
2. PRESERVE PROMPT LENGTH — Your output must be approximately the same length or longer. Never shorten or condense.
3. COPY-PASTE PRESERVATION — Sections unrelated to feedback appear WORD-FOR-WORD in output.
4. FULL IDENTITY DESCRIPTIONS — When elements from the Story Bible appear, include their COMPLETE visual DNA and identity fingerprints. Never truncate or summarize.
5. ERA LOCK — Historical era elements are immutable unless explicitly requested.
6. STYLE CONSISTENCY — Maintain "Unreal Engine 5 cinematic 3D render" style.
7. If the user asked for multiple changes, apply ALL of them consistently.
8. LIGHTING — Always maintain bright, well-exposed cinematic lighting with explicit fill light and exposure targets.

Return ONLY the modified prompt text. No JSON, no explanation, no markdown, no quotes.`,
      },
    ],
  });

  const message = await stream.finalMessage();
  const scfContent = message.content[0];
  if (scfContent.type !== "text") throw new Error("Unexpected response type from Claude");

  let modifiedPrompt = scfContent.text.trim();
  if (modifiedPrompt.startsWith('"') && modifiedPrompt.endsWith('"')) {
    modifiedPrompt = modifiedPrompt.slice(1, -1);
  }
  if (modifiedPrompt.startsWith("```")) {
    modifiedPrompt = modifiedPrompt.replace(/```\w*\n?/g, "").trim();
  }

  return modifiedPrompt;
}

export interface ImageQualityResult {
  score: "pass" | "flagged";
  feedback: string | null;
  issues: string[];
}

export async function checkImageQuality(
  imageUrl: string,
  originalPrompt: string,
  characterSignatures: Array<{ name: string; signatureFeatures: string }>,
  sceneDescription: string,
  userApiKey?: string,
): Promise<ImageQualityResult> {
  const client = getAnthropicClient(userApiKey);

  const charContext = characterSignatures.length > 0
    ? `CHARACTERS THAT SHOULD APPEAR:\n${characterSignatures.map(c => `- ${c.name}: ${c.signatureFeatures}`).join("\n")}`
    : "No specific characters required in this scene.";

  const promptSummary = originalPrompt.length > 1500
    ? originalPrompt.substring(0, 1500) + "..."
    : originalPrompt;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "url", url: imageUrl },
          },
          {
            type: "text",
            text: `You are a quality control reviewer for AI-generated storyboard images. Evaluate this image against the intended scene.

SCENE DESCRIPTION: ${sceneDescription}

${charContext}

KEY ELEMENTS FROM THE PROMPT (summarized):
${promptSummary}

EVALUATE these criteria and report ONLY genuine problems (not minor stylistic preferences):

1. SCENE ACCURACY: Does the image depict what the scene describes? Wrong setting, wrong action, or completely unrelated content = flag.
2. CHARACTER PRESENCE: Are the expected characters visible? Completely missing characters = flag. Minor appearance variation is acceptable.
3. LIGHTING/TIME: Is the lighting roughly consistent with the described time of day? Daylight scene rendered as night = flag. Subtle lighting differences are fine.
4. COMPOSITION: Is the image well-composed and visually clear? Severely distorted, garbled, or incoherent rendering = flag. Artistic choices are fine.
5. TEXT/ARTIFACTS: Does the image contain unwanted text, watermarks, or UI elements? If yes = flag.

IMPORTANT: Be LENIENT. AI image generation has inherent variation. Only flag genuine, obvious problems that would make the image unsuitable for a storyboard. Do NOT flag minor stylistic differences, slight color variations, or subjective artistic choices.

Return JSON only (no markdown):
{
  "score": "pass" or "flagged",
  "issues": ["list of specific issues found, empty if pass"],
  "feedback": "Brief actionable feedback for regeneration if flagged, null if pass"
}`,
          },
        ],
      },
    ],
  });

  const qcContent = response.content[0];
  if (qcContent.type !== "text") {
    return { score: "pass", feedback: null, issues: [] };
  }

  try {
    const parsed = JSON.parse(qcContent.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    return {
      score: parsed.score === "flagged" ? "flagged" : "pass",
      feedback: parsed.feedback || null,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    };
  } catch {
    return { score: "pass", feedback: null, issues: [] };
  }
}

// ─── AI Assistant Chatbot (Full Power) ──────────────────────────────

export interface AssistantAction {
  type:
    | "analyze_project"
    | "generate_all_images"
    | "regenerate_image"
    | "edit_prompt"
    | "regenerate_scene"
    | "regenerate_scene_prompts"
    | "delete_image"
    | "retry_failed_images"
    | "smart_regenerate"
    | "edit_character"
    | "regenerate_character_refs"
    | "edit_script"
    | "update_scene"
    | "generate_video"
    | "regenerate_video"
    | "animate_scene_videos"
    | "animate_all_videos"
    | "remove_video"
    | "generate_voiceover";
  description: string;
  params: Record<string, any>;
}

export interface AssistantResponse {
  reply: string;
  hasActions: boolean;
  actions: AssistantAction[];
}

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
  imageUrls?: string[];
}

export interface ProjectContext {
  projectId: string;
  title: string;
  script: string;
  status: string;
  sceneCount: number;
  imageCount: number;
  completedImages: number;
  failedImages: number;
  generatingImages: number;
  totalVideos: number;
  completedVideos: number;
  scenes: Array<{
    id: string;
    sentenceIndex: number;
    sentence: string;
    sceneDescription: string | null;
    mood: string | null;
    location: string | null;
    timeOfDay: string | null;
    cameraAngle: string | null;
    imageCount: number;
    images: Array<{
      id: string;
      variant: number;
      prompt: string;
      status: string;
      hasVideo: boolean;
      videoStatus: string | null;
      videoModel: string | null;
    }>;
  }>;
  characters: Array<{ name: string; role: string; description: string; appearance: string; signatureFeatures?: string }>;
  jets: Array<{ name: string; type: string; description: string }>;
  vehicles: Array<{ name: string; type: string; description: string }>;
  locations: Array<{ name: string; description: string }>;
  characterRefs: Array<{ characterName: string; angle: string; status: string; hasImage: boolean }>;
  storyBible: StoryBible | null;
  hasVoiceover: boolean;
  focusedSceneId?: string;
}

export async function assistantChat(
  messages: AssistantMessage[],
  context: ProjectContext | null,
  userApiKey?: string,
): Promise<AssistantResponse> {
  const client = getAnthropicClient(userApiKey);

  const projectSection = context
    ? `
═══════════════════════════════════════════════════════════════
  CURRENT PROJECT: "${context.title}"
  ID: ${context.projectId} | Status: ${context.status}
  Scenes: ${context.sceneCount} | Images: ${context.imageCount} (${context.completedImages} done, ${context.failedImages} failed, ${context.generatingImages} in progress)
  Videos: ${context.totalVideos} total, ${context.completedVideos} completed
  Voiceover: ${context.hasVoiceover ? "Yes" : "None"}
  ${context.focusedSceneId ? `FOCUSED SCENE: ${context.focusedSceneId}` : ""}
═══════════════════════════════════════════════════════════════

FULL SCRIPT (first 3000 chars):
"""
${context.script}
"""

SCENES:
${context.scenes.map((s, i) => {
  const imgs = s.images;
  const completedImgs = imgs.filter(img => img.status === "completed").length;
  const failedImgs = imgs.filter(img => img.status === "failed").length;
  const videosCompleted = imgs.filter(img => img.hasVideo).length;
  const videosGenerating = imgs.filter(img => img.videoStatus === "generating").length;
  return `Scene ${i + 1} (ID: ${s.id}):
  Narration: "${s.sentence}"
  Description: ${s.sceneDescription || "N/A"}
  Mood: ${s.mood || "N/A"} | Location: ${s.location || "N/A"} | Time: ${s.timeOfDay || "N/A"} | Camera: ${s.cameraAngle || "N/A"}
  Images: ${s.imageCount} total (${completedImgs} done, ${failedImgs} failed) | Videos: ${videosCompleted} done, ${videosGenerating} generating
  Image Details: ${imgs.map(img => `[${img.id} v${img.variant} ${img.status}${img.hasVideo ? " +video" : ""}${img.videoStatus === "generating" ? " (vid-gen)" : ""}]`).join(" ")}`;
}).join("\n\n")}

CHARACTERS:
${context.characters.length > 0 ? context.characters.map(c => `- ${c.name} (${c.role}): ${c.description}
    Appearance: ${c.appearance}${c.signatureFeatures ? `\n    Signature: ${c.signatureFeatures}` : ""}`).join("\n") : "No characters extracted yet."}

${context.jets.length > 0 ? `AIRCRAFT/JETS:\n${context.jets.map(j => `- ${j.name} (${j.type}): ${j.description}`).join("\n")}` : ""}
${context.vehicles.length > 0 ? `VEHICLES:\n${context.vehicles.map(v => `- ${v.name} (${v.type}): ${v.description}`).join("\n")}` : ""}
${context.locations.length > 0 ? `LOCATIONS:\n${context.locations.map(l => `- ${l.name}: ${l.description}`).join("\n")}` : ""}

CHARACTER REFERENCE PORTRAITS:
${context.characterRefs.length > 0 ? context.characterRefs.map(r => `- ${r.characterName} [${r.angle}]: ${r.status}${r.hasImage ? " (has image)" : ""}`).join("\n") : "No character references generated yet."}
`
    : "No project is currently selected. The user is asking a general question about Sham Studio.";

  const systemPrompt = `You are the AI Director embedded in Sham Studio — a professional video production and storyboard tool. You have FULL CONTROL over every aspect of the project pipeline: script, story bible, storyboard images, character references, motion/video clips, voiceover, and exports.

YOU ARE AN EXPERT IN:
- Cinematic storytelling, visual composition, and shot design
- Image prompt engineering for photorealistic AI generation
- Motion prompt engineering for video generation
- Character consistency and visual continuity
- Military/aviation/historical visual reference accuracy

${projectSection}

AVAILABLE VIDEO MODELS (for animate actions):
- "grok" — Grok Imagine Video (6s, 720p, $0.128/clip) — Budget
- "hailuo" — Hailuo 2.3 Fast (6s, 768p, $0.167/clip) — Budget
- "seedance" — Seedance 1.5 Pro (8s, 720p, $0.20/clip) — Mid
- "ltx23" — LTX 2.3 (8s, 1080p, $0.32/clip) — Mid
- "veo31" — Veo 3.1 Fast (8s, 1080p, $0.64/clip) — Mid
- "sora2pro" — Sora 2 Pro (15s, 1080p, $0.958/clip) — Premium
- "kling" — Kling 3.0 (15s, 1080p, $1.125/clip) — Premium

IMAGE MODELS (for image generation):
NanoBanana 2 (Gemini Flash — fast, cheaper):
- "nb2-1k" — 1K quality, $0.054/image — cheapest
- "nb2-2k" — 2K quality, $0.081/image — great value
- "nb2-4k" — 4K quality, $0.121/image
NanoBanana Pro (Gemini Pro — highest fidelity):
- "nbpro-2k" — 2K quality, $0.121/image
- "nbpro-4k" — 4K quality, $0.192/image — best quality, most expensive

RESPONSE FORMAT — ALWAYS use this exact structure:
<response>
{"reply": "Your message to the user", "hasActions": BOOLEAN, "actions": [ARRAY_OF_ACTIONS]}
</response>

ACTION TYPES (you can combine multiple in one response):

── ANALYSIS & GENERATION ──
1. "analyze_project" — Run full story bible + scene analysis on the project
   params: {"mode": "fast" or "budget"}

2. "generate_all_images" — Generate storyboard images for all scenes
   params: {"imageModel": "nbpro-4k", "forceRegenerate": false}

── IMAGE OPERATIONS ──
3. "regenerate_image" — Regenerate a specific image with feedback
   params: {"imageId": "...", "feedback": "what to change"}

4. "edit_prompt" — Rewrite an image prompt with feedback then regenerate
   params: {"imageId": "...", "feedback": "what to change in the prompt"}

5. "regenerate_scene" — Regenerate ALL images in a scene with feedback
   params: {"sceneId": "...", "feedback": "what to change across all images"}

6. "regenerate_scene_prompts" — Regenerate just the prompts for a scene (without generating images)
   params: {"sceneId": "..."}

7. "delete_image" — Delete a specific image
   params: {"imageId": "..."}

8. "retry_failed_images" — Retry all failed images in the project
   params: {}

9. "smart_regenerate" — AI-powered smart retry of failed images with improved prompts
   params: {"sceneIds": ["optional array of scene IDs to limit scope"]}

── CHARACTER OPERATIONS ──
10. "edit_character" — Update a character's visual description in the story bible
    params: {"characterName": "...", "changes": "what to change"}

11. "regenerate_character_refs" — Regenerate all reference portraits for a character
    params: {"characterName": "..."}

── SCRIPT OPERATIONS ──
12. "edit_script" — Directly modify the project script text
    params: {"newScript": "the complete updated script text"}

13. "update_scene" — Update a scene's metadata (description, mood, location, etc.)
    params: {"sceneId": "...", "updates": {"sceneDescription": "...", "mood": "...", "location": "...", "timeOfDay": "...", "cameraAngle": "..."}}

── VIDEO / MOTION OPERATIONS ──
14. "generate_video" — Generate a video clip from a completed image
    params: {"imageId": "...", "videoModel": "grok", "feedback": "optional motion direction"}

15. "regenerate_video" — Regenerate video for an image with motion feedback
    params: {"imageId": "...", "videoModel": "grok", "feedback": "motion/style changes"}

16. "animate_scene_videos" — Animate ALL images in a scene to video
    params: {"sceneId": "...", "videoModel": "grok"}

17. "animate_all_videos" — Animate ALL completed images in the entire project to video
    params: {"videoModel": "grok"}

18. "remove_video" — Remove the video from an image (keeping the still image)
    params: {"imageId": "..."}

── VOICEOVER ──
19. "generate_voiceover" — Generate voiceover for the script
    params: {"voiceId": "optional specific voice ID"}

IMAGE ANALYSIS:
When the user attaches an image, you can SEE it. Analyze it for:
- Visual glitches, artifacts, distortions, or rendering errors
- Character inconsistencies (wrong features, extra limbs, face issues)
- Incorrect scene elements (wrong setting, objects, lighting)
- Text/watermark artifacts
- Composition or quality issues
Then suggest specific fixes using the appropriate action (regenerate_image or edit_prompt with detailed feedback describing exactly what needs to change). Reference the specific visual problem you see.

RULES:
- ALWAYS wrap your JSON response in <response>...</response> tags
- When suggesting actions, clearly explain what will happen and the estimated cost so the user can confirm
- If the request is ambiguous, ask for clarification (no actions)
- You can combine multiple actions in one response (e.g., "regenerate scene 3 images then animate them all")
- When referring to scenes, say "Scene X" (1-based) for the user but use the actual scene ID in params
- Be specific about which images/scenes you're targeting
- For video model selection: recommend "veo31" for quality, "grok" for budget, "kling" or "sora2pro" for premium
- When the user says "analyze" or "analyze the project", use analyze_project
- When the user says "generate images" or "generate storyboard", use generate_all_images
- When the user says "animate" or "make videos" or "create clips", use the appropriate animate action
- For script edits, include the COMPLETE updated script text in newScript (modify the existing script, don't replace with just the changes)
- Always estimate costs when possible (image: ~$0.19 at 4K, ~$0.12 at 2K, video: depends on model)
- If the project hasn't been analyzed yet (status is "draft"), suggest analyzing first before generating images`;

  const claudeMessages: Array<{ role: "user" | "assistant"; content: any }> = [
    { role: "user", content: systemPrompt },
    { role: "assistant", content: '<response>\n{"reply": "I\'m your Sham Studio AI Director. I have full control over your project — from script and story bible analysis, to storyboard images, character references, motion clips, and exports. What would you like me to do?", "hasActions": false, "actions": []}\n</response>' },
    ...messages.map(m => {
      if (m.imageUrls && m.imageUrls.length > 0) {
        const contentBlocks: any[] = m.imageUrls.map(url => {
          if (url.startsWith("data:")) {
            const match = url.match(/^data:(image\/[^;]+);base64,(.+)$/);
            if (match) {
              return { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } };
            }
          }
          return { type: "image", source: { type: "url", url } };
        });
        contentBlocks.push({ type: "text", text: m.content || "Please analyze this image." });
        return { role: m.role, content: contentBlocks };
      }
      return { role: m.role, content: m.content };
    }),
  ];

  const stream = client.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: claudeMessages,
  });

  const message = await stream.finalMessage();
  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type from Claude");

  const rawText = content.text.trim();

  const responseMatch = rawText.match(/<response>\s*([\s\S]*?)\s*<\/response>/);
  if (responseMatch) {
    try {
      const parsed = JSON.parse(responseMatch[1]);
      return {
        reply: parsed.reply || rawText,
        hasActions: parsed.hasActions || false,
        actions: parsed.actions || [],
      };
    } catch {
      return { reply: rawText.replace(/<\/?response>/g, "").trim(), hasActions: false, actions: [] };
    }
  }

  return { reply: rawText, hasActions: false, actions: [] };
}

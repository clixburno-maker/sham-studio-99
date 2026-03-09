import type { ScriptAnalysis } from "@shared/schema";

export function analyzeScript(script: string): ScriptAnalysis {
  const characters = extractCharacters(script);
  const jets = extractJets(script);
  const locations = extractLocations(script);

  return {
    title: inferTitle(script),
    genre: "Military Aviation / Action",
    setting: inferSetting(script),
    timePeriod: inferTimePeriod(script),
    characters,
    jets,
    vehicles: [],
    keyObjects: [],
    locations,
    visualStyle: {
      baseStyle: "Unreal Engine 5 cinematic 3D render, high-fidelity CGI with slight stylization, cinematic",
      lighting: inferLighting(script),
      colorPalette: "Military tones - steel blue, gunmetal grey, deep navy, amber highlights, sunset oranges",
      atmosphere: "Cinematic, high-octane, dramatic with volumetric lighting and atmospheric haze",
      weatherProgression: "",
    },
  };
}

function inferTitle(script: string): string {
  const firstSentence = script.split(/[.!?]/)[0]?.trim() || "";
  if (firstSentence.length < 60) return firstSentence;
  return firstSentence.substring(0, 57) + "...";
}

function inferSetting(script: string): string {
  const settingKeywords: Record<string, string> = {
    "aircraft carrier": "Aircraft Carrier / Open Ocean",
    "carrier": "Aircraft Carrier / Naval Operations",
    "desert": "Desert Theater",
    "mountain": "Mountain Region",
    "ocean": "Open Ocean",
    "arctic": "Arctic / Cold Weather",
    "jungle": "Jungle / Tropical",
    "city": "Urban Environment",
    "base": "Military Air Base",
    "airbase": "Military Air Base",
    "runway": "Military Airfield",
    "hangar": "Military Hangar / Base",
    "cockpit": "Fighter Jet Cockpit",
    "sky": "Open Sky / Aerial",
    "cloud": "High Altitude / Cloud Layer",
  };

  const lower = script.toLowerCase();
  for (const [keyword, setting] of Object.entries(settingKeywords)) {
    if (lower.includes(keyword)) return setting;
  }
  return "Military Aviation Theater";
}

function inferTimePeriod(script: string): string {
  const lower = script.toLowerCase();
  if (lower.includes("f-35") || lower.includes("f-22") || lower.includes("su-57") || lower.includes("j-20")) {
    return "Modern Era (2020s)";
  }
  if (lower.includes("f-14") || lower.includes("f-15") || lower.includes("mig-29")) {
    return "Cold War / Late 20th Century";
  }
  if (lower.includes("p-51") || lower.includes("spitfire") || lower.includes("messerschmitt")) {
    return "World War II";
  }
  return "Modern Era";
}

function inferLighting(script: string): string {
  const lower = script.toLowerCase();
  if (lower.includes("sunset") || lower.includes("dusk") || lower.includes("golden hour")) {
    return "Golden hour sunset, warm amber and orange volumetric rays";
  }
  if (lower.includes("dawn") || lower.includes("sunrise") || lower.includes("morning")) {
    return "Early dawn, cool blue with warm horizon glow";
  }
  if (lower.includes("night") || lower.includes("dark") || lower.includes("midnight")) {
    return "Night operations, moonlit with cockpit glow and afterburner flames";
  }
  if (lower.includes("storm") || lower.includes("rain") || lower.includes("overcast")) {
    return "Overcast dramatic sky, storm clouds with lightning flashes";
  }
  return "Dramatic cinematic lighting, volumetric god rays, atmospheric haze";
}

const KNOWN_JETS: Record<string, { type: string; description: string; visualDetails: string }> = {
  "F-117": { type: "Stealth Attack Aircraft", description: "F-117 Nighthawk stealth ground-attack aircraft", visualDetails: "Angular faceted stealth body, V-tail, black radar-absorbent coating, single-seat, no external weapons, distinctive diamond-shaped cross section" },
  "F-22": { type: "5th Gen Stealth Fighter", description: "US Air Force air superiority stealth fighter", visualDetails: "Sleek angular stealth body, twin canted vertical stabilizers, grey radar-absorbent coating, twin F119 engines with thrust vectoring nozzles" },
  "F-35": { type: "5th Gen Multirole Stealth", description: "US next-generation multirole stealth fighter", visualDetails: "Single-engine stealth design, bubble canopy, weapons bay doors, dark grey low-observable coating" },
  "F-14": { type: "4th Gen Variable-Sweep Fighter", description: "US Navy variable-sweep wing interceptor", visualDetails: "Iconic variable-sweep wings, twin vertical stabilizers, twin engines, grey Navy paint scheme" },
  "F-15": { type: "4th Gen Air Superiority", description: "US Air Force twin-engine all-weather tactical fighter", visualDetails: "Large twin-engine design, twin vertical tails, air intake ramps, grey camo paint" },
  "F-16": { type: "4th Gen Multirole Fighter", description: "US lightweight single-engine multirole fighter", visualDetails: "Compact single-engine design, bubble canopy, ventral air intake, grey tactical paint" },
  "F-18": { type: "4th Gen Carrier Fighter", description: "US Navy carrier-capable multirole fighter", visualDetails: "Twin engines, LEX wing extensions, twin canted vertical tails, Navy grey scheme" },
  "Su-27": { type: "4th Gen Air Superiority", description: "Russian heavy air superiority fighter", visualDetails: "Large twin-engine design, twin vertical tails, blue-grey Russian camo, distinctive air intakes" },
  "Su-35": { type: "4++ Gen Multirole", description: "Russian advanced multirole air superiority fighter", visualDetails: "Enhanced Su-27 design, thrust-vectoring nozzles, canards, digital blue-grey camo" },
  "Su-57": { type: "5th Gen Stealth Fighter", description: "Russian stealth multirole fighter", visualDetails: "Angular stealth body, widely-spaced engines, canted vertical tails, digital winter camo" },
  "MiG-29": { type: "4th Gen Tactical Fighter", description: "Russian lightweight multirole fighter", visualDetails: "Compact twin-engine design, twin vertical tails, distinctive dorsal air intakes, grey-blue camo" },
  "MiG-31": { type: "Interceptor", description: "Russian supersonic interceptor aircraft", visualDetails: "Large twin-engine interceptor, side-mounted air intakes, grey military paint" },
  "J-20": { type: "5th Gen Stealth Fighter", description: "Chinese stealth multirole fighter", visualDetails: "Long fuselage, canard delta layout, angular stealth design, dark grey coating" },
  "Rafale": { type: "4.5 Gen Multirole", description: "French twin-engine multirole fighter", visualDetails: "Delta wing with canards, twin engines, French grey paint, glass cockpit" },
  "Eurofighter": { type: "4.5 Gen Multirole", description: "European canard-delta multirole fighter", visualDetails: "Delta wing with canards, single fin, twin engines, grey European camo" },
  "B-2": { type: "Strategic Stealth Bomber", description: "US stealth strategic bomber", visualDetails: "Flying wing design, no tail surfaces, dark grey stealth coating, four engines buried in wing" },
  "B-1": { type: "Strategic Bomber", description: "US supersonic variable-sweep wing strategic bomber", visualDetails: "Variable-sweep wings, blended wing-body, four engines, dark grey paint" },
  "A-10": { type: "Close Air Support", description: "US ground-attack aircraft", visualDetails: "Twin-engine with high-mounted wing, massive GAU-8 cannon, twin vertical tails, dark green/grey camo" },
  "C-130": { type: "Military Transport", description: "US four-engine turboprop military transport", visualDetails: "Four turboprop engines, high wing, large cargo ramp, grey military transport paint" },
  "Apache": { type: "Attack Helicopter", description: "AH-64 Apache attack helicopter", visualDetails: "Twin-engine attack helicopter, tandem cockpit, stub wings with weapons pylons, chain gun" },
  "Blackhawk": { type: "Utility Helicopter", description: "UH-60 Black Hawk utility helicopter", visualDetails: "Twin-engine medium helicopter, four-blade main rotor, dark olive/black paint" },
  "P-51": { type: "WWII Fighter", description: "P-51 Mustang WWII fighter aircraft", visualDetails: "Single-engine propeller fighter, distinctive air scoop, unpainted aluminum or olive drab" },
  "Spitfire": { type: "WWII Fighter", description: "Supermarine Spitfire WWII fighter", visualDetails: "Single-engine, elliptical wings, RAF roundels, camo green/brown over sky blue" },
};

function extractJets(script: string): ScriptAnalysis["jets"] {
  const found: ScriptAnalysis["jets"] = [];
  const upper = script.toUpperCase();

  for (const [name, info] of Object.entries(KNOWN_JETS)) {
    const variations = [
      name.toUpperCase(),
      name.replace("-", "").toUpperCase(),
      name.replace("-", " ").toUpperCase(),
    ];
    if (variations.some((v) => upper.includes(v))) {
      found.push({ name, ...info });
    }
  }

  const nicknameMap: Record<string, string> = {
    "nighthawk": "F-117",
    "raptor": "F-22",
    "lightning": "F-35",
    "tomcat": "F-14",
    "strike eagle": "F-15",
    "fighting falcon": "F-16",
    "viper": "F-16",
    "hornet": "F-18",
    "super hornet": "F-18",
    "warthog": "A-10",
    "thunderbolt": "A-10",
    "spirit": "B-2",
    "lancer": "B-1",
    "hercules": "C-130",
    "flanker": "Su-27",
    "fulcrum": "MiG-29",
    "foxhound": "MiG-31",
    "mustang": "P-51",
  };
  const lower = script.toLowerCase();
  for (const [nickname, jetName] of Object.entries(nicknameMap)) {
    if (lower.includes(nickname) && !found.some((f) => f.name === jetName) && KNOWN_JETS[jetName]) {
      found.push({ name: jetName, ...KNOWN_JETS[jetName] });
    }
  }

  const genericAircraft = [
    { pattern: /fighter\s*jet/i, name: "Fighter Jet", type: "Generic Fighter", description: "Unspecified fighter jet", visualDetails: "Sleek military fighter aircraft, grey paint, weapons pylons, afterburner glow" },
    { pattern: /bomber/i, name: "Bomber", type: "Strategic Bomber", description: "Unspecified bomber aircraft", visualDetails: "Large military bomber, swept wings, multiple engines, dark military paint" },
    { pattern: /helicopter/i, name: "Military Helicopter", type: "Helicopter", description: "Military helicopter", visualDetails: "Military rotary-wing aircraft, olive drab paint, weapon systems" },
    { pattern: /drone|uav/i, name: "Military Drone", type: "UAV", description: "Unmanned aerial vehicle", visualDetails: "Sleek drone aircraft, sensor pod, wings with pylons, grey paint" },
  ];

  for (const ga of genericAircraft) {
    if (ga.pattern.test(script) && !found.some((f) => f.name === ga.name)) {
      found.push(ga);
    }
  }

  if (found.length === 0) {
    found.push({
      name: "Military Aircraft",
      type: "Generic",
      description: "Military aircraft referenced in the script",
      visualDetails: "Sleek military aircraft, grey tactical paint, weapons systems visible",
    });
  }

  return found;
}

function extractCharacters(script: string): ScriptAnalysis["characters"] {
  const characters: ScriptAnalysis["characters"] = [];
  const ranks = [
    "General", "Colonel", "Lieutenant Colonel", "Major", "Captain",
    "Lieutenant", "Commander", "Admiral", "Sergeant", "Corporal",
    "Private", "Chief", "Wing Commander", "Squadron Leader",
    "Flight Lieutenant", "Pilot Officer", "Commodore",
  ];

  const namePattern = /(?:(?:General|Colonel|Lt\.? Col\.?|Major|Captain|Capt\.?|Lieutenant|Lt\.?|Commander|Cmdr\.?|Admiral|Sergeant|Sgt\.?|Chief|Wing Commander|Squadron Leader|Flight Lieutenant|Pilot Officer|Commodore)\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g;

  const seen = new Set<string>();
  let match;
  while ((match = namePattern.exec(script)) !== null) {
    const fullMatch = match[0].trim();
    const name = match[1].trim();

    if (name.length < 3) continue;
    const skipWords = new Set(["The", "This", "That", "When", "Where", "What", "How", "They", "Their", "Then", "From", "Into", "With", "Over", "Under", "Behind", "Through", "Above", "Below", "After", "Before", "Between", "Against", "Around", "During", "Each", "Every", "Both", "Either", "Neither", "Such", "Just", "Like", "Only", "Even", "Still", "Also", "Very", "Most", "Much", "Many", "Some", "Any", "All", "Few", "Several", "Mach", "Two", "Three", "Four", "Five", "Because", "Fortunately", "Unfortunately", "However", "Meanwhile", "Instead", "Although", "Despite", "Suddenly", "Finally", "March", "April", "May", "June", "January", "February", "July", "August", "September", "October", "November", "December", "North", "South", "East", "West", "Component", "Commander", "Joint", "Forces"]);
    if (skipWords.has(name.split(" ")[0])) continue;

    const lowerName = name.toLowerCase();
    if (seen.has(lowerName)) continue;

    const knownAircraft = Object.keys(KNOWN_JETS).map(k => k.toLowerCase());
    if (knownAircraft.includes(lowerName)) continue;
    const nonPersonWords = new Set(["raptor", "nighthawk", "viper", "vipers", "ghost", "eagle", "hornet", "falcon", "thunderbolt", "bomber", "fighter", "radar", "missile", "cockpit", "throttle", "engine", "runway", "base", "headquarters", "belgrade", "serbian", "serbia", "air", "iraq", "iran", "china", "russia", "ukraine", "korea", "vietnam", "kuwait", "afghanistan", "pacific", "atlantic", "europe", "america", "nato"]);
    if (nonPersonWords.has(lowerName)) continue;

    let rank = "";
    for (const r of ranks) {
      if (fullMatch.startsWith(r)) {
        rank = r;
        break;
      }
    }

    if (name.split(" ").length === 1 && !rank) {
      const singleWordSkip = new Set(["Raptor", "Nighthawk", "Vipers", "Ghost", "Eagle", "Hornet", "Serbian", "Belgrade", "Weather", "Radar", "Missile", "Stealth", "Mission", "Command", "Radio", "Cockpit", "Throttle"]);
      if (singleWordSkip.has(name)) continue;
    }

    seen.add(lowerName);

    const fullName = rank ? `${rank} ${name}` : name;
    const dedupedName = fullName.replace(/(\b\w+\b)\s+\1/gi, "$1");
    characters.push({
      name: dedupedName,
      role: rank ? `${rank} - Military Personnel` : "Character",
      description: `Character appearing in the aviation script`,
      appearance: rank
        ? `Military flight suit or dress uniform, rank insignia visible, determined expression, military bearing`
        : `Professional military appearance, flight gear or tactical equipment`,
    });
  }

  return characters;
}

function extractLocations(script: string): ScriptAnalysis["locations"] {
  const locations: ScriptAnalysis["locations"] = [];
  const seen = new Set<string>();

  const locationPatterns: { pattern: RegExp; name: string; description: string; visualDetails: string }[] = [
    { pattern: /cockpit/i, name: "Fighter Cockpit", description: "Inside a military jet cockpit", visualDetails: "Glass canopy, HUD display, flight instruments, throttle and stick controls, ejection seat, cramped interior with green-lit instruments" },
    { pattern: /aircraft carrier|carrier deck/i, name: "Aircraft Carrier Deck", description: "Flight deck of a naval aircraft carrier", visualDetails: "Massive grey steel deck, catapult tracks, arresting wires, island superstructure, aircraft parked, crew in colored jerseys" },
    { pattern: /hangar/i, name: "Military Hangar", description: "Aircraft hangar on a military base", visualDetails: "Large open hangar with concrete floor, overhead lighting, maintenance equipment, aircraft under repair, tool stations" },
    { pattern: /runway|tarmac|airstrip/i, name: "Military Runway", description: "Runway at a military airbase", visualDetails: "Long concrete runway with markings, taxiways, control tower in distance, heat shimmer, military buildings" },
    { pattern: /briefing room|war room|command center/i, name: "Briefing Room", description: "Military briefing/command center", visualDetails: "Large wall display screens, tactical maps, rows of seats, podium, dim lighting with screen glow, military emblems" },
    { pattern: /radar|tower|control/i, name: "Control Tower", description: "Air traffic control tower", visualDetails: "Elevated glass-walled room, radar screens, communication equipment, panoramic airfield view" },
    { pattern: /ocean|sea|water/i, name: "Open Ocean", description: "Open ocean environment", visualDetails: "Vast dark blue ocean, white-capped waves, distant horizon, dramatic sky reflections" },
    { pattern: /desert/i, name: "Desert Landscape", description: "Arid desert environment", visualDetails: "Vast sandy terrain, heat haze, rocky outcrops, clear sky, dust and sand particles in air" },
    { pattern: /mountain/i, name: "Mountain Range", description: "Mountain terrain", visualDetails: "Snow-capped peaks, rugged terrain, valleys below, cloud layer at peak level, dramatic altitude" },
    { pattern: /sky|altitude|cloud/i, name: "High Altitude Sky", description: "Open sky at high altitude", visualDetails: "Deep blue sky, wispy cirrus clouds below, curvature of earth visible, contrails, vast open air" },
    { pattern: /forest|jungle/i, name: "Dense Forest/Jungle", description: "Dense vegetation below", visualDetails: "Thick green canopy, winding rivers, humid mist, tropical or temperate forest" },
    { pattern: /city|urban/i, name: "Urban Cityscape", description: "City environment", visualDetails: "Skyline of buildings, streets below, urban sprawl, city lights if night" },
    { pattern: /base|compound/i, name: "Military Base", description: "Military installation", visualDetails: "Fenced compound, barracks, administrative buildings, motor pool, security checkpoints, military vehicles" },
  ];

  for (const lp of locationPatterns) {
    if (lp.pattern.test(script) && !seen.has(lp.name)) {
      seen.add(lp.name);
      locations.push(lp);
    }
  }

  if (locations.length === 0) {
    locations.push({
      name: "Aerial Combat Zone",
      description: "Open sky combat environment",
      visualDetails: "Dramatic sky with cloud formations, contrails, atmospheric perspective, vast open airspace",
    });
  }

  return locations;
}

export function splitIntoSentences(script: string): string[] {
  let text = script;
  const decimalPlaceholder = "<<DECIMAL>>";
  const abbreviationPlaceholder = "<<ABBR>>";

  text = text.replace(/(\d)\.(\d)/g, `$1${decimalPlaceholder}$2`);

  const abbreviations = ["Mr", "Mrs", "Ms", "Dr", "Lt", "Col", "Gen", "Sgt", "Cpl", "Pvt", "Cmdr", "Capt", "Adm", "Maj", "Jr", "Sr", "St", "vs", "etc", "approx"];
  for (const abbr of abbreviations) {
    const regex = new RegExp(`\\b${abbr}\\.`, "gi");
    text = text.replace(regex, `${abbr}${abbreviationPlaceholder}`);
  }

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(new RegExp(decimalPlaceholder.replace(/[<>]/g, "\\$&"), "g"), "."))
    .map((s) => s.replace(new RegExp(abbreviationPlaceholder.replace(/[<>]/g, "\\$&"), "g"), "."))
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  return sentences;
}

function inferSceneSubject(sentence: string): string {
  const cleaned = sentence.replace(/[.!?]+$/, "").trim();
  if (cleaned.length <= 120) return cleaned;
  return cleaned.substring(0, 117) + "...";
}

function inferVisualAction(sentence: string): string {
  const s = sentence.toLowerCase();

  const actions: Array<{ keywords: string[]; visual: string }> = [
    { keywords: ["takeoff", "take off", "catapult", "launches", "launched"], visual: "aircraft launching from runway/carrier with afterburner flames blazing, thrust distortion behind engines" },
    { keywords: ["land", "landing", "touchdown", "approach"], visual: "aircraft on final approach, landing gear deployed, runway ahead" },
    { keywords: ["fire", "missile", "shoot", "weapon"], visual: "weapons release, missile trails with smoke, weapons bay open" },
    { keywords: ["explod", "hit", "impact", "destroy", "crash", "wreck"], visual: "explosion with fire, debris, shockwave, smoke billowing" },
    { keywords: ["bank", "turn", "roll", "maneuver", "evas"], visual: "aircraft in aggressive maneuver, wings tilted, G-force visible" },
    { keywords: ["chase", "pursuit", "behind", "follow", "closing"], visual: "two aircraft in pursuit, one chasing the other through the sky" },
    { keywords: ["stealth", "undetected", "invisible", "ghost", "signature", "hidden", "covert"], visual: "sleek dark aircraft moving silently, nearly invisible against sky" },
    { keywords: ["cockpit", "grip", "throttle", "stick", "instrument", "hud", "controls"], visual: "inside fighter cockpit, pilot hands on controls, instruments glowing" },
    { keywords: ["radar", "lock", "detect", "warning", "alert", "blip"], visual: "radar screen with blips, warning lights, electronic warfare" },
    { keywords: ["formation", "escort", "squadron", "wing", "fleet"], visual: "multiple aircraft flying in tight formation" },
    { keywords: ["climb", "altitude", "ascend", "vertical"], visual: "aircraft climbing steeply through cloud layers" },
    { keywords: ["dive", "descend", "drop", "plunge", "nose down"], visual: "aircraft diving at steep angle toward the ground" },
    { keywords: ["night", "dark", "midnight", "moon"], visual: "night sky operations, moonlit clouds, cockpit glow" },
    { keywords: ["storm", "rain", "lightning", "thunder", "weather", "turbulence"], visual: "aircraft flying through storm, lightning flashes, rain streaks" },
    { keywords: ["speed", "mach", "supersonic", "sonic boom", "fast", "velocity"], visual: "aircraft at extreme speed, compression waves, vapor cone forming" },
    { keywords: ["refuel", "tanker", "boom"], visual: "mid-air refueling, tanker aircraft above with boom extended" },
    { keywords: ["eject", "bail out", "parachute"], visual: "pilot ejecting from aircraft, canopy blown, ejection seat firing" },
    { keywords: ["carrier", "deck", "ship", "naval", "sea"], visual: "aircraft on aircraft carrier deck, ocean in background" },
    { keywords: ["bomb", "payload", "target", "strike", "sortie"], visual: "bombing run, aircraft releasing ordnance over target" },
    { keywords: ["dogfight", "combat", "duel", "engage", "fight"], visual: "close aerial combat between fighters, contrails crossing" },
    { keywords: ["ground", "terrain", "landscape", "below", "earth"], visual: "aerial view showing terrain below the aircraft" },
    { keywords: ["radio", "comm", "mayday", "tower", "command"], visual: "pilot speaking into radio, helmet-mounted mic visible" },
    { keywords: ["fly", "flight", "soar", "glide", "cruise", "airborne"], visual: "aircraft in steady flight through dramatic sky" },
  ];

  for (const a of actions) {
    if (a.keywords.some((kw) => s.includes(kw))) return a.visual;
  }

  return "military aircraft in dramatic cinematic scene";
}

export function buildScenePrompt(
  sentence: string,
  analysis: ScriptAnalysis,
  prevSentence: string | null,
  nextSentence: string | null,
  variant: number,
): string {
  const sceneSubject = inferSceneSubject(sentence);
  const visualAction = inferVisualAction(sentence);

  const relevantJets = analysis.jets.filter((jet) =>
    sentence.toLowerCase().includes(jet.name.toLowerCase()) ||
    sentence.toLowerCase().includes(jet.name.replace("-", "").toLowerCase())
  );

  const relevantChars = analysis.characters.filter((char) => {
    const names = char.name.split(" ");
    return names.some((n) => n.length > 3 && sentence.includes(n));
  });

  const relevantLocs = analysis.locations.filter((loc) => {
    const keywords = loc.name.toLowerCase().split(/[\s/]+/);
    return keywords.some((kw) => kw.length > 3 && sentence.toLowerCase().includes(kw));
  });

  const jetInfo = relevantJets.length > 0 ? relevantJets[0] : (analysis.jets.length > 0 ? analysis.jets[0] : null);

  const variantStyles = [
    { angle: "dramatic low-angle hero shot", extra: "aircraft dominates frame against vast sky, ground perspective looking up" },
    { angle: "wide cinematic establishing shot", extra: "full environment visible, aircraft in context of surroundings, landscape and sky" },
    { angle: "dynamic action tracking shot", extra: "motion blur on edges, sense of speed, chase aircraft perspective" },
    { angle: "close-up detail shot", extra: "shallow depth of field, intimate focus on cockpit/pilot/aircraft surface details" },
  ];
  const style = variantStyles[variant - 1] || variantStyles[0];

  let prompt = `Unreal Engine 5 cinematic 3D render, high-fidelity CGI with slight stylization — NOT a photograph, cinematic 8K. `;

  prompt += `Depict this exact scene: "${sceneSubject}". `;
  prompt += `Visual interpretation: ${visualAction}. `;
  prompt += `Camera: ${style.angle}, ${style.extra}. `;

  if (jetInfo) {
    prompt += `Aircraft: ${jetInfo.name} (${jetInfo.type}), ${jetInfo.visualDetails}. `;
  }

  if (relevantChars.length > 0) {
    prompt += `Character: ${relevantChars[0].name}, ${relevantChars[0].appearance}. `;
  }

  if (relevantLocs.length > 0) {
    prompt += `Setting: ${relevantLocs[0].visualDetails}. `;
  }

  prompt += `Lighting: ${analysis.visualStyle.lighting}. `;
  prompt += `Atmosphere: ${analysis.visualStyle.atmosphere}. `;

  if (prevSentence) {
    prompt += `Continues from: "${prevSentence.substring(0, 60)}". `;
  }

  prompt += `Volumetric lighting, cinematic lens flare, depth of field. Photorealistic military aviation, no text, no watermarks, no cartoons.`;

  return prompt;
}

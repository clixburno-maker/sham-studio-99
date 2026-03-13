# Video Production - YT

## Overview
A video production tool for generating cinematic visuals from aviation/military scripts. Features two main flows:
1. **AI Script Writer**: Enter a topic + choose length → Claude writes the script → slide-to-approve → ElevenLabs voiceover generation → creates project
2. **Direct Script Input**: Paste an existing script directly and create a project

Once a project exists, the system analyzes the script using Claude Opus 4.6, builds a "Story Bible" with detailed element descriptions, generates photorealistic 4K images via EvoLink API, and converts them to video clips. Premium glassmorphism UI design throughout.

## Background Processing
- Analysis progress is persisted to database (`analysisProgress` column on projects table) — survives browser close, page navigation, and server restarts
- Project status transitions: draft → analyzing → analyzed → generating → completed
- Scenes are saved progressively (one at a time) during analysis — frontend polls and displays them as they arrive
- Multiple concurrent analyses are supported — each runs independently with zero quality impact
- On server restart, stale "analyzing" projects are recovered: if scenes exist they're marked analyzed, otherwise reset to draft
- On server restart, stale "generating" projects are recovered: stuck images marked failed, project status reset to completed/analyzed
- Image generation runs in background: endpoint returns immediately, progress tracked in-memory via `generationProgressMap`
- Images submitted in batches of 15 with 1-second delay between batches to avoid API overload
- Built-in auto-polling after submission: server checks image status every 5s until all complete (up to 15 min timeout)
- Frontend polls `/api/projects/:id/generation-progress` every 3s showing live counts (total/submitted/completed/failed)
- Duplicate generation prevented: cannot start new generate-all while one is already submitting or polling
- Dashboard auto-refreshes when any project is analyzing; project view auto-resumes polling on page load

## Architecture
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui + wouter routing + TanStack Query
- **Backend**: Express.js API
- **Database**: PostgreSQL with Drizzle ORM
- **AI Script Writing**: Claude Sonnet via Anthropic API (topic → script generation)
- **AI Analysis**: Claude Opus 4.6 via Anthropic API directly (uses ANTHROPIC_API_KEY)
- **Voiceover**: ElevenLabs API (text-to-speech with voice selection)
- **Image Generation**: NanoBanana Pro only via EvoLink.AI API gateway (api.evolink.ai):
  - NanoBanana Pro ($0.05/image, 4K, Gemini-powered) - default, proven quality, up to 3 ref images
- **Image-to-Video**: Multiple models via EvoLink.AI API gateway:
  - Grok Imagine Video ($0.064/clip, 6s, 720p) - default, fast and affordable
  - Seedance 1.5 Pro ($0.198/clip, 8s, 720p) - ByteDance cinematic with camera control
  - Hailuo 2.3 Fast ($0.167/clip, 6s, 768p) - MiniMax great motion and expressions
  - Veo 3.1 Quality ($0.1681/clip, 8s, 1080p) - Google high-quality cinematic motion
  - Kling 3.0 ($1.50/clip, 15s, 1080p) - premium maximum-duration clips with best motion
  - Sora 2 Pro ($0.958/clip, 15s, 1080p HD) - OpenAI premium with physics-accurate motion

## Cost Tracking System
- **Database columns**: `analysisCost`, `imageGenerationCost`, `videoGenerationCost` (real/float) on projects table
- **Server-side tracking**: `storage.addProjectCost()` atomically increments costs at generation points (uses SQL COALESCE + increment)
- **Analysis cost**: Estimated based on script word count and scene count after analysis completes
- **Image cost**: Tracked per successful image submission (generate-all, single scene generate, regeneration, consistency regeneration, retry-failed, smart-regenerate, feedback regeneration with fallbacks)
- **Video cost**: Tracked per video generation (single, animate-all, scene, feedback-based)
- **Frontend display**: Cost breakdown in project header tooltip, detailed "Spent So Far" panel with per-category itemization
- **Fallback**: For older projects without tracked costs, falls back to client-side estimates based on completed counts

## Image Regeneration with Feedback
- **Subject identity lock**: `applyFeedbackToPrompt()` uses strict rules to preserve the original subject identity (aircraft type, era, vehicle, character) when applying feedback
- **Scene context**: Feedback regeneration receives scene description, mood, shot label, and Story Bible (aircraft/character descriptions) to maintain continuity. Uses `visualDetails` field (not visualDescription) for jets and characters per Story Bible schema
- **Story Bible fallback**: `getStoryBible()` helper function first checks in-memory cache, then falls back to persisted `project.analysis` from database — survives server restarts
- **Minimal diff principle**: AI makes only the requested change, keeping the rest of the prompt word-for-word identical
- **Era protection**: Historical era elements (WWII, Cold War, etc.) are locked and cannot be accidentally changed

## Character Reference System
- **Multi-angle portraits**: Each character gets 3 portraits (front view, three-quarter view, side profile)
- **Database**: `characterReferences` table with `angle` column (values: "front", "three-quarter", "profile")
- **Consistency regeneration**: Scene images can be regenerated using character reference portraits for consistency
  - Individual image: `POST /api/projects/:id/images/:imageId/regenerate-with-consistency`
  - Whole scene: `POST /api/projects/:id/scenes/:sceneId/regenerate-with-consistency`
- **Reference usage**: `getCharacterReferenceUrlsForScene()` collects all angle portraits for characters present in a scene (max 3 images per NanoBanana Pro limit)
- **Portrait lightbox**: Clicking any character portrait opens full-size view with character name and angle label
- **Per-angle regeneration**: Each angle can be individually regenerated with optional feedback

## Key Files
- `shared/schema.ts` - Data models (projects with voiceoverUrl, scenes with shotLabels/expectedImages, generatedImages, characterReferences with angle)
- `server/routes.ts` - API endpoints with StoryBible/VisualScene caching + script generation + voiceover routes
- `server/ai-analyzer.ts` - Full-story AI comprehension engine (Story Bible + visual beat grouping + unrestricted cinematographer prompts)
- `server/script-analyzer.ts` - Legacy script analysis engine (character/jet/location extraction via regex)
- `server/nanobanana.ts` - Image generation API integration (NanoBanana Pro only) and video generation
- `server/elevenlabs.ts` - ElevenLabs TTS integration (voice listing + voiceover generation)
- `server/storage.ts` - Database CRUD operations
- `client/src/pages/dashboard.tsx` - Project listing with AI Script Writer card
- `client/src/pages/write-script.tsx` - AI Script Writer flow (topic → review → voiceover → create project)
- `client/src/pages/new-project.tsx` - Direct script input
- `client/src/pages/project-view.tsx` - Story Bible, Storyboard timeline, Gallery views, Lightbox with arrow navigation

## AI Script Writer Flow
1. **Topic Input**: User enters topic description + selects script length (short/medium/long/epic)
2. **Script Generation**: Claude Sonnet writes a cinematic narration script based on the topic
3. **Review & Approve**: User reviews/edits the script, slides approval slider to approve
4. **Voiceover**: ElevenLabs generates AI voiceover with voice selection, user can preview
5. **Create Project**: Project created with script + voiceover URL, navigates to project view

## AI Analysis Flow
1. **Full-Story Comprehension**: Claude reads entire script in one pass, builds Story Bible with ultra-detailed descriptions of ALL elements
2. **Visual Beat Grouping**: Sentences grouped into visual beats by an AI film editor
3. **Cross-Scene Continuity (CumulativeVisualMemory)**: Cumulative memory from previous scenes
4. **Variable Image Sequence Generation**: Each visual beat gets 2-10 image prompts
5. **Character Reference Portraits**: Multi-angle reference portrait images (front, 3/4, profile) for visual consistency
6. **Total Visual Consistency with Identity Anchoring**: ALL element descriptions copied word-for-word into every prompt
7. **Prompt Quality**: No word limit, 800-2,000+ words per prompt
8. **AI-Powered Motion Prompts**: Three-layer motion prompt system designed for image-to-video AI limitations:
   - Layer 1: Analysis-time motion prompts with anti-morphing rules and subject identity preservation
   - Layer 2: `generateSmartMotionPrompt()` — Claude-powered refinement at video generation time with subject identity locking, anti-morphing constraints, and model-aware motion guidance
   - Layer 3: `buildVideoPrompt()` — fallback with automatic subject-type detection (aircraft/vehicle/vessel) and consistency anchoring

## Scene Data
- `scene.promptBase` - JSON string array of 2-10 image prompts (variable per scene)
- `scene.shotLabels` - JSON string array of AI-chosen shot labels
- `scene.expectedImages` - Integer: how many images this scene should have (2-10)
- `scene.context` - JSON string with metadata
- `scene.sceneDescription` - AI-generated description of the visual beat
- `scene.mood`, `scene.timeOfDay`, `scene.location` - Scene metadata from AI analysis

## API Routes
- `POST /api/generate-script` - AI script generation from topic (body: { topic, length })
- `GET /api/voices` - List available ElevenLabs voices
- `POST /api/generate-voiceover` - Generate TTS voiceover (body: { text, voiceId })
- `GET /api/projects` - List all projects
- `GET /api/projects/:id` - Get project details
- `POST /api/projects` - Create project (supports voiceoverUrl)
- `POST /api/projects/:id/analyze` - Full-story AI analysis (Claude Opus 4.6)
- `GET /api/projects/:id/analyze-progress` - Poll analysis progress
- `GET /api/projects/:id/character-references` - Get character reference portraits
- `POST /api/projects/:id/generate-character-references` - Generate multi-angle reference portraits (3 per character)
- `POST /api/projects/:id/character-references/:refId/regenerate` - Regenerate a single portrait angle
- `POST /api/projects/:id/character-references/poll` - Poll portrait generation status
- `POST /api/projects/:id/scenes/:sceneId/generate` - Generate images for a scene
- `POST /api/projects/:id/generate-all` - Generate images for all scenes
- `POST /api/projects/:id/poll-images` - Poll image generation status
- `POST /api/projects/:id/images/:imageId/regenerate` - Regenerate a single image
- `POST /api/projects/:id/images/:imageId/regenerate-with-consistency` - Regenerate image using character portraits
- `POST /api/projects/:id/scenes/:sceneId/regenerate-with-consistency` - Regenerate all scene images using character portraits
- `POST /api/projects/:id/scenes/:sceneId/animate-all` - Generate videos for all images in a scene
- `POST /api/projects/:id/images/:imageId/generate-video` - Create video from image
- `POST /api/projects/:id/images/:imageId/regenerate-video-with-feedback` - Regenerate video with motion feedback
- `POST /api/projects/:id/scenes/:sceneId/regenerate-videos-with-feedback` - Regenerate all scene videos with motion feedback
- `POST /api/images/:imageId/check-video` - Check video generation status
- `POST /api/projects/:id/poll-videos` - Poll all video generation status
- `GET /api/image-models` - List image generation models with pricing
- `GET /api/video-models` - List video generation models with pricing
- `POST /api/projects/:id/export` - Export project as PDF storyboard
- `GET /api/projects/:id/clips-info` - Get clip count and ZIP size estimate
- `GET /api/projects/:id/download-clips` - Download all video clips as ZIP
- `GET /api/niches/:id/videos` - Get stored video transcripts for a niche
- `POST /api/niches/:id/retrain` - Re-train a niche (re-extract transcripts + re-analyze style)

## Per-User API Key Support (BYOK)
- Users can provide their own API keys via the **API Keys** settings dialog on the dashboard
- Keys are stored in `localStorage` (client-side only, never sent to the database)
- Three keys supported: Anthropic (Claude), ElevenLabs (voiceover), EvoLink/NanoBanana (images/video)
- Client sends keys as custom headers on every request: `x-user-anthropic-key`, `x-user-elevenlabs-key`, `x-user-evolink-key`
- `client/src/lib/api-keys.ts` — localStorage storage, `getApiHeaders()` helper, `maskKey()` display
- `client/src/lib/queryClient.ts` — Injects API key headers into all `apiRequest()` and TanStack Query fetch calls
- `client/src/components/api-key-settings.tsx` — Settings dialog component with set/clear/mask/reveal per key
- Server-side: `extractUserKeys(req)` helper in `routes.ts` extracts headers from each request
- Service modules accept optional `userApiKey` parameter: falls back to environment variable if not provided
  - `ai-analyzer.ts`: `getAnthropicClient(userApiKey)` creates per-request Anthropic client
  - `nanobanana.ts`: `generateImage()`, `generateVideo()`, `checkImageStatus()`, `checkVideoStatus()` accept optional key
  - `elevenlabs.ts`: `generateVoiceover()` accepts optional key

## Secrets
- `ANTHROPIC_API_KEY` - API key from Anthropic for Claude analysis and script writing (fallback when no user key)
- `ELEVENLABS_API_KEY` - API key from ElevenLabs for voiceover generation (fallback when no user key)
- `NANOBANANA_API_KEY` - API key from EvoLink.AI for image generation and video generation (fallback when no user key)
- `YOUTUBE_TRANSCRIPT_API_KEY` - API key from youtube-transcript.io for YouTube transcript extraction
- `DATABASE_URL` - PostgreSQL connection string

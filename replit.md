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
- **Image Generation**: Multiple models via EvoLink.AI API gateway (api.evolink.ai):
  - NanoBanana Pro ($0.05/image, 4K, Gemini-powered) - default, proven quality, up to 3 ref images
  - SeedREAM 4.5 ($0.04/image, 4K, ByteDance) - superior character consistency, up to 10 ref images
- **Image-to-Video**: Multiple models via EvoLink.AI API gateway:
  - Grok Imagine Video ($0.064/clip, 6s, 720p) - default, fast and affordable
  - Seedance 1.5 Pro ($0.198/clip, 8s, 720p) - ByteDance cinematic with camera control
  - Hailuo 2.3 Fast ($0.167/clip, 6s, 768p) - MiniMax great motion and expressions
  - Veo 3.1 Quality ($0.1681/clip, 8s, 1080p) - Google high-quality cinematic motion
  - Kling 3.0 ($1.50/clip, 15s, 1080p) - premium maximum-duration clips with best motion
  - Sora 2 Pro ($0.958/clip, 15s, 1080p HD) - OpenAI premium with physics-accurate motion

## Key Files
- `shared/schema.ts` - Data models (projects with voiceoverUrl, scenes with shotLabels/expectedImages, generatedImages, nicheVideos)
- `server/routes.ts` - API endpoints with StoryBible/VisualScene caching + script generation + voiceover routes
- `server/ai-analyzer.ts` - Full-story AI comprehension engine (Story Bible + visual beat grouping + unrestricted cinematographer prompts)
- `server/script-analyzer.ts` - Legacy script analysis engine (character/jet/location extraction via regex)
- `server/nanobanana.ts` - Image generation API integration (NanoBanana Pro + SeedREAM 4.5) and video generation
- `server/elevenlabs.ts` - ElevenLabs TTS integration (voice listing + voiceover generation)
- `server/api-keys.ts` - Dynamic API key resolver (custom DB keys override env vars, with 30s cache)
- `server/storage.ts` - Database CRUD operations
- `client/src/pages/dashboard.tsx` - Project listing with AI Script Writer card
- `client/src/pages/write-script.tsx` - AI Script Writer flow (topic → review → voiceover → create project)
- `client/src/pages/new-project.tsx` - Direct script input
- `client/src/pages/project-view.tsx` - Story Bible, Storyboard timeline, Gallery views, Lightbox with arrow navigation
- `client/src/pages/settings.tsx` - API Settings page for managing custom API keys

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
5. **Multi-Angle Character Reference Portraits**: 3 reference portraits per character (full body, face close-up, profile) for maximum visual consistency
6. **Location Reference Images**: Auto-generated establishing shots for the top 5 most frequently recurring locations (2+ scene appearances)
7. **Total Visual Consistency with Identity Anchoring**: ALL element descriptions copied word-for-word into every prompt
8. **Reference Image Priority**: Scene generation receives up to 4 reference images prioritized as: face close-ups > full body > location > profiles
9. **Prompt Quality**: No word limit, 800-2,000+ words per prompt
10. **AI-Powered Motion Prompts**: Intelligent motion prompts for video generation

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
- `GET /api/projects/:id/character-references` - Get multi-angle character reference portraits (full_body, face_closeup, profile)
- `POST /api/projects/:id/generate-character-references` - Generate 3 reference portraits per character
- `POST /api/projects/:id/character-references/:refId/regenerate` - Regenerate a single portrait
- `POST /api/projects/:id/character-references/poll` - Poll portrait generation status
- `GET /api/projects/:id/location-references` - Get location reference images
- `POST /api/projects/:id/generate-location-references` - Generate establishing shots for top recurring locations
- `POST /api/projects/:id/location-references/:refId/regenerate` - Regenerate a location reference
- `POST /api/projects/:id/location-references/poll` - Poll location reference generation status
- `POST /api/projects/:id/scenes/:sceneId/generate` - Generate images for a scene
- `POST /api/projects/:id/generate-all` - Generate images for all scenes
- `POST /api/projects/:id/poll-images` - Poll image generation status
- `POST /api/projects/:id/images/:imageId/regenerate` - Regenerate a single image
- `POST /api/projects/:id/scenes/:sceneId/animate-all` - Generate videos for all images in a scene
- `POST /api/projects/:id/images/:imageId/generate-video` - Create video from image
- `POST /api/images/:imageId/check-video` - Check video generation status
- `POST /api/projects/:id/poll-videos` - Poll all video generation status
- `GET /api/image-models` - List image generation models with pricing
- `GET /api/video-models` - List video generation models with pricing
- `POST /api/projects/:id/export` - Export project as PDF storyboard
- `GET /api/projects/:id/clips-info` - Get clip count and ZIP size estimate
- `GET /api/projects/:id/download-clips` - Download all video clips as ZIP
- `GET /api/niches/:id/videos` - Get stored video transcripts for a niche
- `POST /api/niches/:id/retrain` - Re-train a niche (re-extract transcripts + re-analyze style)

## API Settings
- Custom API keys can be set via the in-app Settings page (`/settings`)
- Custom keys are stored in `api_settings` table and override environment variables
- Key resolver in `server/api-keys.ts` checks: custom DB key first → env var fallback
- 30-second cache to avoid repeated DB lookups per request
- Services: `anthropic` (Claude), `evolink` (EvoLink.AI images/video), `elevenlabs` (TTS)
- Keys are never returned in full via the API — only masked versions (first 4 + last 4 chars)
- Test endpoint validates keys against each service's API before saving

## Secrets
- `ANTHROPIC_API_KEY` - API key from Anthropic for Claude analysis and script writing
- `ELEVENLABS_API_KEY` - API key from ElevenLabs for voiceover generation
- `NANOBANANA_API_KEY` - API key from EvoLink.AI for image generation and video generation
- `YOUTUBE_TRANSCRIPT_API_KEY` - API key from youtube-transcript.io for YouTube transcript extraction
- `DATABASE_URL` - PostgreSQL connection string

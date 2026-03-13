import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, jsonb, timestamp, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  script: text("script").notNull(),
  status: text("status").notNull().default("draft"),
  analysis: jsonb("analysis"),
  analysisProgress: jsonb("analysis_progress"),
  voiceoverUrl: text("voiceover_url"),
  analysisCost: real("analysis_cost").default(0),
  imageGenerationCost: real("image_generation_cost").default(0),
  videoGenerationCost: real("video_generation_cost").default(0),
});

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, analysis: true, analysisProgress: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

export const scenes = pgTable("scenes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  sentenceIndex: integer("sentence_index").notNull(),
  sentence: text("sentence").notNull(),
  context: text("context"),
  sceneDescription: text("scene_description"),
  promptBase: text("prompt_base"),
  shotLabels: text("shot_labels"),
  expectedImages: integer("expected_images").notNull().default(4),
  characters: jsonb("characters"),
  objects: jsonb("objects"),
  location: text("location"),
  timeOfDay: text("time_of_day"),
  mood: text("mood"),
  cameraAngle: text("camera_angle"),
});

export const insertSceneSchema = createInsertSchema(scenes).omit({ id: true });
export type InsertScene = z.infer<typeof insertSceneSchema>;
export type Scene = typeof scenes.$inferSelect;

export const generatedImages = pgTable("generated_images", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sceneId: varchar("scene_id").notNull(),
  projectId: varchar("project_id").notNull(),
  variant: integer("variant").notNull(),
  prompt: text("prompt").notNull(),
  imageUrl: text("image_url"),
  status: text("status").notNull().default("pending"),
  taskId: text("task_id"),
  videoUrl: text("video_url"),
  videoTaskId: text("video_task_id"),
  videoStatus: text("video_status"),
  videoPrompt: text("video_prompt"),
  videoPromptSent: text("video_prompt_sent"),
  videoModel: text("video_model"),
  videoError: text("video_error"),
  error: text("error"),
});

export const insertImageSchema = createInsertSchema(generatedImages).omit({ id: true });
export type InsertImage = z.infer<typeof insertImageSchema>;
export type GeneratedImage = typeof generatedImages.$inferSelect;

export const scriptAnalysis = z.object({
  title: z.string(),
  genre: z.string(),
  setting: z.string(),
  timePeriod: z.string(),
  characters: z.array(z.object({
    name: z.string(),
    role: z.string(),
    description: z.string(),
    appearance: z.string(),
    signatureFeatures: z.string().optional(),
    emotionalArc: z.string().optional(),
    relationships: z.array(z.object({
      with: z.string(),
      nature: z.string(),
      evolution: z.string(),
    })).optional(),
  })),
  jets: z.array(z.object({
    name: z.string(),
    type: z.string(),
    description: z.string(),
    visualDetails: z.string(),
    signatureFeatures: z.string().optional(),
  })),
  vehicles: z.array(z.object({
    name: z.string(),
    type: z.string(),
    description: z.string(),
    visualDetails: z.string(),
    signatureFeatures: z.string().optional(),
  })).optional().default([]),
  keyObjects: z.array(z.object({
    name: z.string(),
    type: z.string(),
    description: z.string(),
    visualDetails: z.string(),
    signatureFeatures: z.string().optional(),
  })).optional().default([]),
  locations: z.array(z.object({
    name: z.string(),
    description: z.string(),
    visualDetails: z.string(),
    signatureFeatures: z.string().optional(),
  })),
  visualStyle: z.object({
    baseStyle: z.string(),
    lighting: z.string(),
    colorPalette: z.string(),
    atmosphere: z.string(),
    weatherProgression: z.string().optional().default(""),
  }),
});

export type ScriptAnalysis = z.infer<typeof scriptAnalysis>;

export const characterReferences = pgTable("character_references", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  characterName: text("character_name").notNull(),
  description: text("description").notNull(),
  prompt: text("prompt").notNull(),
  imageUrl: text("image_url"),
  status: text("status").notNull().default("pending"),
  taskId: text("task_id"),
  angle: text("angle").notNull().default("front"),
});

export const insertCharacterReferenceSchema = createInsertSchema(characterReferences).omit({ id: true });
export type InsertCharacterReference = z.infer<typeof insertCharacterReferenceSchema>;
export type CharacterReference = typeof characterReferences.$inferSelect;

export const niches = pgTable("niches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  channelUrl: text("channel_url"),
  channelName: text("channel_name"),
  status: text("status").notNull().default("pending"),
  styleProfile: jsonb("style_profile"),
  videoCount: integer("video_count").default(0),
  sampleTranscripts: jsonb("sample_transcripts"),
  createdAt: text("created_at").default(sql`now()::text`),
});

export const insertNicheSchema = createInsertSchema(niches).omit({ id: true, styleProfile: true, sampleTranscripts: true, createdAt: true });
export type InsertNiche = z.infer<typeof insertNicheSchema>;
export type Niche = typeof niches.$inferSelect;

export const nicheVideos = pgTable("niche_videos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nicheId: varchar("niche_id").notNull(),
  videoId: text("video_id").notNull(),
  title: text("title").notNull(),
  transcript: text("transcript").notNull(),
  wordCount: integer("word_count").default(0),
  createdAt: text("created_at").default(sql`now()::text`),
});

export const insertNicheVideoSchema = createInsertSchema(nicheVideos).omit({ id: true, createdAt: true });
export type InsertNicheVideo = z.infer<typeof insertNicheVideoSchema>;
export type NicheVideo = typeof nicheVideos.$inferSelect;

export const savedScripts = pgTable("saved_scripts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  topic: text("topic").notNull(),
  script: text("script").notNull(),
  wordCount: integer("word_count").default(0),
  durationMinutes: integer("duration_minutes"),
  nicheId: varchar("niche_id"),
  nicheName: text("niche_name"),
  voiceoverUrl: text("voiceover_url"),
  voiceId: text("voice_id"),
  voiceName: text("voice_name"),
  projectId: varchar("project_id"),
  createdAt: text("created_at").default(sql`now()::text`),
});

export const insertSavedScriptSchema = createInsertSchema(savedScripts).omit({ id: true, createdAt: true });
export type InsertSavedScript = z.infer<typeof insertSavedScriptSchema>;
export type SavedScript = typeof savedScripts.$inferSelect;

export const customVoices = pgTable("custom_voices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  voiceId: text("voice_id").notNull(),
  description: text("description"),
  createdAt: text("created_at").default(sql`now()::text`),
});

export const insertCustomVoiceSchema = createInsertSchema(customVoices).omit({ id: true, createdAt: true });
export type InsertCustomVoice = z.infer<typeof insertCustomVoiceSchema>;
export type CustomVoice = typeof customVoices.$inferSelect;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

import {
  type User, type InsertUser,
  type Project, type InsertProject,
  type Scene, type InsertScene,
  type GeneratedImage, type InsertImage,
  type CharacterReference, type InsertCharacterReference,
  type LocationReference, type InsertLocationReference,
  type Niche, type InsertNiche,
  type NicheVideo, type InsertNicheVideo,
  type SavedScript, type InsertSavedScript,
  type CustomVoice, type InsertCustomVoice,
  type ApiSetting, type InsertApiSetting,
  users, projects, scenes, generatedImages, characterReferences, locationReferences, niches, nicheVideos, savedScripts, customVoices, apiSettings,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, data: Partial<Project>): Promise<Project>;

  getScenesByProject(projectId: string): Promise<Scene[]>;
  getScene(id: string): Promise<Scene | undefined>;
  createScene(scene: InsertScene): Promise<Scene>;
  createScenes(scenes: InsertScene[]): Promise<Scene[]>;
  updateScene(id: string, data: Partial<Scene>): Promise<Scene>;
  deleteScenesByProject(projectId: string): Promise<void>;

  getImagesByProject(projectId: string): Promise<GeneratedImage[]>;
  getImagesByScene(sceneId: string): Promise<GeneratedImage[]>;
  getImageById(id: string): Promise<GeneratedImage | undefined>;
  createImage(image: InsertImage): Promise<GeneratedImage>;
  createImages(images: InsertImage[]): Promise<GeneratedImage[]>;
  updateImage(id: string, data: Partial<GeneratedImage>): Promise<GeneratedImage>;
  deleteImagesByScene(sceneId: string): Promise<void>;
  deleteImagesByProject(projectId: string): Promise<void>;
  deleteProject(id: string): Promise<void>;

  getCharacterReferencesByProject(projectId: string): Promise<CharacterReference[]>;
  getCharacterReference(id: string): Promise<CharacterReference | undefined>;
  createCharacterReference(ref: InsertCharacterReference): Promise<CharacterReference>;
  updateCharacterReference(id: string, data: Partial<CharacterReference>): Promise<CharacterReference>;
  deleteCharacterReferencesByProject(projectId: string): Promise<void>;

  getLocationReferencesByProject(projectId: string): Promise<LocationReference[]>;
  getLocationReference(id: string): Promise<LocationReference | undefined>;
  createLocationReference(ref: InsertLocationReference): Promise<LocationReference>;
  updateLocationReference(id: string, data: Partial<LocationReference>): Promise<LocationReference>;
  deleteLocationReferencesByProject(projectId: string): Promise<void>;

  getNiches(): Promise<Niche[]>;
  getNiche(id: string): Promise<Niche | undefined>;
  createNiche(niche: InsertNiche): Promise<Niche>;
  updateNiche(id: string, data: Partial<Niche>): Promise<Niche>;
  deleteNiche(id: string): Promise<void>;

  getNicheVideos(nicheId: string): Promise<NicheVideo[]>;
  createNicheVideos(videos: InsertNicheVideo[]): Promise<NicheVideo[]>;
  deleteNicheVideos(nicheId: string): Promise<void>;

  getSavedScripts(): Promise<SavedScript[]>;
  getSavedScript(id: string): Promise<SavedScript | undefined>;
  createSavedScript(script: InsertSavedScript): Promise<SavedScript>;
  updateSavedScript(id: string, data: Partial<SavedScript>): Promise<SavedScript>;
  deleteSavedScript(id: string): Promise<void>;

  getCustomVoices(): Promise<CustomVoice[]>;
  createCustomVoice(voice: InsertCustomVoice): Promise<CustomVoice>;
  deleteCustomVoice(id: string): Promise<void>;

  getAllApiSettings(): Promise<ApiSetting[]>;
  getApiSetting(serviceName: string): Promise<ApiSetting | undefined>;
  upsertApiSetting(serviceName: string, apiKey: string): Promise<ApiSetting>;
  deleteApiSetting(serviceName: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getProjects(): Promise<Project[]> {
    return db.select().from(projects);
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [created] = await db.insert(projects).values(project).returning();
    return created;
  }

  async updateProject(id: string, data: Partial<Project>): Promise<Project> {
    const [updated] = await db.update(projects).set(data).where(eq(projects.id, id)).returning();
    return updated;
  }

  async getScenesByProject(projectId: string): Promise<Scene[]> {
    return db.select().from(scenes).where(eq(scenes.projectId, projectId));
  }

  async getScene(id: string): Promise<Scene | undefined> {
    const [scene] = await db.select().from(scenes).where(eq(scenes.id, id));
    return scene;
  }

  async createScene(scene: InsertScene): Promise<Scene> {
    const [created] = await db.insert(scenes).values(scene).returning();
    return created;
  }

  async createScenes(sceneList: InsertScene[]): Promise<Scene[]> {
    if (sceneList.length === 0) return [];
    return db.insert(scenes).values(sceneList).returning();
  }

  async updateScene(id: string, data: Partial<Scene>): Promise<Scene> {
    const [updated] = await db.update(scenes).set(data).where(eq(scenes.id, id)).returning();
    return updated;
  }

  async deleteScenesByProject(projectId: string): Promise<void> {
    await db.delete(scenes).where(eq(scenes.projectId, projectId));
  }

  async getImagesByProject(projectId: string): Promise<GeneratedImage[]> {
    return db.select().from(generatedImages).where(eq(generatedImages.projectId, projectId));
  }

  async getImagesByScene(sceneId: string): Promise<GeneratedImage[]> {
    return db.select().from(generatedImages).where(eq(generatedImages.sceneId, sceneId));
  }

  async createImage(image: InsertImage): Promise<GeneratedImage> {
    const [created] = await db.insert(generatedImages).values(image).returning();
    return created;
  }

  async createImages(imageList: InsertImage[]): Promise<GeneratedImage[]> {
    if (imageList.length === 0) return [];
    return db.insert(generatedImages).values(imageList).returning();
  }

  async updateImage(id: string, data: Partial<GeneratedImage>): Promise<GeneratedImage> {
    const [updated] = await db.update(generatedImages).set(data).where(eq(generatedImages.id, id)).returning();
    return updated;
  }

  async deleteImagesByScene(sceneId: string): Promise<void> {
    await db.delete(generatedImages).where(eq(generatedImages.sceneId, sceneId));
  }

  async deleteImagesByProject(projectId: string): Promise<void> {
    await db.delete(generatedImages).where(eq(generatedImages.projectId, projectId));
  }

  async getImageById(id: string): Promise<GeneratedImage | undefined> {
    const [img] = await db.select().from(generatedImages).where(eq(generatedImages.id, id));
    return img;
  }

  async deleteProject(id: string): Promise<void> {
    await db.delete(generatedImages).where(eq(generatedImages.projectId, id));
    await db.delete(scenes).where(eq(scenes.projectId, id));
    await db.delete(characterReferences).where(eq(characterReferences.projectId, id));
    await db.delete(locationReferences).where(eq(locationReferences.projectId, id));
    await db.delete(projects).where(eq(projects.id, id));
  }

  async getCharacterReferencesByProject(projectId: string): Promise<CharacterReference[]> {
    return db.select().from(characterReferences).where(eq(characterReferences.projectId, projectId));
  }

  async getCharacterReference(id: string): Promise<CharacterReference | undefined> {
    const [ref] = await db.select().from(characterReferences).where(eq(characterReferences.id, id));
    return ref;
  }

  async createCharacterReference(ref: InsertCharacterReference): Promise<CharacterReference> {
    const [created] = await db.insert(characterReferences).values(ref).returning();
    return created;
  }

  async updateCharacterReference(id: string, data: Partial<CharacterReference>): Promise<CharacterReference> {
    const [updated] = await db.update(characterReferences).set(data).where(eq(characterReferences.id, id)).returning();
    return updated;
  }

  async deleteCharacterReferencesByProject(projectId: string): Promise<void> {
    await db.delete(characterReferences).where(eq(characterReferences.projectId, projectId));
  }

  async getLocationReferencesByProject(projectId: string): Promise<LocationReference[]> {
    return db.select().from(locationReferences).where(eq(locationReferences.projectId, projectId));
  }

  async getLocationReference(id: string): Promise<LocationReference | undefined> {
    const [ref] = await db.select().from(locationReferences).where(eq(locationReferences.id, id));
    return ref;
  }

  async createLocationReference(ref: InsertLocationReference): Promise<LocationReference> {
    const [created] = await db.insert(locationReferences).values(ref).returning();
    return created;
  }

  async updateLocationReference(id: string, data: Partial<LocationReference>): Promise<LocationReference> {
    const [updated] = await db.update(locationReferences).set(data).where(eq(locationReferences.id, id)).returning();
    return updated;
  }

  async deleteLocationReferencesByProject(projectId: string): Promise<void> {
    await db.delete(locationReferences).where(eq(locationReferences.projectId, projectId));
  }

  async getNiches(): Promise<Niche[]> {
    return db.select().from(niches);
  }

  async getNiche(id: string): Promise<Niche | undefined> {
    const [niche] = await db.select().from(niches).where(eq(niches.id, id));
    return niche;
  }

  async createNiche(niche: InsertNiche): Promise<Niche> {
    const [created] = await db.insert(niches).values(niche).returning();
    return created;
  }

  async updateNiche(id: string, data: Partial<Niche>): Promise<Niche> {
    const [updated] = await db.update(niches).set(data).where(eq(niches.id, id)).returning();
    return updated;
  }

  async deleteNiche(id: string): Promise<void> {
    await db.delete(nicheVideos).where(eq(nicheVideos.nicheId, id));
    await db.delete(niches).where(eq(niches.id, id));
  }

  async getNicheVideos(nicheId: string): Promise<NicheVideo[]> {
    return db.select().from(nicheVideos).where(eq(nicheVideos.nicheId, nicheId));
  }

  async createNicheVideos(videos: InsertNicheVideo[]): Promise<NicheVideo[]> {
    if (videos.length === 0) return [];
    return db.insert(nicheVideos).values(videos).returning();
  }

  async deleteNicheVideos(nicheId: string): Promise<void> {
    await db.delete(nicheVideos).where(eq(nicheVideos.nicheId, nicheId));
  }

  async getSavedScripts(): Promise<SavedScript[]> {
    return db.select().from(savedScripts).orderBy(desc(savedScripts.createdAt));
  }

  async getSavedScript(id: string): Promise<SavedScript | undefined> {
    const [script] = await db.select().from(savedScripts).where(eq(savedScripts.id, id));
    return script;
  }

  async createSavedScript(script: InsertSavedScript): Promise<SavedScript> {
    const [created] = await db.insert(savedScripts).values(script).returning();
    return created;
  }

  async updateSavedScript(id: string, data: Partial<SavedScript>): Promise<SavedScript> {
    const [updated] = await db.update(savedScripts).set(data).where(eq(savedScripts.id, id)).returning();
    return updated;
  }

  async deleteSavedScript(id: string): Promise<void> {
    await db.delete(savedScripts).where(eq(savedScripts.id, id));
  }

  async getCustomVoices(): Promise<CustomVoice[]> {
    return db.select().from(customVoices).orderBy(desc(customVoices.createdAt));
  }

  async createCustomVoice(voice: InsertCustomVoice): Promise<CustomVoice> {
    const [created] = await db.insert(customVoices).values(voice).returning();
    return created;
  }

  async deleteCustomVoice(id: string): Promise<void> {
    await db.delete(customVoices).where(eq(customVoices.id, id));
  }

  async getAllApiSettings(): Promise<ApiSetting[]> {
    return db.select().from(apiSettings);
  }

  async getApiSetting(serviceName: string): Promise<ApiSetting | undefined> {
    const [setting] = await db.select().from(apiSettings).where(eq(apiSettings.serviceName, serviceName));
    return setting;
  }

  async upsertApiSetting(serviceName: string, apiKey: string): Promise<ApiSetting> {
    const existing = await this.getApiSetting(serviceName);
    if (existing) {
      const [updated] = await db.update(apiSettings)
        .set({ apiKey, updatedAt: new Date().toISOString() })
        .where(eq(apiSettings.serviceName, serviceName))
        .returning();
      return updated;
    }
    const [created] = await db.insert(apiSettings)
      .values({ serviceName, apiKey })
      .returning();
    return created;
  }

  async deleteApiSetting(serviceName: string): Promise<void> {
    await db.delete(apiSettings).where(eq(apiSettings.serviceName, serviceName));
  }
}

export const storage = new DatabaseStorage();

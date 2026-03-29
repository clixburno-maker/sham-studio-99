import {
  type User, type InsertUser,
  type Project, type InsertProject,
  type Scene, type InsertScene,
  type GeneratedImage, type InsertImage,
  type CharacterReference, type InsertCharacterReference,
  type CharacterFacePhoto, type InsertCharacterFacePhoto,
  type LocationReference, type InsertLocationReference,
  type Niche, type InsertNiche,
  type NicheVideo, type InsertNicheVideo,
  type SavedScript, type InsertSavedScript,
  type CustomVoice, type InsertCustomVoice,
  users, projects, scenes, generatedImages, characterReferences, characterFacePhotos, locationReferences, niches, nicheVideos, savedScripts, customVoices,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, data: Partial<Project>): Promise<Project>;
  addProjectCost(id: string, costType: "analysisCost" | "imageGenerationCost" | "videoGenerationCost", amount: number): Promise<void>;

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
  deleteImage(id: string): Promise<void>;
  deleteImagesByScene(sceneId: string): Promise<void>;
  deleteImagesByProject(projectId: string): Promise<void>;
  deleteProject(id: string): Promise<void>;

  getCharacterReferencesByProject(projectId: string): Promise<CharacterReference[]>;
  getCharacterReference(id: string): Promise<CharacterReference | undefined>;
  createCharacterReference(ref: InsertCharacterReference): Promise<CharacterReference>;
  updateCharacterReference(id: string, data: Partial<CharacterReference>): Promise<CharacterReference>;
  deleteCharacterReferencesByProject(projectId: string): Promise<void>;

  getLocationReferencesByProject(projectId: string): Promise<LocationReference[]>;
  createLocationReference(ref: InsertLocationReference): Promise<LocationReference>;
  updateLocationReference(id: string, data: Partial<LocationReference>): Promise<LocationReference>;
  deleteLocationReferencesByProject(projectId: string): Promise<void>;

  getFacePhotosByProject(projectId: string): Promise<CharacterFacePhoto[]>;
  getFacePhoto(id: string): Promise<CharacterFacePhoto | undefined>;
  getFacePhotoByCharacter(projectId: string, characterName: string): Promise<CharacterFacePhoto | undefined>;
  createFacePhoto(photo: InsertCharacterFacePhoto): Promise<CharacterFacePhoto>;
  updateFacePhoto(id: string, data: Partial<CharacterFacePhoto>): Promise<CharacterFacePhoto>;
  deleteFacePhoto(id: string): Promise<void>;
  deleteFacePhotosByProject(projectId: string): Promise<void>;

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
}

class MemoryStorage implements IStorage {
  private users = new Map<string, User>();
  private projectsMap = new Map<string, Project>();
  private scenesMap = new Map<string, Scene>();
  private imagesMap = new Map<string, GeneratedImage>();
  private charRefsMap = new Map<string, CharacterReference>();
  private locationRefsMap = new Map<string, LocationReference>();
  private facePhotosMap = new Map<string, CharacterFacePhoto>();
  private nichesMap = new Map<string, Niche>();
  private nicheVideosMap = new Map<string, NicheVideo>();
  private savedScriptsMap = new Map<string, SavedScript>();
  private customVoicesMap = new Map<string, CustomVoice>();

  async getUser(id: string) { return this.users.get(id); }
  async getUserByUsername(username: string) {
    return [...this.users.values()].find(u => u.username === username);
  }
  async createUser(u: InsertUser): Promise<User> {
    const user: User = { id: randomUUID(), username: u.username, password: u.password };
    this.users.set(user.id, user);
    return user;
  }

  async getProjects() { return [...this.projectsMap.values()]; }
  async getProject(id: string) { return this.projectsMap.get(id); }
  async createProject(p: InsertProject): Promise<Project> {
    const proj: Project = {
      id: randomUUID(), title: p.title, script: p.script,
      status: p.status ?? "draft", analysis: null, analysisProgress: null,
      voiceoverUrl: p.voiceoverUrl ?? null,
      analysisCost: 0, imageGenerationCost: 0, videoGenerationCost: 0,
    };
    this.projectsMap.set(proj.id, proj);
    return proj;
  }
  async updateProject(id: string, data: Partial<Project>): Promise<Project> {
    const p = this.projectsMap.get(id);
    if (!p) throw new Error("Project not found");
    const updated = { ...p, ...data };
    this.projectsMap.set(id, updated);
    return updated;
  }
  async addProjectCost(id: string, costType: "analysisCost" | "imageGenerationCost" | "videoGenerationCost", amount: number) {
    const p = this.projectsMap.get(id);
    if (!p) return;
    (p as any)[costType] = ((p as any)[costType] || 0) + amount;
    this.projectsMap.set(id, p);
  }

  async getScenesByProject(projectId: string) {
    return [...this.scenesMap.values()].filter(s => s.projectId === projectId);
  }
  async getScene(id: string) { return this.scenesMap.get(id); }
  async createScene(s: InsertScene): Promise<Scene> {
    const scene: Scene = {
      id: randomUUID(), projectId: s.projectId, sentenceIndex: s.sentenceIndex,
      sentence: s.sentence, context: s.context ?? null,
      sceneDescription: s.sceneDescription ?? null, promptBase: s.promptBase ?? null,
      shotLabels: s.shotLabels ?? null, expectedImages: s.expectedImages ?? 4,
      characters: s.characters ?? null, objects: s.objects ?? null,
      location: s.location ?? null, timeOfDay: s.timeOfDay ?? null,
      mood: s.mood ?? null, cameraAngle: s.cameraAngle ?? null,
    };
    this.scenesMap.set(scene.id, scene);
    return scene;
  }
  async createScenes(list: InsertScene[]): Promise<Scene[]> {
    const results: Scene[] = [];
    for (const s of list) results.push(await this.createScene(s));
    return results;
  }
  async updateScene(id: string, data: Partial<Scene>): Promise<Scene> {
    const s = this.scenesMap.get(id);
    if (!s) throw new Error("Scene not found");
    const updated = { ...s, ...data };
    this.scenesMap.set(id, updated);
    return updated;
  }
  async deleteScenesByProject(projectId: string) {
    for (const [k, v] of this.scenesMap) if (v.projectId === projectId) this.scenesMap.delete(k);
  }

  async getImagesByProject(projectId: string) {
    return [...this.imagesMap.values()].filter(i => i.projectId === projectId);
  }
  async getImagesByScene(sceneId: string) {
    return [...this.imagesMap.values()].filter(i => i.sceneId === sceneId);
  }
  async getImageById(id: string) { return this.imagesMap.get(id); }
  async createImage(img: InsertImage): Promise<GeneratedImage> {
    const image: GeneratedImage = {
      id: randomUUID(), sceneId: img.sceneId, projectId: img.projectId,
      variant: img.variant, prompt: img.prompt,
      imageUrl: img.imageUrl ?? null, status: img.status ?? "pending",
      taskId: img.taskId ?? null, videoUrl: img.videoUrl ?? null,
      videoTaskId: img.videoTaskId ?? null, videoStatus: img.videoStatus ?? null,
      videoPrompt: img.videoPrompt ?? null, videoPromptSent: img.videoPromptSent ?? null,
      videoModel: img.videoModel ?? null, videoError: img.videoError ?? null,
      error: img.error ?? null,
    };
    this.imagesMap.set(image.id, image);
    return image;
  }
  async createImages(list: InsertImage[]): Promise<GeneratedImage[]> {
    const results: GeneratedImage[] = [];
    for (const i of list) results.push(await this.createImage(i));
    return results;
  }
  async updateImage(id: string, data: Partial<GeneratedImage>): Promise<GeneratedImage> {
    const img = this.imagesMap.get(id);
    if (!img) throw new Error("Image not found");
    const updated = { ...img, ...data };
    this.imagesMap.set(id, updated);
    return updated;
  }
  async deleteImage(id: string) { this.imagesMap.delete(id); }
  async deleteImagesByScene(sceneId: string) {
    for (const [k, v] of this.imagesMap) if (v.sceneId === sceneId) this.imagesMap.delete(k);
  }
  async deleteImagesByProject(projectId: string) {
    for (const [k, v] of this.imagesMap) if (v.projectId === projectId) this.imagesMap.delete(k);
  }
  async deleteProject(id: string) {
    await this.deleteImagesByProject(id);
    await this.deleteScenesByProject(id);
    await this.deleteCharacterReferencesByProject(id);
    await this.deleteLocationReferencesByProject(id);
    await this.deleteFacePhotosByProject(id);
    this.projectsMap.delete(id);
  }

  async getCharacterReferencesByProject(projectId: string) {
    return [...this.charRefsMap.values()].filter(r => r.projectId === projectId);
  }
  async getCharacterReference(id: string) { return this.charRefsMap.get(id); }
  async createCharacterReference(ref: InsertCharacterReference): Promise<CharacterReference> {
    const cr: CharacterReference = {
      id: randomUUID(), projectId: ref.projectId,
      characterName: ref.characterName, description: ref.description,
      prompt: ref.prompt, imageUrl: ref.imageUrl ?? null,
      status: ref.status ?? "pending", taskId: ref.taskId ?? null,
      angle: ref.angle ?? "front",
    };
    this.charRefsMap.set(cr.id, cr);
    return cr;
  }
  async updateCharacterReference(id: string, data: Partial<CharacterReference>): Promise<CharacterReference> {
    const r = this.charRefsMap.get(id);
    if (!r) throw new Error("CharacterReference not found");
    const updated = { ...r, ...data };
    this.charRefsMap.set(id, updated);
    return updated;
  }
  async deleteCharacterReferencesByProject(projectId: string) {
    for (const [k, v] of this.charRefsMap) if (v.projectId === projectId) this.charRefsMap.delete(k);
  }

  async getLocationReferencesByProject(projectId: string) {
    return [...this.locationRefsMap.values()].filter(r => r.projectId === projectId);
  }
  async createLocationReference(ref: InsertLocationReference): Promise<LocationReference> {
    const id = randomUUID();
    const record: LocationReference = { id, ...ref, imageUrl: ref.imageUrl ?? null, status: ref.status ?? "pending", taskId: ref.taskId ?? null };
    this.locationRefsMap.set(id, record);
    return record;
  }
  async updateLocationReference(id: string, data: Partial<LocationReference>): Promise<LocationReference> {
    const ref = this.locationRefsMap.get(id);
    if (!ref) throw new Error("Location reference not found");
    const updated = { ...ref, ...data };
    this.locationRefsMap.set(id, updated);
    return updated;
  }
  async deleteLocationReferencesByProject(projectId: string) {
    for (const [k, v] of this.locationRefsMap) if (v.projectId === projectId) this.locationRefsMap.delete(k);
  }

  async getFacePhotosByProject(projectId: string) {
    return [...this.facePhotosMap.values()].filter(p => p.projectId === projectId);
  }
  async getFacePhoto(id: string) { return this.facePhotosMap.get(id); }
  async getFacePhotoByCharacter(projectId: string, characterName: string) {
    return [...this.facePhotosMap.values()].find(
      p => p.projectId === projectId && p.characterName.toLowerCase() === characterName.toLowerCase()
    );
  }
  async createFacePhoto(photo: InsertCharacterFacePhoto): Promise<CharacterFacePhoto> {
    const fp: CharacterFacePhoto = {
      id: randomUUID(),
      projectId: photo.projectId,
      characterName: photo.characterName,
      originalPhotoUrl: photo.originalPhotoUrl,
      stylizedPhotoUrl: photo.stylizedPhotoUrl ?? null,
      stylizedTaskId: photo.stylizedTaskId ?? null,
      status: photo.status ?? "uploaded",
      originalFilename: photo.originalFilename ?? null,
      createdAt: new Date().toISOString(),
    };
    this.facePhotosMap.set(fp.id, fp);
    return fp;
  }
  async updateFacePhoto(id: string, data: Partial<CharacterFacePhoto>): Promise<CharacterFacePhoto> {
    const fp = this.facePhotosMap.get(id);
    if (!fp) throw new Error("FacePhoto not found");
    const updated = { ...fp, ...data };
    this.facePhotosMap.set(id, updated);
    return updated;
  }
  async deleteFacePhoto(id: string) { this.facePhotosMap.delete(id); }
  async deleteFacePhotosByProject(projectId: string) {
    for (const [k, v] of this.facePhotosMap) if (v.projectId === projectId) this.facePhotosMap.delete(k);
  }

  async getNiches() { return [...this.nichesMap.values()]; }
  async getNiche(id: string) { return this.nichesMap.get(id); }
  async createNiche(n: InsertNiche): Promise<Niche> {
    const niche: Niche = {
      id: randomUUID(), name: n.name, channelUrl: n.channelUrl ?? null,
      channelName: n.channelName ?? null, status: n.status ?? "pending",
      styleProfile: null, videoCount: n.videoCount ?? 0,
      sampleTranscripts: (n as any).sampleTranscripts ?? null, createdAt: new Date().toISOString(),
    };
    this.nichesMap.set(niche.id, niche);
    return niche;
  }
  async updateNiche(id: string, data: Partial<Niche>): Promise<Niche> {
    const n = this.nichesMap.get(id);
    if (!n) throw new Error("Niche not found");
    const updated = { ...n, ...data };
    this.nichesMap.set(id, updated);
    return updated;
  }
  async deleteNiche(id: string) {
    await this.deleteNicheVideos(id);
    this.nichesMap.delete(id);
  }

  async getNicheVideos(nicheId: string) {
    return [...this.nicheVideosMap.values()].filter(v => v.nicheId === nicheId);
  }
  async createNicheVideos(videos: InsertNicheVideo[]): Promise<NicheVideo[]> {
    const results: NicheVideo[] = [];
    for (const v of videos) {
      const nv: NicheVideo = {
        id: randomUUID(), nicheId: v.nicheId, videoId: v.videoId,
        title: v.title, transcript: v.transcript,
        wordCount: v.wordCount ?? 0, createdAt: new Date().toISOString(),
      };
      this.nicheVideosMap.set(nv.id, nv);
      results.push(nv);
    }
    return results;
  }
  async deleteNicheVideos(nicheId: string) {
    for (const [k, v] of this.nicheVideosMap) if (v.nicheId === nicheId) this.nicheVideosMap.delete(k);
  }

  async getSavedScripts() {
    return [...this.savedScriptsMap.values()].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }
  async getSavedScript(id: string) { return this.savedScriptsMap.get(id); }
  async createSavedScript(s: InsertSavedScript): Promise<SavedScript> {
    const ss: SavedScript = {
      id: randomUUID(), topic: s.topic, script: s.script,
      wordCount: s.wordCount ?? 0, durationMinutes: s.durationMinutes ?? null,
      nicheId: s.nicheId ?? null, nicheName: s.nicheName ?? null,
      voiceoverUrl: s.voiceoverUrl ?? null, voiceId: s.voiceId ?? null,
      voiceName: s.voiceName ?? null, projectId: s.projectId ?? null,
      createdAt: new Date().toISOString(),
    };
    this.savedScriptsMap.set(ss.id, ss);
    return ss;
  }
  async updateSavedScript(id: string, data: Partial<SavedScript>): Promise<SavedScript> {
    const s = this.savedScriptsMap.get(id);
    if (!s) throw new Error("SavedScript not found");
    const updated = { ...s, ...data };
    this.savedScriptsMap.set(id, updated);
    return updated;
  }
  async deleteSavedScript(id: string) { this.savedScriptsMap.delete(id); }

  async getCustomVoices() {
    return [...this.customVoicesMap.values()].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }
  async createCustomVoice(v: InsertCustomVoice): Promise<CustomVoice> {
    const cv: CustomVoice = {
      id: randomUUID(), name: v.name, voiceId: v.voiceId,
      description: v.description ?? null, createdAt: new Date().toISOString(),
    };
    this.customVoicesMap.set(cv.id, cv);
    return cv;
  }
  async deleteCustomVoice(id: string) { this.customVoicesMap.delete(id); }
}

console.log("[storage] Using in-memory storage (no DATABASE_URL)");
export const storage: IStorage = new MemoryStorage();

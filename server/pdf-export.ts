import PDFDocument from "pdfkit";
import sharp from "sharp";
import type { Response } from "express";
import type { Project, Scene, GeneratedImage } from "@shared/schema";
import https from "https";
import http from "http";

interface ExportOptions {
  includeImages: boolean;
  includeClips: boolean;
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    const request = protocol.get(url, { timeout: 30000 }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          fetchImageBuffer(redirectUrl).then(resolve).catch(reject);
          return;
        }
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.on("timeout", () => {
      request.destroy();
      reject(new Error("timeout"));
    });
  });
}

const PDF_IMAGE_MAX_WIDTH = 1200;
const PDF_JPEG_QUALITY = 85;

async function optimizeForPdf(buffer: Buffer): Promise<Buffer> {
  try {
    const metadata = await sharp(buffer).metadata();
    let pipeline = sharp(buffer);
    if (metadata.width && metadata.width > PDF_IMAGE_MAX_WIDTH) {
      pipeline = pipeline.resize({ width: PDF_IMAGE_MAX_WIDTH, withoutEnlargement: true });
    }
    return await pipeline.jpeg({ quality: PDF_JPEG_QUALITY, mozjpeg: true }).toBuffer();
  } catch {
    return buffer;
  }
}

async function prefetchImages(images: GeneratedImage[]): Promise<Map<string, Buffer>> {
  const cache = new Map<string, Buffer>();
  const toFetch = images.filter(img => img.status === "completed" && img.imageUrl);
  const batchSize = 50;

  for (let i = 0; i < toFetch.length; i += batchSize) {
    const batch = toFetch.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (img) => {
        const raw = await fetchImageBuffer(img.imageUrl!);
        const optimized = await optimizeForPdf(raw);
        return { id: img.id, buffer: optimized };
      })
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        cache.set(result.value.id, result.value.buffer);
      }
    }
    const done = Math.min(i + batchSize, toFetch.length);
    console.log(`  Prefetched images ${done}/${toFetch.length}`);
  }
  return cache;
}

export async function streamExportPDF(
  res: Response,
  project: Project,
  scenes: Scene[],
  images: GeneratedImage[],
  options: ExportOptions,
): Promise<void> {
  const startTime = Date.now();
  console.log(`PDF export: prefetching images (batch size 50)...`);
  const imageCache = options.includeImages
    ? await prefetchImages(images)
    : new Map<string, Buffer>();
  console.log(`PDF export: prefetched ${imageCache.size} images in ${((Date.now() - startTime) / 1000).toFixed(1)}s, building PDF...`);

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
    autoFirstPage: true,
    compress: true,
    info: {
      Title: `${project.title || "ScriptVision"} - Storyboard`,
      Author: "ScriptVision",
    },
  });

  const filename = `${(project.title || "export").replace(/[^a-zA-Z0-9]/g, "_")}_storyboard.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Transfer-Encoding", "chunked");

  doc.pipe(res);

  const pageW = doc.page.width - 80;
  const sortedScenes = [...scenes].sort((a, b) => a.sentenceIndex - b.sentenceIndex);

  doc.fontSize(26).font("Helvetica-Bold").fillColor("#ffffff");
  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#111827");
  doc.fillColor("#ffffff");
  doc.text(project.title || "Untitled Project", 40, 220, { align: "center", width: pageW });
  doc.moveDown(0.8);
  doc.fontSize(13).font("Helvetica").fillColor("#9ca3af");
  doc.text("Visual Storyboard", { align: "center", width: pageW });
  doc.moveDown(0.4);
  doc.fontSize(10).fillColor("#6b7280");
  doc.text(`${sortedScenes.length} scenes  •  ${images.filter(i => i.status === "completed").length} images`, { align: "center", width: pageW });
  doc.moveDown(0.3);
  doc.text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), { align: "center", width: pageW });

  const imgW = pageW;
  const imgH = imgW * (9 / 16);
  const halfW = (pageW - 10) / 2;
  const halfH = halfW * (9 / 16);

  for (let sceneIdx = 0; sceneIdx < sortedScenes.length; sceneIdx++) {
    const scene = sortedScenes[sceneIdx];
    const sceneImages = images
      .filter(img => img.sceneId === scene.id && img.status === "completed" && img.imageUrl)
      .sort((a, b) => a.variant - b.variant);

    if (sceneImages.length === 0) continue;

    let shotLabels: string[] = [];
    try {
      shotLabels = scene.shotLabels ? JSON.parse(scene.shotLabels) : [];
    } catch {}

    doc.addPage();
    doc.rect(0, 0, doc.page.width, doc.page.height).fill("#111827");

    doc.fillColor("#6366f1").fontSize(11).font("Helvetica-Bold");
    doc.text(`SCENE ${sceneIdx + 1}`, 40, 40);

    if (scene.location || scene.timeOfDay) {
      doc.fillColor("#6b7280").fontSize(9).font("Helvetica");
      const meta = [scene.location, scene.timeOfDay].filter(Boolean).join("  •  ");
      doc.text(meta, 40);
    }

    doc.moveDown(0.4);
    doc.fillColor("#d1d5db").fontSize(10).font("Helvetica");
    doc.text(`"${scene.sentence}"`, 40, undefined, { width: pageW });

    doc.moveDown(0.6);
    doc.moveTo(40, doc.y).lineTo(pageW + 40, doc.y).strokeColor("#374151").stroke();
    doc.moveDown(0.5);

    if (sceneImages.length === 1) {
      const img = sceneImages[0];
      const cachedBuffer = imageCache.get(img.id);
      if (cachedBuffer) {
        try {
          const fitW = Math.min(imgW, 480);
          const fitH = fitW * (9 / 16);
          if (doc.y + fitH + 30 > doc.page.height - 40) doc.addPage().rect(0, 0, doc.page.width, doc.page.height).fill("#111827");
          doc.image(cachedBuffer, 40 + (pageW - fitW) / 2, doc.y, { width: fitW, height: fitH, fit: [fitW, fitH], align: "center" });
          doc.y += fitH + 4;
          const label = shotLabels[img.variant] || `Shot ${img.variant + 1}`;
          doc.fillColor("#9ca3af").fontSize(8).font("Helvetica");
          doc.text(label, 40, doc.y, { align: "center", width: pageW });
        } catch {}
      }
    } else {
      for (let i = 0; i < sceneImages.length; i += 2) {
        if (doc.y + halfH + 30 > doc.page.height - 40) {
          doc.addPage().rect(0, 0, doc.page.width, doc.page.height).fill("#111827");
        }

        const rowY = doc.y;

        const imgA = sceneImages[i];
        const bufA = imageCache.get(imgA.id);
        if (bufA) {
          try {
            doc.image(bufA, 40, rowY, { width: halfW, height: halfH, fit: [halfW, halfH] });
          } catch {}
        }
        const labelA = shotLabels[imgA.variant] || `Shot ${imgA.variant + 1}`;
        doc.fillColor("#9ca3af").fontSize(8).font("Helvetica");
        doc.text(labelA, 40, rowY + halfH + 2, { width: halfW, align: "center" });

        if (i + 1 < sceneImages.length) {
          const imgB = sceneImages[i + 1];
          const bufB = imageCache.get(imgB.id);
          if (bufB) {
            try {
              doc.image(bufB, 40 + halfW + 10, rowY, { width: halfW, height: halfH, fit: [halfW, halfH] });
            } catch {}
          }
          const labelB = shotLabels[imgB.variant] || `Shot ${imgB.variant + 1}`;
          doc.fillColor("#9ca3af").fontSize(8).font("Helvetica");
          doc.text(labelB, 40 + halfW + 10, rowY + halfH + 2, { width: halfW, align: "center" });
        }

        doc.y = rowY + halfH + 18;
      }
    }
  }

  doc.end();
  console.log(`PDF export: completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
}

interface CharacterRef {
  id: string;
  characterName: string;
  angle: string;
  imageUrl: string | null;
  status: string;
}

interface StoryBibleExportData {
  analysis: {
    title?: string;
    genre?: string;
    setting?: string;
    timePeriod?: string;
    characters?: Array<{
      name: string;
      role?: string;
      description?: string;
      appearance?: string;
      signatureFeatures?: string;
      emotionalArc?: string;
      relationships?: Array<{ with: string; nature: string; evolution?: string }>;
    }>;
    jets?: Array<{ name: string; type?: string; description?: string; visualDetails?: string; signatureFeatures?: string }>;
    vehicles?: Array<{ name: string; type?: string; description?: string; visualDetails?: string; signatureFeatures?: string }>;
    keyObjects?: Array<{ name: string; type?: string; description?: string; visualDetails?: string; signatureFeatures?: string }>;
    locations?: Array<{ name: string; description?: string; visualDetails?: string; signatureFeatures?: string }>;
    visualStyle?: {
      baseStyle?: string;
      lighting?: string;
      colorPalette?: string;
      atmosphere?: string;
      weatherProgression?: string;
    };
  };
}

const BG = "#111827";
const ACCENT = "#6366f1";
const WHITE = "#ffffff";
const GRAY = "#9ca3af";
const DIM = "#6b7280";
const RULE = "#374151";
const SECTION_BG = "#1a2236";

function drawPageBg(doc: PDFKit.PDFDocument) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(BG);
}

function sectionHeader(doc: PDFKit.PDFDocument, title: string, pageW: number) {
  if (doc.y + 60 > doc.page.height - 50) {
    doc.addPage();
    drawPageBg(doc);
  }
  doc.moveDown(0.3);
  const headerY = doc.y;
  doc.rect(40, headerY, pageW, 28).fill(SECTION_BG);
  doc.fillColor(ACCENT).fontSize(14).font("Helvetica-Bold");
  doc.text(title.toUpperCase(), 52, headerY + 7, { width: pageW - 24 });
  doc.y = headerY + 36;
}

function subHeader(doc: PDFKit.PDFDocument, title: string, subtitle: string | undefined, pageW: number) {
  if (doc.y + 40 > doc.page.height - 50) {
    doc.addPage();
    drawPageBg(doc);
  }
  doc.fillColor(WHITE).fontSize(12).font("Helvetica-Bold");
  doc.text(title, 52, doc.y, { width: pageW - 24 });
  if (subtitle) {
    doc.fillColor(DIM).fontSize(9).font("Helvetica");
    doc.text(subtitle, 52, undefined, { width: pageW - 24 });
  }
  doc.moveDown(0.2);
}

function bodyText(doc: PDFKit.PDFDocument, label: string, text: string | undefined, pageW: number) {
  if (!text) return;
  if (doc.y + 30 > doc.page.height - 50) {
    doc.addPage();
    drawPageBg(doc);
  }
  doc.fillColor(GRAY).fontSize(8).font("Helvetica-Bold");
  doc.text(label, 52, undefined, { width: pageW - 24 });
  doc.fillColor("#d1d5db").fontSize(9).font("Helvetica");
  doc.text(text, 52, undefined, { width: pageW - 24 });
  doc.moveDown(0.3);
}

function divider(doc: PDFKit.PDFDocument, pageW: number) {
  doc.moveDown(0.3);
  doc.moveTo(52, doc.y).lineTo(pageW + 28, doc.y).strokeColor(RULE).lineWidth(0.5).stroke();
  doc.moveDown(0.4);
}

async function prefetchUrls(urls: string[]): Promise<Map<string, Buffer>> {
  const cache = new Map<string, Buffer>();
  const batchSize = 20;
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (url) => {
        const raw = await fetchImageBuffer(url);
        const optimized = await optimizeForPdf(raw);
        return { url, buffer: optimized };
      })
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        cache.set(result.value.url, result.value.buffer);
      }
    }
  }
  return cache;
}

export async function streamStoryBiblePDF(
  res: Response,
  project: Project,
  storyBibleData: StoryBibleExportData,
  characterRefs: CharacterRef[],
  scenes: Scene[],
  images: GeneratedImage[],
): Promise<void> {
  const startTime = Date.now();
  const analysis = storyBibleData.analysis;

  const imageUrls: string[] = [];
  for (const ref of characterRefs) {
    if (ref.imageUrl && ref.status === "completed") imageUrls.push(ref.imageUrl);
  }
  for (const img of images) {
    if (img.imageUrl && img.status === "completed") imageUrls.push(img.imageUrl);
  }

  console.log(`[Story Bible PDF] Prefetching ${imageUrls.length} images...`);
  const imgCache = await prefetchUrls(imageUrls);
  console.log(`[Story Bible PDF] Prefetched ${imgCache.size}/${imageUrls.length} images in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
    autoFirstPage: true,
    compress: true,
    info: {
      Title: `${project.title || "Project"} - Story Bible`,
      Author: "ScriptVision",
    },
  });

  const filename = `${(project.title || "StoryBible").replace(/[^a-zA-Z0-9]/g, "_")}_Story_Bible.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Transfer-Encoding", "chunked");
  doc.pipe(res);

  const pageW = doc.page.width - 80;

  drawPageBg(doc);
  doc.fontSize(30).font("Helvetica-Bold").fillColor(WHITE);
  doc.text(project.title || "Untitled Project", 40, 180, { align: "center", width: pageW });
  doc.moveDown(0.6);
  doc.fontSize(16).fillColor(ACCENT).font("Helvetica-Bold");
  doc.text("STORY BIBLE", { align: "center", width: pageW });
  doc.moveDown(1.2);
  doc.fontSize(10).font("Helvetica").fillColor(GRAY);
  if (analysis.genre) doc.text(`Genre: ${analysis.genre}`, { align: "center", width: pageW });
  if (analysis.timePeriod) doc.text(`Time Period: ${analysis.timePeriod}`, { align: "center", width: pageW });
  if (analysis.setting) doc.text(`Setting: ${analysis.setting}`, { align: "center", width: pageW });
  doc.moveDown(0.5);
  const stats: string[] = [];
  if (analysis.characters?.length) stats.push(`${analysis.characters.length} characters`);
  if (analysis.locations?.length) stats.push(`${analysis.locations.length} locations`);
  if (analysis.jets?.length) stats.push(`${analysis.jets.length} aircraft`);
  if (analysis.vehicles?.length) stats.push(`${analysis.vehicles.length} vehicles`);
  if (analysis.keyObjects?.length) stats.push(`${analysis.keyObjects.length} key objects`);
  stats.push(`${scenes.length} scenes`);
  doc.fillColor(DIM).text(stats.join("  •  "), { align: "center", width: pageW });
  doc.moveDown(0.3);
  doc.text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), { align: "center", width: pageW });

  if (analysis.characters && analysis.characters.length > 0) {
    doc.addPage();
    drawPageBg(doc);
    sectionHeader(doc, "Characters", pageW);

    for (const char of analysis.characters) {
      if (doc.y + 80 > doc.page.height - 50) {
        doc.addPage();
        drawPageBg(doc);
      }

      subHeader(doc, char.name, char.role, pageW);

      const charPortraits = characterRefs.filter(
        (r) => r.characterName === char.name && r.status === "completed" && r.imageUrl
      );

      if (charPortraits.length > 0) {
        const angleOrder = ["front", "three-quarter", "closeup"];
        const sorted = [...charPortraits].sort(
          (a, b) => angleOrder.indexOf(a.angle) - angleOrder.indexOf(b.angle)
        );
        const cols = Math.min(sorted.length, 3);
        const portraitW = Math.min(120, (pageW - 30) / cols);
        const portraitH = portraitW * (16 / 9);
        if (doc.y + portraitH + 20 > doc.page.height - 50) {
          doc.addPage();
          drawPageBg(doc);
        }
        const startX = 52;
        const startY = doc.y;
        for (let pi = 0; pi < sorted.length; pi++) {
          const portrait = sorted[pi];
          const buf = imgCache.get(portrait.imageUrl!);
          if (buf) {
            try {
              const px = startX + pi * (portraitW + 6);
              doc.image(buf, px, startY, {
                width: portraitW,
                height: portraitH,
                fit: [portraitW, portraitH],
              });
              doc.fillColor(DIM).fontSize(7).font("Helvetica");
              const label = portrait.angle === "closeup" ? "Close-Up" : portrait.angle;
              doc.text(label, px, startY + portraitH + 2, {
                width: portraitW,
                align: "center",
              });
            } catch {}
          }
        }
        doc.y = startY + portraitH + 16;
      }

      bodyText(doc, "APPEARANCE", char.appearance, pageW);
      bodyText(doc, "DESCRIPTION", char.description, pageW);
      bodyText(doc, "SIGNATURE FEATURES", char.signatureFeatures, pageW);
      bodyText(doc, "EMOTIONAL ARC", char.emotionalArc, pageW);

      if (char.relationships && char.relationships.length > 0) {
        if (doc.y + 20 > doc.page.height - 50) {
          doc.addPage();
          drawPageBg(doc);
        }
        doc.fillColor(GRAY).fontSize(8).font("Helvetica-Bold");
        doc.text("RELATIONSHIPS", 52, undefined, { width: pageW - 24 });
        for (const rel of char.relationships) {
          doc.fillColor("#d1d5db").fontSize(9).font("Helvetica");
          doc.text(`→ ${rel.with}: ${rel.nature}${rel.evolution ? ` — ${rel.evolution}` : ""}`, 60, undefined, { width: pageW - 32 });
        }
        doc.moveDown(0.3);
      }

      divider(doc, pageW);
    }
  }

  const entitySections: Array<{
    title: string;
    items: Array<{ name: string; type?: string; description?: string; visualDetails?: string; signatureFeatures?: string }> | undefined;
  }> = [
    { title: "Aircraft", items: analysis.jets },
    { title: "Vehicles", items: analysis.vehicles },
    { title: "Key Objects", items: analysis.keyObjects },
  ];

  for (const section of entitySections) {
    if (!section.items || section.items.length === 0) continue;
    doc.addPage();
    drawPageBg(doc);
    sectionHeader(doc, section.title, pageW);

    for (const item of section.items) {
      subHeader(doc, item.name, item.type, pageW);
      bodyText(doc, "DESCRIPTION", item.description, pageW);
      bodyText(doc, "VISUAL DETAILS", item.visualDetails, pageW);
      bodyText(doc, "SIGNATURE FEATURES", item.signatureFeatures, pageW);
      divider(doc, pageW);
    }
  }

  if (analysis.locations && analysis.locations.length > 0) {
    doc.addPage();
    drawPageBg(doc);
    sectionHeader(doc, "Locations", pageW);

    for (const loc of analysis.locations) {
      subHeader(doc, loc.name, undefined, pageW);
      bodyText(doc, "DESCRIPTION", loc.description, pageW);
      bodyText(doc, "VISUAL DETAILS", loc.visualDetails, pageW);
      bodyText(doc, "SIGNATURE FEATURES", loc.signatureFeatures, pageW);
      divider(doc, pageW);
    }
  }

  if (analysis.visualStyle) {
    doc.addPage();
    drawPageBg(doc);
    sectionHeader(doc, "Visual Style Guide", pageW);
    const vs = analysis.visualStyle;
    bodyText(doc, "BASE STYLE", vs.baseStyle, pageW);
    bodyText(doc, "LIGHTING", vs.lighting, pageW);
    bodyText(doc, "COLOR PALETTE", vs.colorPalette, pageW);
    bodyText(doc, "ATMOSPHERE", vs.atmosphere, pageW);
    bodyText(doc, "WEATHER PROGRESSION", vs.weatherProgression, pageW);
  }

  const sortedScenes = [...scenes].sort((a, b) => a.sentenceIndex - b.sentenceIndex);
  if (sortedScenes.length > 0) {
    doc.addPage();
    drawPageBg(doc);
    sectionHeader(doc, "Scenes", pageW);

    const imgW = pageW - 24;
    const imgH = imgW * (9 / 16);
    const halfW = (imgW - 10) / 2;
    const halfH = halfW * (9 / 16);

    for (let si = 0; si < sortedScenes.length; si++) {
      const scene = sortedScenes[si];

      if (doc.y + 60 > doc.page.height - 50) {
        doc.addPage();
        drawPageBg(doc);
      }

      doc.fillColor(ACCENT).fontSize(11).font("Helvetica-Bold");
      doc.text(`SCENE ${si + 1}`, 52);
      const meta = [scene.location, scene.timeOfDay].filter(Boolean).join("  •  ");
      if (meta) {
        doc.fillColor(DIM).fontSize(8).font("Helvetica");
        doc.text(meta, 52, undefined, { width: pageW - 24 });
      }
      doc.moveDown(0.2);
      doc.fillColor("#d1d5db").fontSize(9).font("Helvetica");
      doc.text(`"${scene.sentence}"`, 52, undefined, { width: pageW - 24 });

      if (scene.sceneDescription) {
        doc.moveDown(0.2);
        doc.fillColor(GRAY).fontSize(8).font("Helvetica");
        doc.text(scene.sceneDescription, 52, undefined, { width: pageW - 24 });
      }

      const sceneImages = images
        .filter((img) => img.sceneId === scene.id && img.status === "completed" && img.imageUrl)
        .sort((a, b) => a.variant - b.variant);

      if (sceneImages.length > 0) {
        doc.moveDown(0.4);

        let shotLabels: string[] = [];
        try {
          shotLabels = scene.shotLabels ? JSON.parse(scene.shotLabels) : [];
        } catch {}

        if (sceneImages.length === 1) {
          const img = sceneImages[0];
          const buf = imgCache.get(img.imageUrl!);
          if (buf) {
            const fitW = Math.min(imgW, 420);
            const fitH = fitW * (9 / 16);
            if (doc.y + fitH + 20 > doc.page.height - 50) {
              doc.addPage();
              drawPageBg(doc);
            }
            try {
              doc.image(buf, 52 + (imgW - fitW) / 2, doc.y, {
                width: fitW,
                height: fitH,
                fit: [fitW, fitH],
                align: "center",
              });
              doc.y += fitH + 4;
              const label = shotLabels[img.variant] || `Shot ${img.variant + 1}`;
              doc.fillColor(DIM).fontSize(7).font("Helvetica");
              doc.text(label, 52, doc.y, { align: "center", width: imgW });
            } catch {}
          }
        } else {
          for (let i = 0; i < sceneImages.length; i += 2) {
            if (doc.y + halfH + 20 > doc.page.height - 50) {
              doc.addPage();
              drawPageBg(doc);
            }
            const rowY = doc.y;

            const imgA = sceneImages[i];
            const bufA = imgCache.get(imgA.imageUrl!);
            if (bufA) {
              try {
                doc.image(bufA, 52, rowY, { width: halfW, height: halfH, fit: [halfW, halfH] });
              } catch {}
            }
            const labelA = shotLabels[imgA.variant] || `Shot ${imgA.variant + 1}`;
            doc.fillColor(DIM).fontSize(7).font("Helvetica");
            doc.text(labelA, 52, rowY + halfH + 2, { width: halfW, align: "center" });

            if (i + 1 < sceneImages.length) {
              const imgB = sceneImages[i + 1];
              const bufB = imgCache.get(imgB.imageUrl!);
              if (bufB) {
                try {
                  doc.image(bufB, 52 + halfW + 10, rowY, { width: halfW, height: halfH, fit: [halfW, halfH] });
                } catch {}
              }
              const labelB = shotLabels[imgB.variant] || `Shot ${imgB.variant + 1}`;
              doc.fillColor(DIM).fontSize(7).font("Helvetica");
              doc.text(labelB, 52 + halfW + 10, rowY + halfH + 2, { width: halfW, align: "center" });
            }

            doc.y = rowY + halfH + 16;
          }
        }
      }

      divider(doc, pageW);
    }
  }

  doc.end();
  console.log(`[Story Bible PDF] Completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s, ${imgCache.size} images embedded`);
}

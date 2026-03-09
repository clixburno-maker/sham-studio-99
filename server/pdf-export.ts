import PDFDocument from "pdfkit";
import type { Response } from "express";
import type { Project, Scene, GeneratedImage } from "@shared/schema";
import https from "https";
import http from "http";

let _sharp: any = null;
async function getSharp() {
  if (_sharp === null) {
    try {
      _sharp = (await import("sharp")).default;
    } catch {
      _sharp = false;
    }
  }
  return _sharp || null;
}

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
    const sharpFn = await getSharp();
    if (!sharpFn) return buffer;
    const metadata = await sharpFn(buffer).metadata();
    let pipeline = sharpFn(buffer);
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

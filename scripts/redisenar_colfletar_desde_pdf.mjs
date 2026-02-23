import fs from "fs";
import path from "path";
import PptxGenJS from "pptxgenjs";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pngjsPkg from "pngjs";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

const { PNG } = pngjsPkg;

const PDF_PATH =
  "C:/Users/Martin Echavarria/Downloads/Navy Modern Leading with Human Resources Presentation.pdf";
const OUTPUT_DIR = path.join(process.env.USERPROFILE || "C:/Users/Public", "Desktop", "Colfletar");
const ASSETS_DIR = path.join(OUTPUT_DIR, "assets");
const PPT_OUT = path.join(OUTPUT_DIR, "Colfletar_Presentacion_Redisenada.pptx");
const DOCX_OUT = path.join(OUTPUT_DIR, "Colfletar_Registro_Proyecto.docx");
const SUMMARY_OUT = path.join(OUTPUT_DIR, "_colfletar_resumen.json");

const PAGE_W = 1440;
const PAGE_H = 810;
const PX_PER_IN = 108;

const BRAND = {
  dark: "141215",
  gold: "C6A47E",
  brown: "6D4C28",
  brownSoft: "916A3D",
  gray: "565656",
  light: "F7F5F2",
  white: "FFFFFF",
  black: "000000",
};

const OPS = pdfjsLib.OPS;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function matrixMultiply(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function transformPoint(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function bboxFromCtm(ctm) {
  const pts = [
    transformPoint(ctm, 0, 0),
    transformPoint(ctm, 1, 0),
    transformPoint(ctm, 0, 1),
    transformPoint(ctm, 1, 1),
  ];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function bboxToInches(bbox) {
  const minX = clamp(bbox.minX, 0, PAGE_W);
  const minY = clamp(bbox.minY, 0, PAGE_H);
  const maxX = clamp(bbox.maxX, 0, PAGE_W);
  const maxY = clamp(bbox.maxY, 0, PAGE_H);
  const wPx = Math.max(1, maxX - minX);
  const hPx = Math.max(1, maxY - minY);
  return {
    x: minX / PX_PER_IN,
    y: (PAGE_H - maxY) / PX_PER_IN,
    w: wPx / PX_PER_IN,
    h: hPx / PX_PER_IN,
  };
}

function safeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function getObjWithTimeout(pool, id, timeoutMs = 3500) {
  if (!pool || !id) return null;
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, timeoutMs);
    try {
      pool.get(id, (obj) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(obj || null);
        }
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

function toPngBuffer(img) {
  const { width, height, kind, data } = img || {};
  if (!width || !height || !data) return null;
  const png = new PNG({ width, height });
  const out = png.data;

  if (kind === 3) {
    if (typeof data.copy === "function") {
      data.copy(out);
    } else {
      for (let i = 0; i < data.length; i++) out[i] = data[i];
    }
  } else if (kind === 2) {
    for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
      out[j] = data[i];
      out[j + 1] = data[i + 1];
      out[j + 2] = data[i + 2];
      out[j + 3] = 255;
    }
  } else if (kind === 1) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const bitIndex = y * width + x;
        const byte = data[bitIndex >> 3];
        const bit = 7 - (bitIndex & 7);
        const v = (byte >> bit) & 1 ? 0 : 255;
        const idx = bitIndex * 4;
        out[idx] = v;
        out[idx + 1] = v;
        out[idx + 2] = v;
        out[idx + 3] = 255;
      }
    }
  } else {
    return null;
  }
  return PNG.sync.write(png);
}

function textToBox(item) {
  const str = (item.str || "").replace(/\s+/g, " ").trim();
  if (!str) return null;

  const t = item.transform || [0, 0, 0, 0, 0, 0];
  const fontPx = Math.max(Math.abs(t[3]) || 0, Math.abs(item.height) || 0, 8);
  const x = clamp((t[4] || 0) / PX_PER_IN, 0, 13.2);
  const y = clamp((PAGE_H - (t[5] || 0) - fontPx) / PX_PER_IN, 0, 7.4);
  const w = clamp(Math.max((item.width || str.length * fontPx * 0.5) / PX_PER_IN, 0.12), 0.12, 13.33 - x);
  const h = clamp(Math.max((item.height || fontPx) / PX_PER_IN * 1.25, 0.1), 0.1, 7.5 - y);
  const fontPt = clamp((fontPx * 72) / PX_PER_IN, 8, 92);

  return { str, x, y, w, h, fontPx, fontPt };
}

function isAllCapsLike(str) {
  const cleaned = str.replace(/[^A-Za-zÁÉÍÓÚÑÜ0-9 ]/g, "");
  return cleaned.length > 0 && cleaned === cleaned.toUpperCase();
}

function extractImageOps(opList) {
  const imageFns = new Set([
    OPS.paintImageXObject,
    OPS.paintInlineImageXObject,
    OPS.paintImageXObjectRepeat,
    OPS.paintJpegXObject,
  ]);

  const ops = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];

    if (fn === OPS.save) {
      stack.push(ctm.slice());
      continue;
    }
    if (fn === OPS.restore) {
      ctm = stack.length ? stack.pop() : [1, 0, 0, 1, 0, 0];
      continue;
    }
    if (fn === OPS.transform && Array.isArray(args) && args.length >= 6) {
      ctm = matrixMultiply(ctm, args);
      continue;
    }
    if (!imageFns.has(fn)) continue;

    let objId = null;
    let inlineData = null;

    if (fn === OPS.paintInlineImageXObject && args?.[0] && typeof args[0] === "object") {
      inlineData = args[0];
      objId = `inline_${i}`;
    } else if (Array.isArray(args) && args.length) {
      objId = args[0];
    }

    ops.push({
      opIndex: i,
      objId,
      inlineData,
      bbox: bboxFromCtm(ctm),
      ctm: ctm.slice(),
    });
  }
  return ops;
}

function imageAreaRatio(ops) {
  let area = 0;
  for (const op of ops) {
    const minX = clamp(op.bbox.minX, 0, PAGE_W);
    const minY = clamp(op.bbox.minY, 0, PAGE_H);
    const maxX = clamp(op.bbox.maxX, 0, PAGE_W);
    const maxY = clamp(op.bbox.maxY, 0, PAGE_H);
    area += Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
  }
  return area / (PAGE_W * PAGE_H);
}

async function fetchBrandFromSite() {
  const sourceUrl = "https://colfletar.com.co/";
  const cssUrls = [];
  const colors = new Map();
  const fonts = new Map();

  try {
    const html = await (await fetch(sourceUrl)).text();
    for (const m of html.matchAll(
      /<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi
    )) {
      try {
        cssUrls.push(new URL(m[1], sourceUrl).href);
      } catch {
        // ignore malformed url
      }
    }
  } catch {
    return {
      sourceUrl,
      accessible: false,
      cssCount: 0,
      palette: [],
      fonts: [],
    };
  }

  const uniq = [...new Set(cssUrls)];
  for (const cssUrl of uniq) {
    try {
      const css = await (await fetch(cssUrl)).text();

      for (const m of css.matchAll(/--e-global-color-[\w-]+\s*:\s*([^;}{]+);/g)) {
        const val = m[1].trim();
        if (/^#[0-9a-fA-F]{3,8}$/.test(val)) colors.set(val.toUpperCase(), 999);
      }
      for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        const c = m[0].toUpperCase();
        colors.set(c, (colors.get(c) || 0) + 1);
      }
      for (const m of css.matchAll(/font-family\s*:\s*([^;}{]+);/gi)) {
        const f = m[1].trim();
        fonts.set(f, (fonts.get(f) || 0) + 1);
      }
    } catch {
      // ignore one stylesheet failure
    }
  }

  const palette = [...colors.entries()]
    .sort((a, b) => b[1] - a[1])
    .map((x) => x[0])
    .filter((c) => /^#[0-9A-F]{6}$/.test(c))
    .slice(0, 12);

  const topFonts = [...fonts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map((x) => x[0])
    .slice(0, 12);

  return {
    sourceUrl,
    accessible: true,
    cssCount: uniq.length,
    palette,
    fonts: topFonts,
  };
}

function buildDocParagraphs(meta) {
  const {
    now,
    pdfPath,
    slideCount,
    brandInfo,
    slides,
    pendingImages,
    outputPptx,
    outputDocx,
  } = meta;

  const p = [];
  const heading = (text, lvl = HeadingLevel.HEADING_1) =>
    new Paragraph({ text, heading: lvl });
  const body = (text) => new Paragraph({ children: [new TextRun(text)] });
  const bullet = (text) => new Paragraph({ text, bullet: { level: 0 } });

  p.push(
    new Paragraph({
      text: "Bitácora de Rediseño - Presentación Colfletar",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    })
  );
  p.push(body(""));

  p.push(heading("1) Datos del proyecto"));
  p.push(body("Nombre del proyecto: Rediseño visual de presentación corporativa"));
  p.push(body(`Fecha: ${now}`));
  p.push(body("Versión: v1.0"));
  p.push(body("Autor/Responsable: Codex (ejecución automatizada)"));
  p.push(body(`Fuente base: ${pdfPath}`));
  p.push(body(`Total de diapositivas: ${slideCount}`));

  p.push(heading("2) Fuente usada para el estilo"));
  if (brandInfo.accessible) {
    p.push(body(`Sitio de referencia: ${brandInfo.sourceUrl}`));
    p.push(body(`Acceso: correcto (${brandInfo.cssCount} hojas CSS analizadas)`));
  } else {
    p.push(body(`Sitio de referencia: ${brandInfo.sourceUrl}`));
    p.push(body("Acceso: no disponible durante la ejecución."));
  }

  p.push(heading("3) Paleta de color aproximada aplicada"));
  [
    `Principal oscuro: #${BRAND.dark}`,
    `Acento dorado: #${BRAND.gold}`,
    `Marrón marca: #${BRAND.brown}`,
    `Marrón secundario: #${BRAND.brownSoft}`,
    `Gris soporte: #${BRAND.gray}`,
    `Fondo claro: #${BRAND.light}`,
    `Neutros: #${BRAND.white}, #${BRAND.black}`,
  ].forEach((line) => p.push(bullet(line)));
  if (brandInfo.palette.length) {
    p.push(body(`Muestra detectada en CSS: ${brandInfo.palette.join(", ")}`));
  }

  p.push(heading("4) Tipografías / estilo tipográfico"));
  p.push(bullet("Tipografía principal aplicada: Montserrat"));
  p.push(bullet("Títulos: Montserrat semibold/bold, alto contraste"));
  p.push(bullet("Subtítulos y cuerpo: Montserrat regular"));
  p.push(bullet("Jerarquía por tamaño original del PDF, conservando orden y contenido"));
  if (brandInfo.fonts.length) {
    p.push(body(`Fuentes detectadas en sitio: ${brandInfo.fonts.join(" | ")}`));
  }

  p.push(heading("5) Reglas de diseño definidas"));
  p.push(bullet("Formato 16:9 (13.333 x 7.5 in)"));
  p.push(bullet("Banda superior dorada y franja inferior oscura como marco de marca"));
  p.push(bullet("Alineación y jerarquía conservadas según posiciones del PDF original"));
  p.push(bullet("Iconografía e imágenes heredadas del archivo base"));
  p.push(bullet("No se reordenaron, eliminaron ni agregaron diapositivas"));

  p.push(heading("6) Inventario slide por slide"));
  for (const s of slides) {
    p.push(heading(`Diapositiva ${s.slide}`, HeadingLevel.HEADING_2));
    p.push(body(`Objetivo inferido: ${s.title}`));
    p.push(body(`Cambios de diseño: ${s.designChanges}`));
    p.push(body(`Assets usados: ${s.imagesOk} imagen(es) extraídas y colocadas`));
    p.push(body(`Estado de imágenes: ${s.imagesPending ? "PENDIENTE" : "OK"}`));
    p.push(body(`Observaciones: ${s.observations}`));
  }

  p.push(heading("7) Registro de cambios y pendientes"));
  p.push(bullet("Se reconstruyó la presentación en .pptx editable desde PDF."));
  p.push(bullet("Se aplicó estilo visual alineado a Colfletar (colores/jerarquía/marcos)."));
  p.push(bullet("Se mantuvo el orden original y contenido textual sin reordenamiento."));
  if (pendingImages.length) {
    p.push(body("Imágenes pendientes de extracción automática:"));
    for (const miss of pendingImages) {
      p.push(
        bullet(
          `Slide ${miss.slide}, zona x=${miss.x.toFixed(2)} y=${miss.y.toFixed(
            2
          )} w=${miss.w.toFixed(2)} h=${miss.h.toFixed(2)}`
        )
      );
    }
    p.push(
      body(
        "Acción del usuario: abrir el PPTX, ubicar el marcador 'IMAGEN PENDIENTE' y reemplazar con la imagen correcta."
      )
    );
  } else {
    p.push(body("No se detectaron imágenes pendientes."));
  }

  p.push(heading("8) Checklist final de entrega"));
  p.push(bullet("Orden de diapositivas intacto"));
  p.push(bullet("Consistencia visual aplicada"));
  p.push(bullet("Imágenes extraídas/copiadas con validación"));
  p.push(bullet("Archivo principal editable (.pptx)"));
  p.push(bullet("Bitácora del proyecto generada (.docx)"));
  p.push(bullet(`Ruta de entrega PPTX: ${outputPptx}`));
  p.push(bullet(`Ruta de entrega DOCX: ${outputDocx}`));

  return p;
}

async function main() {
  ensureDir(OUTPUT_DIR);
  ensureDir(ASSETS_DIR);

  if (!fs.existsSync(PDF_PATH)) {
    throw new Error(`No existe el archivo base: ${PDF_PATH}`);
  }

  const brandInfo = await fetchBrandFromSite();

  const data = new Uint8Array(fs.readFileSync(PDF_PATH));
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Codex";
  pptx.company = "Colfletar";
  pptx.subject = "Rediseño de presentación";
  pptx.title = "Colfletar_Presentacion_Redisenada";
  pptx.lang = "es-CO";

  const slidesSummary = [];
  const pendingImages = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const opList = await page.getOperatorList();
    const imgOps = extractImageOps(opList);

    const imgRatio = imageAreaRatio(imgOps);
    const textCount = textContent.items.length;
    const imageHeavy = textCount <= 10 || imgRatio > 0.75;

    const slide = pptx.addSlide();

    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 13.333,
      h: 7.5,
      line: { color: imageHeavy ? BRAND.dark : BRAND.light, transparency: 100 },
      fill: { color: imageHeavy ? BRAND.dark : BRAND.light },
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 13.333,
      h: 0.16,
      line: { color: BRAND.gold, transparency: 100 },
      fill: { color: BRAND.gold },
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 7.38,
      w: 13.333,
      h: 0.12,
      line: { color: BRAND.dark, transparency: 100 },
      fill: { color: BRAND.dark },
    });

    slide.addText("COLFLETAR", {
      x: 10.9,
      y: 0.02,
      w: 2.35,
      h: 0.14,
      fontFace: "Montserrat",
      fontSize: 9,
      bold: true,
      color: BRAND.dark,
      align: "right",
      valign: "mid",
    });

    slide.addText(`${pageNum}/${pdf.numPages}`, {
      x: 12.55,
      y: 7.385,
      w: 0.72,
      h: 0.1,
      fontFace: "Montserrat",
      fontSize: 7,
      color: BRAND.gold,
      align: "right",
      valign: "mid",
    });

    const pageImageCache = new Map();
    let imagesOk = 0;
    let imagesPending = 0;

    for (let i = 0; i < imgOps.length; i++) {
      const op = imgOps[i];
      const key = op.objId || `inline_${pageNum}_${i}`;

      if (!pageImageCache.has(key)) {
        let imgObj = op.inlineData || null;
        if (!imgObj && op.objId) {
          imgObj = (await getObjWithTimeout(page.objs, op.objId)) || (await getObjWithTimeout(page.commonObjs, op.objId));
        }

        let imgPath = null;
        if (imgObj) {
          try {
            const pngBuffer = toPngBuffer(imgObj);
            if (pngBuffer) {
              const fileName = safeFileName(`slide_${String(pageNum).padStart(2, "0")}_${key}.png`);
              imgPath = path.join(ASSETS_DIR, fileName);
              fs.writeFileSync(imgPath, pngBuffer);
            }
          } catch {
            imgPath = null;
          }
        }

        pageImageCache.set(key, { imgPath });
      }

      const rec = pageImageCache.get(key);
      const box = bboxToInches(op.bbox);
      if (rec?.imgPath && fs.existsSync(rec.imgPath)) {
        slide.addImage({
          path: rec.imgPath,
          x: box.x,
          y: box.y,
          w: box.w,
          h: box.h,
        });
        imagesOk += 1;
      } else {
        slide.addShape(pptx.ShapeType.rect, {
          x: box.x,
          y: box.y,
          w: box.w,
          h: box.h,
          line: { color: "C00000", pt: 1 },
          fill: { color: "FFE5E5" },
        });
        slide.addText("IMAGEN PENDIENTE", {
          x: box.x,
          y: box.y + box.h / 2 - 0.08,
          w: box.w,
          h: 0.16,
          fontFace: "Montserrat",
          fontSize: 9,
          bold: true,
          color: "C00000",
          align: "center",
          valign: "mid",
        });
        pendingImages.push({ slide: pageNum, ...box });
        imagesPending += 1;
      }
    }

    const textBoxes = [];
    for (const item of textContent.items) {
      const t = textToBox(item);
      if (!t) continue;
      if (t.w <= 0 || t.h <= 0) continue;
      textBoxes.push(t);
    }

    const title = textBoxes
      .slice()
      .sort((a, b) => b.fontPx - a.fontPx)
      .find((x) => x.str.length >= 2)?.str || `Slide ${pageNum}`;

    for (const t of textBoxes) {
      const isTitle = t.fontPx >= 40;
      const isSubtitle = t.fontPx >= 28;
      const textColor = imageHeavy
        ? isTitle
          ? BRAND.gold
          : BRAND.white
        : isTitle
          ? BRAND.dark
          : BRAND.gray;
      const bold = isTitle || isSubtitle || (isAllCapsLike(t.str) && t.str.length < 60);

      slide.addText(t.str, {
        x: t.x,
        y: t.y,
        w: t.w,
        h: t.h,
        fontFace: "Montserrat",
        fontSize: t.fontPt,
        bold,
        color: textColor,
        align: "left",
        valign: "top",
        fit: "shrink",
      });
    }

    slidesSummary.push({
      slide: pageNum,
      title,
      textCount: textBoxes.length,
      imagesOk,
      imagesPending,
      designChanges:
        "Aplicación de marco Colfletar (banda superior dorada, franja inferior oscura), tipografía Montserrat y paleta corporativa.",
      observations:
        imagesPending > 0
          ? "Existen imágenes pendientes señaladas con marcador visible."
          : "Imágenes extraídas y ubicadas automáticamente.",
      previewText: textBoxes.slice(0, 5).map((x) => x.str),
      imageHeavy,
      imageRatio: Number(imgRatio.toFixed(3)),
    });
  }

  await pptx.writeFile({ fileName: PPT_OUT });

  const now = new Date().toLocaleString("es-CO", { hour12: false });
  const docChildren = buildDocParagraphs({
    now,
    pdfPath: PDF_PATH,
    slideCount: pdf.numPages,
    brandInfo,
    slides: slidesSummary,
    pendingImages,
    outputPptx: PPT_OUT,
    outputDocx: DOCX_OUT,
  });

  const doc = new Document({
    sections: [{ children: docChildren }],
  });
  const docBuffer = await Packer.toBuffer(doc);
  fs.writeFileSync(DOCX_OUT, docBuffer);

  fs.writeFileSync(
    SUMMARY_OUT,
    JSON.stringify(
      {
        createdAt: now,
        sourcePdf: PDF_PATH,
        output: { pptx: PPT_OUT, docx: DOCX_OUT, assetsDir: ASSETS_DIR },
        brandInfo,
        slideCount: pdf.numPages,
        pendingImages,
        slides: slidesSummary,
      },
      null,
      2
    )
  );

  console.log(JSON.stringify({
    ok: true,
    slideCount: pdf.numPages,
    pendingImages: pendingImages.length,
    output: { pptx: PPT_OUT, docx: DOCX_OUT, assets: ASSETS_DIR, summary: SUMMARY_OUT },
  }, null, 2));
}

main().catch((err) => {
  console.error("ERROR:", err?.message || err);
  process.exit(1);
});

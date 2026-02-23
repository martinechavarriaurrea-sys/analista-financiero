import fs from "fs";
import path from "path";
import PptxGenJS from "pptxgenjs";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pngjsPkg from "pngjs";

const { PNG } = pngjsPkg;

const PDF_PATH =
  "C:/Users/Martin Echavarria/Downloads/Navy Modern Leading with Human Resources Presentation.pdf";

const ONE_DRIVE_DESKTOP =
  "C:/Users/Martin Echavarria/OneDrive - Universidad EAFIT/Escritorio";
const LOCAL_DESKTOP = "C:/Users/Martin Echavarria/Desktop";

const OUTPUT_DIR = fs.existsSync(ONE_DRIVE_DESKTOP)
  ? path.join(ONE_DRIVE_DESKTOP, "Colfletar")
  : path.join(LOCAL_DESKTOP, "Colfletar");
const ASSETS_DIR = path.join(OUTPUT_DIR, "assets_sin_solapes");
const PPT_OUT = path.join(OUTPUT_DIR, "Colfletar_Presentacion_Redisenada.pptx");
const REPORT_OUT = path.join(OUTPUT_DIR, "_sin_solapes_reporte.json");

const PAGE_W = 1440;
const PAGE_H = 810;
const PX_PER_IN = 108;

const BRAND = {
  dark: "141215",
  gold: "C6A47E",
  brown: "6D4C28",
  gray: "565656",
  light: "F7F5F2",
  white: "FFFFFF",
  black: "000000",
};

const OPS = pdfjsLib.OPS;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
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

function areaOfBbox(b) {
  return Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);
}

function iou(a, b) {
  const ix1 = Math.max(a.minX, b.minX);
  const iy1 = Math.max(a.minY, b.minY);
  const ix2 = Math.min(a.maxX, b.maxX);
  const iy2 = Math.min(a.maxY, b.maxY);
  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  if (inter <= 0) return 0;
  const union = areaOfBbox(a) + areaOfBbox(b) - inter;
  return union > 0 ? inter / union : 0;
}

function extractImageOps(opList) {
  const imageFns = new Set([
    OPS.paintImageXObject,
    OPS.paintInlineImageXObject,
    OPS.paintImageXObjectRepeat,
    OPS.paintJpegXObject,
  ]);
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const ops = [];

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
    });
  }
  return ops;
}

function dedupeImageOps(ops) {
  const sorted = [...ops]
    .filter((o) => areaOfBbox(o.bbox) > 500) // quita ruido mínimo
    .sort((a, b) => areaOfBbox(b.bbox) - areaOfBbox(a.bbox));
  const out = [];
  for (const op of sorted) {
    let duplicate = false;
    for (const ex of out) {
      const sameObj = op.objId && ex.objId && op.objId === ex.objId;
      const overlap = iou(op.bbox, ex.bbox);
      if ((sameObj && overlap > 0.6) || overlap > 0.95) {
        duplicate = true;
        break;
      }
    }
    if (!duplicate) out.push(op);
  }
  return out;
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

function textItemToBox(item) {
  const str = (item.str || "").replace(/\s+/g, " ").trim();
  if (!str) return null;
  const t = item.transform || [0, 0, 0, 0, 0, 0];
  const fontPx = Math.max(Math.abs(t[3]) || 0, Math.abs(item.height) || 0, 8);
  const x = clamp((t[4] || 0) / PX_PER_IN, 0, 13.2);
  const y = clamp((PAGE_H - (t[5] || 0) - fontPx) / PX_PER_IN, 0, 7.4);
  const w = clamp(Math.max((item.width || str.length * fontPx * 0.5) / PX_PER_IN, 0.12), 0.12, 13.33 - x);
  const h = clamp(Math.max((item.height || fontPx) / PX_PER_IN * 1.2, 0.1), 0.1, 7.5 - y);
  return { str, x, y, w, h, fontPx };
}

function mergeTextLines(items) {
  const raw = items
    .map(textItemToBox)
    .filter(Boolean)
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));

  const merged = [];
  for (const box of raw) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({ ...box });
      continue;
    }

    const sameLine =
      Math.abs(box.y - last.y) <= Math.max(0.06, Math.min(last.h, box.h) * 0.75) &&
      Math.abs(box.fontPx - last.fontPx) <= 12;
    const nearby = box.x <= last.x + last.w + 0.4;

    if (sameLine && nearby) {
      if (!last.str.endsWith("-") && !box.str.startsWith(",") && !box.str.startsWith(".")) {
        last.str += " ";
      }
      last.str += box.str;
      last.w = Math.max(last.w, box.x + box.w - last.x);
      last.h = Math.max(last.h, box.h);
      last.fontPx = Math.max(last.fontPx, box.fontPx);
    } else {
      merged.push({ ...box });
    }
  }

  const out = [];
  const seen = new Set();
  for (const line of merged) {
    const clean = line.str.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    const key = `${clean.toLowerCase()}|${Math.round(line.y * 20)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...line, str: clean });
  }
  return out;
}

function fitRectInCell(aspect, cell) {
  let w = cell.w;
  let h = w / aspect;
  if (h > cell.h) {
    h = cell.h;
    w = h * aspect;
  }
  return {
    x: cell.x + (cell.w - w) / 2,
    y: cell.y + (cell.h - h) / 2,
    w,
    h,
  };
}

function layoutImagesNoOverlap(images, area, mode) {
  if (!images.length) return [];
  const out = [];
  const gap = 0.1;

  if (mode === "hero" && images.length === 1) {
    out.push({
      image: images[0],
      ...fitRectInCell(images[0].aspect, area),
    });
    return out;
  }

  let cols = 2;
  if (images.length === 1) cols = 1;
  else if (images.length <= 4) cols = 2;
  else if (images.length <= 9) cols = 3;
  else cols = 4;
  const rows = Math.ceil(images.length / cols);
  const cellW = (area.w - gap * (cols - 1)) / cols;
  const cellH = (area.h - gap * (rows - 1)) / rows;

  for (let i = 0; i < images.length; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const cell = {
      x: area.x + col * (cellW + gap),
      y: area.y + row * (cellH + gap),
      w: cellW,
      h: cellH,
    };
    out.push({
      image: images[i],
      ...fitRectInCell(images[i].aspect, cell),
    });
  }
  return out;
}

function prepareTextStyles(lines) {
  if (!lines.length) return [];
  const maxFont = Math.max(...lines.map((l) => l.fontPx));
  return lines.map((l, idx) => {
    const rel = l.fontPx / maxFont;
    let pt = clamp((l.fontPx * 72) / PX_PER_IN, 10, 38);
    let bold = false;
    if (rel >= 0.85) {
      pt = clamp(pt, 24, 40);
      bold = true;
    } else if (rel >= 0.65) {
      pt = clamp(pt, 16, 26);
      bold = true;
    } else {
      pt = clamp(pt, 10, 18);
    }
    return {
      ...l,
      idx,
      pt,
      bold,
      isTitle: rel >= 0.85,
      lineH: clamp((pt / 72) * 1.28, 0.18, 0.75),
    };
  });
}

function flowTextInArea(styledLines, area) {
  if (!styledLines.length) return [];
  const gap = 0.035;
  let totalH =
    styledLines.reduce((acc, s) => acc + s.lineH, 0) + gap * Math.max(0, styledLines.length - 1);
  let scale = 1;
  if (totalH > area.h) scale = area.h / totalH;
  if (scale < 1) {
    for (const s of styledLines) {
      s.pt = Math.max(8, s.pt * scale);
      s.lineH = clamp((s.pt / 72) * 1.25, 0.16, 0.62);
    }
    totalH =
      styledLines.reduce((acc, s) => acc + s.lineH, 0) + gap * Math.max(0, styledLines.length - 1);
  }

  const placed = [];
  let y = area.y;
  for (const s of styledLines) {
    if (y >= area.y + area.h - 0.12) break;
    const h = Math.min(s.lineH, area.y + area.h - y);
    placed.push({
      ...s,
      x: area.x,
      y,
      w: area.w,
      h,
    });
    y += h + gap;
  }
  return placed;
}

function addBrandFrame(slide, pageNum, totalSlides) {
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    line: { color: BRAND.light, transparency: 100 },
    fill: { color: BRAND.light },
  });
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.16,
    line: { color: BRAND.gold, transparency: 100 },
    fill: { color: BRAND.gold },
  });
  slide.addShape("rect", {
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
  slide.addText(`${pageNum}/${totalSlides}`, {
    x: 12.53,
    y: 7.385,
    w: 0.74,
    h: 0.1,
    fontFace: "Montserrat",
    fontSize: 7,
    color: BRAND.gold,
    align: "right",
    valign: "mid",
  });
}

async function main() {
  ensureDir(OUTPUT_DIR);
  ensureDir(ASSETS_DIR);
  if (!fs.existsSync(PDF_PATH)) throw new Error(`No existe PDF base: ${PDF_PATH}`);

  const data = new Uint8Array(fs.readFileSync(PDF_PATH));
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Codex";
  pptx.company = "Colfletar";
  pptx.subject = "Ajuste sin solapes";
  pptx.title = "Colfletar_Presentacion_Redisenada";
  pptx.lang = "es-CO";

  const report = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const opList = await page.getOperatorList();

    const lines = mergeTextLines(textContent.items);
    const rawImgOps = extractImageOps(opList);
    const imageOps = dedupeImageOps(rawImgOps);

    const imageObjs = [];
    const objCache = new Map();
    let imgMissing = 0;

    for (let i = 0; i < imageOps.length; i++) {
      const op = imageOps[i];
      const key = op.objId || `inline_${pageNum}_${i}`;
      if (!objCache.has(key)) {
        let imgObj = op.inlineData || null;
        if (!imgObj && op.objId) {
          imgObj =
            (await getObjWithTimeout(page.objs, op.objId)) ||
            (await getObjWithTimeout(page.commonObjs, op.objId));
        }
        let imgPath = null;
        let aspect = 1.77;
        if (imgObj) {
          const png = toPngBuffer(imgObj);
          if (png) {
            const f = `s${String(pageNum).padStart(2, "0")}_${key.replace(/[^a-zA-Z0-9._-]/g, "_")}.png`;
            imgPath = path.join(ASSETS_DIR, f);
            fs.writeFileSync(imgPath, png);
            aspect = (imgObj.width || 16) / Math.max(1, imgObj.height || 9);
          }
        }
        objCache.set(key, { imgPath, aspect });
      }
      const cached = objCache.get(key);
      if (cached?.imgPath && fs.existsSync(cached.imgPath)) {
        imageObjs.push({
          path: cached.imgPath,
          aspect: cached.aspect,
          area: areaOfBbox(op.bbox),
        });
      } else {
        imgMissing += 1;
      }
    }

    imageObjs.sort((a, b) => b.area - a.area);

    const slide = pptx.addSlide();
    addBrandFrame(slide, pageNum, pdf.numPages);

    const content = { x: 0.45, y: 0.35, w: 12.43, h: 6.95 };

    let imageArea = null;
    let textArea = null;
    let mode = "split";

    if (!imageObjs.length && lines.length) {
      textArea = { ...content };
      mode = "text-only";
    } else if (imageObjs.length && !lines.length) {
      imageArea = { ...content };
      mode = "image-only";
    } else if (imageObjs.length <= 2 && lines.length <= 8) {
      imageArea = { x: 0.45, y: 0.45, w: 12.43, h: 4.5 };
      textArea = { x: 0.65, y: 5.05, w: 12.03, h: 2.15 };
      mode = imageObjs.length === 1 ? "hero" : "top-images";
    } else if (lines.length >= 14) {
      imageArea = { x: 0.45, y: 0.45, w: 4.8, h: 6.75 };
      textArea = { x: 5.45, y: 0.55, w: 7.45, h: 6.55 };
      mode = "text-priority";
    } else {
      imageArea = { x: 0.45, y: 0.45, w: 6.1, h: 6.75 };
      textArea = { x: 6.75, y: 0.55, w: 6.13, h: 6.55 };
      mode = "split";
    }

    let placedImages = [];
    if (imageArea && imageObjs.length) {
      placedImages = layoutImagesNoOverlap(imageObjs, imageArea, mode === "hero" ? "hero" : "grid");
      for (const p of placedImages) {
        slide.addImage({
          path: p.image.path,
          x: p.x,
          y: p.y,
          w: p.w,
          h: p.h,
        });
      }
    }

    let placedText = [];
    if (textArea && lines.length) {
      const styled = prepareTextStyles(lines);
      placedText = flowTextInArea(styled, textArea);
      for (const t of placedText) {
        slide.addText(t.str, {
          x: t.x,
          y: t.y,
          w: t.w,
          h: t.h,
          fontFace: "Montserrat",
          fontSize: t.pt,
          bold: t.bold,
          color: t.isTitle ? BRAND.dark : BRAND.gray,
          align: "left",
          valign: "mid",
          fit: "shrink",
        });
      }
    }

    if (imgMissing > 0) {
      slide.addShape("roundRect", {
        x: 0.55,
        y: 0.22,
        w: 3.5,
        h: 0.22,
        line: { color: "C00000", pt: 0.6 },
        fill: { color: "FFE5E5" },
      });
      slide.addText(`IMAGEN PENDIENTE: ${imgMissing}`, {
        x: 0.6,
        y: 0.245,
        w: 3.4,
        h: 0.15,
        fontFace: "Montserrat",
        fontSize: 8,
        bold: true,
        color: "C00000",
      });
    }

    report.push({
      slide: pageNum,
      mode,
      textLines: lines.length,
      textPlaced: placedText.length,
      imagesDetected: imageObjs.length + imgMissing,
      imagesPlaced: placedImages.length,
      imagesMissing: imgMissing,
      overlapPolicy: "Zonas separadas para texto e imágenes (sin solapes).",
    });
  }

  await pptx.writeFile({ fileName: PPT_OUT });

  fs.writeFileSync(
    REPORT_OUT,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        source: PDF_PATH,
        output: PPT_OUT,
        slides: report,
      },
      null,
      2
    )
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        outputDir: OUTPUT_DIR,
        pptx: PPT_OUT,
        report: REPORT_OUT,
        slides: report.length,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("ERROR:", err?.message || err);
  process.exit(1);
});

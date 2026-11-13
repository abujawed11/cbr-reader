const fs = require('fs/promises');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');

const TARGET_WIDTH = 1600; // px; the converter downsizes/encodes to WebP afterwards
const MAX_PAGES = 2000;

// pdfjs-dist is ESM-only, so it has to be loaded with a dynamic import() from CommonJS.
let pdfjsPromise;
const loadPdfjs = () => (pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs'));

const pdfjsDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
// pdfjs requires a trailing "/" (not the Windows backslash)
const withSlash = (p) => p.replace(/\\/g, '/') + '/';

// Render every page of a PDF to numbered PNG files in destDir (one page in memory at a time).
// Returns the file paths in page order.
async function renderPdfToImages(pdfPath, destDir) {
  const pdfjs = await loadPdfjs();
  await fs.mkdir(destDir, { recursive: true });

  const data = new Uint8Array(await fs.readFile(pdfPath));
  const task = pdfjs.getDocument({
    data,
    cMapUrl: withSlash(path.join(pdfjsDir, 'cmaps')),
    cMapPacked: true,
    standardFontDataUrl: withSlash(path.join(pdfjsDir, 'standard_fonts')),
    useSystemFonts: false,
    verbosity: 0,
  });
  const doc = await task.promise;

  try {
    if (doc.numPages > MAX_PAGES) throw new Error(`PDF has too many pages (${doc.numPages}, max ${MAX_PAGES})`);

    const files = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(Math.max(TARGET_WIDTH / base.width, 1), 4);
      const viewport = page.getViewport({ scale });

      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; // PDFs are transparent by default; avoid black backgrounds
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, canvas, viewport }).promise;

      const file = path.join(destDir, `${String(n).padStart(5, '0')}.png`);
      await fs.writeFile(file, await canvas.encode('png'));
      files.push(file);
      page.cleanup();
    }
    return files;
  } finally {
    await task.destroy();
  }
}

module.exports = { renderPdfToImages };

const fs = require('fs/promises');
const path = require('path');
const AdmZip = require('adm-zip');
const { createExtractorFromFile } = require('node-unrar-js');
const sharp = require('sharp');
const config = require('./config');
const { renderPdfToImages } = require('./pdf');

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|tiff?)$/i;
const naturalSort = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

// Detect by magic bytes, not by extension: many .cbr files are really ZIPs.
async function detectType(file) {
  const fh = await fs.open(file.path, 'r');
  const buf = Buffer.alloc(8);
  await fh.read(buf, 0, 8, 0);
  await fh.close();
  if (buf[0] === 0x50 && buf[1] === 0x4b) return 'zip';
  if (buf.toString('latin1', 0, 4) === 'Rar!') return 'rar';
  if (buf.toString('latin1', 0, 4) === '%PDF') return 'pdf';
  // multer stores uploads under random names, so check the original name
  return IMAGE_EXT.test(file.originalname) ? 'image' : 'unknown';
}

async function listFilesRecursive(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFilesRecursive(full)));
    else out.push(full);
  }
  return out;
}

// Extract archive contents into workDir and return image entries in reading order.
async function extractImages(uploads, workDir) {
  await fs.mkdir(workDir, { recursive: true });
  const images = []; // { path, name } - name is used for sorting

  for (let i = 0; i < uploads.length; i++) {
    const file = uploads[i];
    const type = await detectType(file);

    if (type === 'zip' || type === 'rar') {
      const dest = path.join(workDir, `archive-${i}`);
      if (type === 'zip') {
        new AdmZip(file.path).extractAllTo(dest, true);
      } else {
        const extractor = await createExtractorFromFile({ filepath: file.path, targetPath: dest });
        [...extractor.extract().files]; // consuming the generator writes the files to disk
      }
      for (const p of await listFilesRecursive(dest)) {
        images.push({ path: p, name: path.relative(dest, p) });
      }
    } else if (type === 'image') {
      images.push({ path: file.path, name: file.originalname });
    } else if (type === 'pdf') {
      const dest = path.join(workDir, `pdf-${i}`);
      for (const p of await renderPdfToImages(file.path, dest)) {
        images.push({ path: p, name: path.relative(dest, p) });
      }
    } else {
      throw new Error(`Unsupported file: ${file.originalname}`);
    }
  }

  return images
    .filter((img) => IMAGE_EXT.test(img.name) && !img.name.includes('__MACOSX'))
    .sort((a, b) => naturalSort(a.name, b.name));
}

// Convert uploads into numbered WebP pages + cover in storage/books/<id>/.
async function convertToBook(bookId, uploads) {
  const bookDir = path.join(config.storageDir, 'books', String(bookId));
  const workDir = path.join(config.storageDir, 'tmp', String(bookId));
  await fs.mkdir(bookDir, { recursive: true });

  try {
    const images = await extractImages(uploads, workDir);
    if (!images.length) throw new Error('No images found in the uploaded file(s)');

    const pages = [];
    for (let i = 0; i < images.length; i++) {
      const number = i + 1;
      const info = await sharp(images[i].path)
        .rotate()
        .resize({ width: 1600, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(path.join(bookDir, `${number}.webp`));
      pages.push({ number, width: info.width, height: info.height });
    }

    await sharp(images[0].path)
      .rotate()
      .resize({ width: 400, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(path.join(bookDir, 'cover.webp'));

    return pages;
  } catch (err) {
    await fs.rm(bookDir, { recursive: true, force: true });
    throw err;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
    // Deliberately NOT deleting `uploads` here: the caller does that, and only once it knows the outcome —
    // a failed conversion keeps its original files around so "retry" has something to retry with.
  }
}

module.exports = { convertToBook };

'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const config = require('./config');

/**
 * Uploads land in a directory that nginx serves as static bytes only — never
 * as executable, never through an interpreter. Filenames are generated, never
 * taken from the client, so a file called `x.php` cannot exist on disk.
 */

const MAX_RAW = 25 * 1024 * 1024;

/** Sniff the real type from the leading bytes. The extension is not evidence. */
function sniff(buf) {
  if (buf.length < 16) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'png';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buf.slice(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.slice(8, 12).toString('ascii');
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'mif1', 'msf1'].includes(brand)) return 'heic';
    if (['avif', 'avis'].includes(brand)) return 'avif';
    return 'video';           // mp4/mov/qt — a phone video, not a photo
  }
  if (buf.slice(0, 4).toString('ascii') === '%PDF') return 'pdf';
  return null;
}

const FRIENDLY = {
  video: 'That file is a video — please choose a photo.',
  pdf: 'That file is a PDF — please choose a photo.',
  null: "We couldn't read that file as a photo. JPG, PNG, WebP and iPhone HEIC all work.",
};

class UploadError extends Error {}

/**
 * Process an uploaded buffer into a stored original plus a web derivative.
 * Returns the derivative's filename.
 */
async function store(buf) {
  if (!buf || !buf.length) throw new UploadError('No file arrived. Try choosing the photo again.');
  if (buf.length > MAX_RAW) {
    throw new UploadError('That photo is larger than 25 MB. Try taking it again at a smaller size.');
  }

  const kind = sniff(buf);
  if (!['jpeg', 'png', 'webp', 'heic', 'avif'].includes(kind)) {
    throw new UploadError(FRIENDLY[kind] || FRIENDLY.null);
  }

  let working = buf;

  // sharp's prebuilt binaries do not carry a HEVC decoder, so iPhone HEIC is
  // converted with a pure-JS decoder first. Without this step the most common
  // photo format on the owner's own phone would simply fail.
  if (kind === 'heic') {
    try {
      const heicConvert = require('heic-convert');
      working = await heicConvert({ buffer: buf, format: 'JPEG', quality: 0.92 });
    } catch (e) {
      throw new UploadError(
        "We couldn't convert that iPhone photo. Open it in Photos, tap Share, choose a size, and try again."
      );
    }
  }

  const id = crypto.randomBytes(8).toString('hex');
  const origName = `${id}-original.jpg`;
  const webName = `${id}.jpg`;

  try {
    // .rotate() with no argument applies the EXIF orientation tag, which is
    // what stops phone photos appearing sideways.
    const base = sharp(working, { failOn: 'none' }).rotate();

    await base.clone()
      .jpeg({ quality: 92 })
      .toFile(path.join(config.uploadDir, origName));

    await base.clone()
      .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(path.join(config.uploadDir, webName));
  } catch (e) {
    throw new UploadError("We couldn't process that photo. Try a different one.");
  }

  return webName;
}

/** Remove a derivative and its original. Never touches brand assets. */
function remove(name) {
  if (!name || name.includes('/') || name.includes('..')) return;
  const id = name.replace(/\.jpg$/, '');
  for (const f of [name, `${id}-original.jpg`]) {
    try { fs.unlinkSync(path.join(config.uploadDir, f)); } catch (e) { /* already gone */ }
  }
}

module.exports = { store, remove, UploadError, MAX_RAW, sniff };

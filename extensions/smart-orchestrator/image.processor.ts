import {execFile} from "node:child_process";
import {randomUUID} from "node:crypto";
import {existsSync, readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {basename, extname, join} from "node:path";
import {promisify} from "node:util";
import type {ImageContent} from "@earendil-works/pi-ai";

const execFileAsync = promisify(execFile);

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff", ".tif", ".heic", ".heif"]);

function getMimeType(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".bmp":
      return "image/bmp";
    default:
      return "image/png";
  }
}

async function convertUnsupportedImageToPng(sourcePath: string): Promise<string | undefined> {
  const targetPath = join(tmpdir(), `pi-converted-${randomUUID()}.png`);
  try {
    await execFileAsync("sips", ["-s", "format", "png", sourcePath, "--out", targetPath], {timeout: 10_000});
    if (existsSync(targetPath) && readFileSync(targetPath).length > 0) {
      return targetPath;
    }
  } catch {
    // Fallback to ImageMagick if available
    try {
      await execFileAsync("magick", [sourcePath, targetPath], {timeout: 10_000});
      if (existsSync(targetPath) && readFileSync(targetPath).length > 0) {
        return targetPath;
      }
    } catch {
      // Conversion not possible
    }
  }
  return undefined;
}

export interface ExtractedImageResult {
  cleanedText: string;
  images: ImageContent[];
}

/**
 * Scans input text for local image paths (quoted or unquoted), normalizes TIFF/HEIC to PNG,
 * extracts base64 ImageContent for the vision model, and cleans the text prompt.
 */
export async function extractAndNormalizeImagesFromText(text: string): Promise<ExtractedImageResult> {
  const images: ImageContent[] = [];
  let cleanedText = text;

  // Regex matches:
  // 1. Quoted paths: "[^"]+\.(png|jpg|jpeg|webp|gif|bmp|tiff|tif|heic|heif)"
  // 2. Single quoted: '[^']+\.(...)'
  // 3. Unquoted paths: (?:/|\~|\./)[^\s]+\.(...)
  const pathRegex =
    /(?:["']([^"']+\.(?:png|jpg|jpeg|webp|gif|bmp|tiff|tif|heic|heif))["']|((?:(?:\/|~|\.\/|\.\.\/)[^\s"']+|[A-Za-z]:\\[^\s"']+)\.(?:png|jpg|jpeg|webp|gif|bmp|tiff|tif|heic|heif)))/gi;

  const matches = Array.from(text.matchAll(pathRegex));

  for (const match of matches) {
    const rawPath = (match[1] ?? match[2] ?? "").trim();
    if (!rawPath || !existsSync(rawPath)) continue;

    const ext = extname(rawPath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;

    let pathToRead = rawPath;
    let mimeType = getMimeType(ext);

    // Convert TIFF, HEIC, etc. to standard PNG for vision models
    if (ext === ".tiff" || ext === ".tif" || ext === ".heic" || ext === ".heif") {
      const converted = await convertUnsupportedImageToPng(rawPath);
      if (converted) {
        pathToRead = converted;
        mimeType = "image/png";
      }
    }

    try {
      const fileBytes = readFileSync(pathToRead);
      if (fileBytes.length > 0) {
        const base64Data = fileBytes.toString("base64");
        images.push({
          type: "image",
          data: base64Data,
          mimeType,
        });

        // Replace raw path with concise label in text
        const matchedString = match[0];
        const fileName = basename(rawPath);
        cleanedText = cleanedText.replace(matchedString, `[Imagen: ${fileName}]`);
      }
    } catch {
      // Failed reading file, leave as text
    }
  }

  return {
    cleanedText: cleanedText.trim().replace(/\s+/g, " "),
    images,
  };
}

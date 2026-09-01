import { BadRequestException } from '@nestjs/common';
import sharp = require('sharp');

export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
export const MAX_MEDIA_PIXELS = 40_000_000;
export const MAX_MEDIA_FRAMES = 200;
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type AllowedMime = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];
export type InspectedImage = { mimeType: AllowedMime; extension: 'jpg' | 'png' | 'gif' | 'webp'; width: number; height: number };

function jpegDimensions(buffer: Buffer) {
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset++];
    if (marker === 0xd8 || marker === 0x01) continue;
    if (marker === 0xd9 || marker === 0xda || offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if (startOfFrame.has(marker) && length >= 7) return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    offset += length;
  }
  return null;
}

function webpDimensions(buffer: Buffer) {
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X' && buffer.length >= 30) {
    const width = 1 + buffer.readUIntLE(24, 3), height = 1 + buffer.readUIntLE(27, 3);
    return { width, height };
  }
  if (chunk === 'VP8 ' && buffer.length >= 30 && buffer.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
    const b1 = buffer[21], b2 = buffer[22], b3 = buffer[23], b4 = buffer[24];
    return { width: 1 + b1 + ((b2 & 0x3f) << 8), height: 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10) };
  }
  return null;
}

export function inspectImage(buffer: Buffer): InspectedImage {
  if (!buffer.length || buffer.length > MAX_MEDIA_BYTES) throw new BadRequestException('图片大小必须在 1 字节到 10 MiB 之间');
  let result: InspectedImage | null = null;
  if (buffer.length >= 45 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && buffer.readUInt32BE(8) === 13 && buffer.toString('ascii', 12, 16) === 'IHDR' && buffer.toString('ascii', buffer.length - 8, buffer.length - 4) === 'IEND') {
    // Only GIF/WebP enter our tested all-frame decoder. Do not accept an APNG
    // after validating just its PNG fallback frame.
    for (let offset = 8; offset + 12 <= buffer.length;) {
      const size = buffer.readUInt32BE(offset);
      if (size > buffer.length - offset - 12) throw new BadRequestException('PNG 数据块被截断');
      const chunk = buffer.toString('ascii', offset + 4, offset + 8);
      if (['acTL', 'fcTL', 'fdAT'].includes(chunk)) throw new BadRequestException('动画请使用 GIF 或 WebP，暂不接受 APNG');
      offset += size + 12;
    }
    result = { mimeType: 'image/png', extension: 'png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  } else if (buffer.length >= 14 && ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6)) && buffer[buffer.length - 1] === 0x3b) {
    result = { mimeType: 'image/gif', extension: 'gif', width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  } else if (buffer.length >= 12 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9) {
    const dimensions = jpegDimensions(buffer);
    if (dimensions) result = { mimeType: 'image/jpeg', extension: 'jpg', ...dimensions };
  } else if (buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' && buffer.readUInt32LE(4) + 8 === buffer.length) {
    const dimensions = webpDimensions(buffer);
    if (dimensions) result = { mimeType: 'image/webp', extension: 'webp', ...dimensions };
  }
  if (!result) throw new BadRequestException('文件内容不是有效的 JPEG、PNG、GIF 或 WebP 图片');
  if (!result.width || !result.height || result.width > 30_000 || result.height > 30_000 || result.width * result.height > MAX_MEDIA_PIXELS) {
    throw new BadRequestException('图片尺寸无效或总像素超过 4000 万');
  }
  return result;
}

export function safeOriginalName(value: string) {
  const clean = (value || 'image').normalize('NFKC').split(/[\\/]/).pop()!
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').trim();
  if (!clean) return 'image';
  return [...clean].map(char => /^[\uD800-\uDFFF]$/.test(char) ? '\uFFFD' : char).slice(0, 255).join('');
}

/** Signature checks are only a preflight; decode every pixel/frame before accepting bytes. */
export async function validateImage(buffer: Buffer): Promise<InspectedImage> {
  const inspected = inspectImage(buffer);
  const decoder = sharp(buffer, { animated: true, failOn: 'warning', limitInputPixels: MAX_MEDIA_PIXELS });
  try {
    const metadata = await decoder.metadata();
    const frames = metadata.pages || 1;
    const width = metadata.width || 0, height = metadata.pageHeight || metadata.height || 0;
    if (!width || !height || width > 30_000 || height > 30_000 || frames > MAX_MEDIA_FRAMES || width * height * frames > MAX_MEDIA_PIXELS) {
      throw new BadRequestException('动画帧数或累计像素超出安全上限');
    }
    await decoder.timeout({ seconds: 10 }).raw().toBuffer();
    return { ...inspected, width, height };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('图片无法完整解码，文件损坏或超出解码安全限制');
  } finally { decoder.destroy(); }
}

export function normalizeMediaFolder(value?: string) {
  const folder = (value || 'general').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,49}$/.test(folder)) throw new BadRequestException('媒体文件夹只能使用 1–50 位小写字母、数字、_或-');
  return folder;
}

export function normalizeAltText(value?: string | null) {
  const alt = value?.trim() || null;
  if (alt && alt.length > 300) throw new BadRequestException('图片替代文字不能超过 300 字');
  return alt;
}

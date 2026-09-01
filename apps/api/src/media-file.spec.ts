import { BadRequestException } from '@nestjs/common';
import { inspectImage, normalizeAltText, normalizeMediaFolder, safeOriginalName } from './media-file';
import { validateImage } from './media-file';
import sharp = require('sharp');

function png(width = 640, height = 360) {
  const value = Buffer.alloc(45);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(value);
  value.writeUInt32BE(13, 8); value.write('IHDR', 12, 'ascii');
  value.writeUInt32BE(width, 16); value.writeUInt32BE(height, 20);
  value.write('IEND', value.length - 8, 'ascii');
  return value;
}

function jpeg(width = 800, height = 600) {
  const value = Buffer.alloc(17);
  Buffer.from([0xff, 0xd8, 0xff, 0xc0]).copy(value);
  value.writeUInt16BE(11, 4); value[6] = 8;
  value.writeUInt16BE(height, 7); value.writeUInt16BE(width, 9);
  value[11] = 1; value[12] = 1; value[13] = 0x11; value[14] = 0;
  value[15] = 0xff; value[16] = 0xd9;
  return value;
}

describe('secure media inspection', () => {
  it.each(['png', 'jpeg', 'gif', 'webp'] as const)('fully decodes real %s pixel data', async format => {
    const bytes = await sharp({ create: { width: 16, height: 12, channels: 3, background: '#33aabb' } }).toFormat(format).toBuffer();
    await expect(validateImage(bytes)).resolves.toMatchObject({ width: 16, height: 12, mimeType: `image/${format}` });
  });

  it('rejects header/trailer-only fakes that passed the old preflight', async () => {
    expect(inspectImage(png()).width).toBe(640);
    await expect(validateImage(png())).rejects.toThrow('完整解码');
    await expect(validateImage(jpeg())).rejects.toThrow('完整解码');
  });

  it('decodes animation frames and rejects excessive frame counts', async () => {
    async function animation(frames: number) {
      const raw = Buffer.alloc(2 * 2 * 3 * frames);
      for (let i = 0; i < frames; i++) raw.fill(i, i * 12, (i + 1) * 12);
      return sharp(raw, { raw: { width: 2, height: frames * 2, pageHeight: 2, channels: 3 } })
        .gif({ keepDuplicateFrames: true, interPaletteMaxError: 0 }).toBuffer();
    }
    await expect(validateImage(await animation(3))).resolves.toMatchObject({ width: 2, height: 2 });
    const excessive = await animation(201);
    expect((await sharp(excessive, { animated: true }).metadata()).pages).toBe(201);
    await expect(validateImage(excessive)).rejects.toThrow('动画帧数');
  });

  it('does not validate only the fallback frame of animated PNG', async () => {
    const staticPng = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
    const animationChunk = Buffer.alloc(20);
    animationChunk.writeUInt32BE(8); animationChunk.write('acTL', 4); animationChunk.writeUInt32BE(201, 8);
    await expect(validateImage(Buffer.concat([staticPng.subarray(0, 33), animationChunk, staticPng.subarray(33)]))).rejects.toThrow('APNG');
  });
  it('detects image type from bytes and reads dimensions', () => {
    expect(inspectImage(png())).toEqual({ mimeType: 'image/png', extension: 'png', width: 640, height: 360 });
    expect(inspectImage(jpeg())).toEqual({ mimeType: 'image/jpeg', extension: 'jpg', width: 800, height: 600 });
  });

  it('rejects SVG, HTML and extension-only spoofing', () => {
    expect(() => inspectImage(Buffer.from('<svg onload="alert(1)"></svg>'))).toThrow(BadRequestException);
    expect(() => inspectImage(Buffer.from('<html>not an image</html>'))).toThrow(BadRequestException);
    expect(() => inspectImage(Buffer.concat([png().subarray(0, 24), Buffer.from('fake')]))).toThrow(BadRequestException);
  });

  it('rejects decompression-bomb dimensions', () => {
    expect(() => inspectImage(png(10_000, 5_000))).toThrow('总像素超过 4000 万');
  });

  it('normalizes metadata without accepting paths or unsafe folders', () => {
    expect(safeOriginalName('../../海报.png\r\n')).toBe('海报.png');
    expect(safeOriginalName('C:\\fakepath\\海报.png')).toBe('海报.png');
    expect(() => encodeURIComponent(safeOriginalName('a\ud800.png'))).not.toThrow();
    expect(normalizeMediaFolder('  HERO_2026 ')).toBe('hero_2026');
    expect(normalizeAltText('  首页海报  ')).toBe('首页海报');
    expect(() => normalizeMediaFolder('../private')).toThrow(BadRequestException);
    expect(() => normalizeAltText('x'.repeat(301))).toThrow(BadRequestException);
  });
});

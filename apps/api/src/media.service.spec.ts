import { createHash } from 'node:crypto';
import { MediaService } from './media.service';
import sharp = require('sharp');
import * as mediaFile from './media-file';

function png() {
  const value = Buffer.alloc(45);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(value);
  value.writeUInt32BE(13, 8); value.write('IHDR', 12, 'ascii');
  value.writeUInt32BE(16, 16); value.writeUInt32BE(16, 20);
  value.write('IEND', value.length - 8, 'ascii');
  return value;
}

describe('MediaService security boundaries', () => {
  async function uploadFixture() {
    const buffer = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
    return { buffer, size: buffer.length, originalname: 'test.png', mimetype: 'image/png' };
  }

  it.each(['absent', 'committed', 'unreachable'])('handles transaction failure with %s commit state without blind deletion', async state => {
    const storage = { write: jest.fn().mockResolvedValue(undefined), remove: jest.fn().mockResolvedValue(undefined) };
    const findUnique = state === 'unreachable' ? jest.fn().mockRejectedValue(new Error('database offline')) : jest.fn().mockResolvedValue(state === 'committed' ? { id: 'saved' } : null);
    const db = { $transaction: jest.fn().mockRejectedValue(new Error('connection lost')), mediaAsset: { findUnique } };
    const service = new MediaService(db as any, storage as any);
    const result = service.upload(await uploadFixture(), {}, { id: 'admin' } as any, {});
    if (state === 'committed') await expect(result).resolves.toMatchObject({ id: 'saved', publicUrl: '/api/v1/public/media/saved' });
    else await expect(result).rejects.toThrow('connection lost');
    expect(storage.write).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledTimes(state === 'absent' ? 1 : 0);
  });

  it('validates metadata before writing any file', async () => {
    const storage = { write: jest.fn() };
    const service = new MediaService({} as any, storage as any);
    await expect(service.upload(await uploadFixture(), { folder: '../private' }, { id: 'admin' } as any, {})).rejects.toThrow('文件夹');
    expect(storage.write).not.toHaveBeenCalled();
  });

  it('bounds simultaneous decoders and releases capacity after validation fails', async () => {
    let rejectDecode!: (error: Error) => void;
    const pending = new Promise<any>((_resolve, reject) => { rejectDecode = reject; });
    const validator = jest.spyOn(mediaFile, 'validateImage').mockReturnValue(pending);
    const storage = { write: jest.fn() }, service = new MediaService({} as any, storage as any);
    const file = await uploadFixture();
    try {
      const first = service.upload(file, {}, { id: 'admin' } as any, {}).catch(error => error);
      const second = service.upload(file, {}, { id: 'admin' } as any, {}).catch(error => error);
      await expect(service.upload(file, {}, { id: 'admin' } as any, {})).rejects.toThrow('验证繁忙');
      rejectDecode(new Error('invalid pixels')); await Promise.all([first, second]);
      validator.mockRejectedValue(new Error('decoder called again'));
      await expect(service.upload(file, {}, { id: 'admin' } as any, {})).rejects.toThrow('decoder called again');
      expect(storage.write).not.toHaveBeenCalled();
    } finally { validator.mockRestore(); }
  });

  it('returns 409 for serialized metadata conflicts rather than losing audit ordering', async () => {
    const db = { $transaction: jest.fn().mockRejectedValue({ code: 'P2034' }) };
    const service = new MediaService(db as any, {} as any);
    await expect(service.update('asset', { altText: 'x' }, { id: 'admin' } as any, {})).rejects.toMatchObject({ status: 409 });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });

  it('does not expose private storage keys on list responses', async () => {
    const db = { mediaAsset: { findMany: jest.fn(), count: jest.fn() }, $transaction: jest.fn().mockResolvedValue([[{ id: 'asset', storageKey: 'private', originalName: 'a.png' }], 1]) };
    const service = new MediaService(db as any, {} as any);
    const result = await service.list({ page: 1, limit: 30, state: 'active' });
    expect(result.items[0]).not.toHaveProperty('storageKey');
    expect(result.items[0].publicUrl).toBe('/api/v1/public/media/asset');
  });
  it('rejects a declared MIME type that disagrees with inspected bytes', async () => {
    const service = new MediaService({} as any, {} as any);
    const buffer = png();
    await expect(service.upload({ buffer, size: buffer.length, originalname: 'x.jpg', mimetype: 'image/jpeg' }, {}, { id: 'admin' } as any, {}))
      .rejects.toThrow('声明的文件类型与实际图片内容不一致');
  });

  it('serves bytes only when size and SHA-256 still match metadata', async () => {
    const bytes = Buffer.from('immutable');
    const asset = { id: 'asset', storageKey: 'aa/key.png', byteSize: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    const service = new MediaService({ mediaAsset: { findUnique: jest.fn().mockResolvedValue(asset) } } as any, { read: jest.fn().mockResolvedValue(bytes) } as any);
    await expect(service.publicAsset('asset')).resolves.toEqual({ asset, bytes });
  });

  it('refuses corrupted storage bytes', async () => {
    const asset = { id: 'asset', storageKey: 'aa/key.png', byteSize: 9, sha256: '0'.repeat(64) };
    const service = new MediaService({ mediaAsset: { findUnique: jest.fn().mockResolvedValue(asset) } } as any, { read: jest.fn().mockResolvedValue(Buffer.from('corrupted')) } as any);
    await expect(service.publicAsset('asset')).rejects.toThrow('媒体文件完整性校验失败');
  });
});

import { mkdtemp, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MediaStorageService } from './media-storage.service';

describe('MediaStorageService', () => {
  let directory: string;
  let storage: MediaStorageService;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'appgog-media-'));
    storage = new MediaStorageService({ get: () => directory } as any);
  });
  afterEach(() => rm(directory, { recursive: true, force: true }));

  it('writes and reads only opaque storage keys', async () => {
    const key = 'aa/00000000-0000-4000-8000-000000000000.png';
    await storage.write(key, Buffer.from('bytes'));
    await expect(storage.read(key)).resolves.toEqual(Buffer.from('bytes'));
  });

  it('rejects traversal and arbitrary extensions before filesystem access', async () => {
    await expect(storage.read('../secret.png')).rejects.toThrow('非法媒体存储键');
    await expect(storage.read('aa/00000000-0000-4000-8000-000000000000.svg')).rejects.toThrow('非法媒体存储键');
  });

  it('does not overwrite existing bytes and enforces read size before allocation', async () => {
    const key = 'aa/00000000-0000-4000-8000-000000000000.png';
    await storage.write(key, Buffer.from('original'));
    await expect(storage.write(key, Buffer.from('replacement'))).rejects.toThrow();
    await expect(storage.read(key, 8)).resolves.toEqual(Buffer.from('original'));
    await expect(storage.read(key, 1)).rejects.toThrow('大小异常');
  });

  it('rejects a shard junction/symlink even though the lexical key is valid', async () => {
    const outside = join(directory, 'other'); await mkdir(outside);
    await symlink(outside, join(directory, 'aa'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(storage.write('aa/00000000-0000-4000-8000-000000000000.png', Buffer.from('bad'))).rejects.toThrow('符号链接');
  });
});

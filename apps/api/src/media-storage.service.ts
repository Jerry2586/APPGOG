import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, resolve, sep } from 'node:path';
import { MAX_MEDIA_BYTES } from './media-file';

@Injectable()
export class MediaStorageService {
  readonly baseDirectory: string;

  constructor(config: ConfigService) {
    const configured = config.get<string>('MEDIA_STORAGE_DIR')?.trim() || join('data', 'media');
    this.baseDirectory = resolve(isAbsolute(configured) ? configured : join(process.cwd(), configured));
    if (this.baseDirectory === parse(this.baseDirectory).root) throw new Error('媒体目录不能是磁盘根目录');
  }

  private filePath(storageKey: string) {
    if (!/^[a-f0-9]{2}\/[a-f0-9-]{36}\.(jpg|png|gif|webp)$/.test(storageKey)) throw new Error('非法媒体存储键');
    const target = resolve(this.baseDirectory, storageKey);
    if (!target.startsWith(this.baseDirectory + sep)) throw new Error('媒体存储路径越界');
    return target;
  }

  async write(storageKey: string, bytes: Buffer) {
    const target = await this.checkedPath(storageKey, true);
    const file = await open(target, 'wx', 0o600);
    try { await file.writeFile(bytes); await file.sync(); }
    catch (error) {
      await file.close();
      await this.remove(storageKey);
      throw error;
    }
    await file.close();
  }

  private async checkedPath(storageKey: string, create = false) {
    const target = this.filePath(storageKey);
    if (create) await mkdir(this.baseDirectory, { recursive: true });
    if ((await lstat(this.baseDirectory)).isSymbolicLink()) throw new Error('媒体根目录不能是符号链接');
    const parent = dirname(target);
    if (create) await mkdir(parent).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const parentStat = await lstat(parent);
    if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) throw new Error('媒体分片目录不能是符号链接');
    const base = await realpath(this.baseDirectory), resolved = await realpath(parent);
    if (resolved !== join(base, storageKey.split('/')[0])) throw new Error('媒体实际存储路径越界');
    return target;
  }

  async read(storageKey: string, expectedSize?: number) {
    const target = await this.checkedPath(storageKey);
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error('媒体文件类型无效');
    const file = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const stat = await file.stat();
      if (stat.size < 1 || stat.size > MAX_MEDIA_BYTES || (expectedSize !== undefined && stat.size !== expectedSize)) throw new Error('媒体文件大小异常');
      const bytes = Buffer.alloc(stat.size);
      let offset = 0;
      while (offset < bytes.length) {
        const chunk = await file.read(bytes, offset, bytes.length - offset, offset);
        if (!chunk.bytesRead) throw new Error('媒体文件被截断');
        offset += chunk.bytesRead;
      }
      if ((await file.stat()).size !== stat.size) throw new Error('媒体文件大小发生变化');
      return bytes;
    } finally { await file.close(); }
  }

  async remove(storageKey: string) {
    let target: string;
    try { target = await this.checkedPath(storageKey); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    await rm(target, { force: true });
  }
}

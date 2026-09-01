import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import type { AdminPrincipal } from './auth.types';
import { operationData, type OperationKind } from './operations-validation';
import { OperationListDto, OperationSaveDto, PluginRestoreDto, ThemeActivateDto } from './operations.dto';

@Injectable()
export class OperationsService {
  constructor(private db: PrismaService) {}
  private async transaction<T>(action: (tx: any) => Promise<T>): Promise<T> {
    try { return await this.db.$transaction(action, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error: any) {
      if (['P2002', 'P2034', 'P2004', 'P2003', 'P2025'].includes(error?.code) || error?.meta?.database_error?.includes('23P01')) throw new ConflictException('并发、重名、关联或调度冲突，请刷新后重试');
      throw error;
    }
  }
  private async audit(tx: any, actor: AdminPrincipal | undefined, action: string, kind: string, id: string, detail: any) {
    await tx.auditLog.create({ data: { adminUserId: actor?.id ?? null, action, resource: kind, resourceId: id, detail } });
  }
  private async row(tx: any, kind: OperationKind, id: string, revision?: number) {
    const row = await tx[kind].findUnique({ where: { id } });
    if (!row) throw new NotFoundException('记录不存在');
    if (revision !== undefined && row.revision !== revision) throw new ConflictException('记录已被修改，请刷新后重试');
    return row;
  }
  async list(kind: OperationKind, query: OperationListDto) {
    const where = kind === 'themeSchedule' ? {} : query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {};
    return this.transaction(async tx => {
      const items = await tx[kind].findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (query.page - 1) * query.limit, take: query.limit });
      return { items: items.map((item: any) => kind === 'pluginSnippet' ? { ...item, code: undefined } : item), total: await tx[kind].count({ where }), page: query.page, limit: query.limit };
    });
  }
  get(kind: OperationKind, id: string) { return this.row(this.db, kind, id); }
  async save(kind: OperationKind, id: string | undefined, dto: OperationSaveDto, actor: AdminPrincipal) {
    if ((!id && dto.baseRevision !== 0) || (id && dto.baseRevision < 1)) throw new BadRequestException('新增版本为 0，修改必须提供当前版本');
    const parsed = operationData(kind, dto.data);
    return this.transaction(async tx => {
      const before = id ? await this.row(tx, kind, id, dto.baseRevision) : null;
      if (!id && await tx[kind].count({ where: {} }) >= 1000) throw new BadRequestException('每类最多 1000 条，请先整理现有记录');
      if (kind === 'themeSchedule') {
        const target = await this.row(tx, 'theme', parsed.themeId);
        if (parsed.enabled) operationData('theme', { name: target.name, mode: target.mode, variables: target.variables, effects: target.effects });
        if (parsed.enabled && await tx.themeSchedule.findFirst({ where: { id: { not: id }, enabled: true, startAt: { lt: parsed.endAt }, endAt: { gt: parsed.startAt } } })) throw new ConflictException('已启用的主题调度时间窗不能重叠；结束时刻可与下一任务开始时刻相同');
      }
      const { changeNote, ...data } = parsed;
      if (kind === 'pluginSnippet' && parsed.enabled) {
        const enabled = await tx.pluginSnippet.findMany({ where: { enabled: true, id: { not: id } } });
        const bytes = enabled.reduce((sum: number, item: any) => sum + Buffer.byteLength(item.code, 'utf8'), Buffer.byteLength(parsed.code, 'utf8'));
        if (enabled.length >= 16 || bytes > 512 * 1024) throw new BadRequestException('同时启用最多 16 个插件，代码总量不能超过 512 KiB');
      }
      const row = id ? await tx[kind].update({ where: { id, revision: dto.baseRevision }, data: { ...data, revision: { increment: 1 } } }) : await tx[kind].create({ data: { ...data, revision: 1, ...(kind === 'theme' ? { active: false } : {}) } });
      if (kind === 'pluginSnippet') await this.pluginVersion(tx, row, actor, changeNote);
      await this.audit(tx, actor, `${kind.toUpperCase()}_${id ? 'UPDATED' : 'CREATED'}`, kind, row.id, { revision: row.revision, previousRevision: before?.revision ?? null, ...(kind === 'pluginSnippet' ? { changeNote, enabled: row.enabled, position: row.position, delayMs: row.delayMs } : {}) });
      if (kind === 'theme' || kind === 'themeSchedule') await this.reconcile(tx, new Date());
      return row;
    });
  }
  private pluginVersion(tx: any, row: any, actor: AdminPrincipal, changeNote: string) {
    return tx.pluginSnippetVersion.create({ data: { pluginSnippetId: row.id, version: row.revision, position: row.position, code: row.code, delayMs: row.delayMs, enabled: row.enabled, createdById: actor.id, changeNote } });
  }
  async remove(kind: OperationKind, id: string, revision: number, actor: AdminPrincipal) {
    if (kind === 'pluginSnippet') throw new BadRequestException('插件保留不可变历史，请使用紧急停用');
    return this.transaction(async tx => {
      await this.row(tx, kind, id, revision);
      if (kind === 'theme') {
        const state = await this.state(tx);
        if (state.defaultThemeId === id || await tx.themeSchedule.count({ where: { themeId: id } })) throw new ConflictException('默认主题或仍被调度引用的主题不能删除');
      }
      await tx[kind].delete({ where: { id } });
      await this.audit(tx, actor, `${kind.toUpperCase()}_DELETED`, kind, id, { revision });
      if (kind === 'theme' || kind === 'themeSchedule') await this.reconcile(tx, new Date());
      return { deleted: true };
    });
  }
  private async state(tx: any) {
    return await tx.themeState.findUnique({ where: { id: 'main' } }) ?? { id: 'main', revision: 0, defaultThemeId: null };
  }
  private async selection(tx: any, now: Date) {
    const state = await this.state(tx);
    const schedule = await tx.themeSchedule.findFirst({ where: { enabled: true, startAt: { lte: now }, endAt: { gt: now } }, orderBy: [{ startAt: 'desc' }, { id: 'asc' }] });
    const themeId = schedule?.themeId ?? state.defaultThemeId;
    const theme = themeId ? await tx.theme.findUnique({ where: { id: themeId } }) : null;
    return { state, schedule, theme };
  }
  async status() {
    return this.transaction(async tx => { const selected = await this.selection(tx, new Date()); return { ...selected, serverTime: new Date().toISOString(), rule: 'enabled schedules use [start,end); overlap rejected; schedule overrides manual default; end restores default' }; });
  }
  async activate(id: string, dto: ThemeActivateDto, actor: AdminPrincipal) {
    return this.transaction(async tx => {
      const theme = await this.row(tx, 'theme', id, dto.baseRevision);
      operationData('theme', { name: theme.name, mode: theme.mode, variables: theme.variables, effects: theme.effects });
      const state = await this.state(tx);
      if (state.revision !== dto.baseStateRevision) throw new ConflictException('默认主题已变更，请刷新');
      const next = await tx.themeState.upsert({ where: { id: 'main' }, create: { id: 'main', defaultThemeId: id, revision: 1 }, update: { defaultThemeId: id, revision: { increment: 1 } } });
      await this.audit(tx, actor, 'THEME_DEFAULT_CHANGED', 'theme', id, { previousThemeId: state.defaultThemeId, stateRevision: next.revision });
      await this.reconcile(tx, new Date());
      return next;
    });
  }
  // Configuration changes and active-flag transitions share a serializable transaction.
  private async reconcile(tx: any, now: Date) {
    const { theme, schedule } = await this.selection(tx, now);
    const current = await tx.theme.findFirst({ where: { active: true } });
    if ((current?.id ?? null) === (theme?.id ?? null)) return;
    await tx.theme.updateMany({ where: { active: true }, data: { active: false } });
    if (theme) await tx.theme.update({ where: { id: theme.id }, data: { active: true } });
    await this.audit(tx, undefined, 'THEME_EFFECTIVE_CHANGED', 'theme', theme?.id ?? 'built-in', { previousThemeId: current?.id ?? null, scheduleId: schedule?.id ?? null });
  }
  applySchedule(now = new Date()) { return this.transaction(tx => this.reconcile(tx, now)); }
  async versions(id: string, query: OperationListDto) {
    await this.row(this.db, 'pluginSnippet', id);
    return this.transaction(async tx => ({ items: await tx.pluginSnippetVersion.findMany({ where: { pluginSnippetId: id }, orderBy: { version: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }), total: await tx.pluginSnippetVersion.count({ where: { pluginSnippetId: id } }), page: query.page, limit: query.limit }));
  }
  async disable(id: string, revision: number, actor: AdminPrincipal) {
    return this.transaction(async tx => {
      const current = await this.row(tx, 'pluginSnippet', id, revision);
      const row = await tx.pluginSnippet.update({ where: { id, revision }, data: { enabled: false, revision: { increment: 1 } } });
      await this.pluginVersion(tx, row, actor, '紧急停用');
      await this.audit(tx, actor, 'PLUGIN_DISABLED', 'pluginSnippet', id, { previousEnabled: current.enabled, revision: row.revision });
      return row;
    });
  }
  async restore(id: string, dto: PluginRestoreDto, actor: AdminPrincipal) {
    return this.transaction(async tx => {
      const current = await this.row(tx, 'pluginSnippet', id, dto.baseRevision);
      const version = await tx.pluginSnippetVersion.findFirst({ where: { id: dto.versionId, pluginSnippetId: id } });
      if (!version) throw new NotFoundException('插件历史版本不存在或归属不匹配');
      const parsed = operationData('pluginSnippet', { name: current.name, position: version.position, code: version.code, delayMs: version.delayMs, enabled: false, changeNote: dto.changeNote, acknowledgeRisk: dto.acknowledgeRisk });
      const { changeNote, ...data } = parsed;
      const row = await tx.pluginSnippet.update({ where: { id, revision: dto.baseRevision }, data: { ...data, revision: { increment: 1 } } });
      await this.pluginVersion(tx, row, actor, changeNote);
      await this.audit(tx, actor, 'PLUGIN_RESTORED_DISABLED', 'pluginSnippet', id, { sourceVersionId: version.id, revision: row.revision, changeNote });
      return row;
    });
  }
  async publicData() {
    return this.transaction(async tx => {
      const now = new Date(), selected = await this.selection(tx, now);
      let theme = null;
      try { if (selected.theme) theme = { id: selected.theme.id, revision: selected.theme.revision, ...operationData('theme', { name: selected.theme.name, mode: selected.theme.mode, variables: selected.theme.variables, effects: selected.theme.effects }) }; } catch { /* Invalid legacy CSS is never emitted. */ }
      const rows = await tx.marketingCampaign.findMany({ where: { enabled: true, AND: [{ OR: [{ startAt: null }, { startAt: { lte: now } }] }, { OR: [{ endAt: null }, { endAt: { gt: now } }] }] }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 1000 });
      const campaigns = rows.flatMap((row: any) => { try { return [{ id: row.id, revision: row.revision, ...operationData('marketingCampaign', { name: row.name, kind: row.kind, config: row.config, startAt: row.startAt?.toISOString() ?? null, endAt: row.endAt?.toISOString() ?? null, timezone: row.timezone, enabled: row.enabled }) }]; } catch { return []; } });
      const plugins = await tx.pluginSnippet.findMany({ where: { enabled: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 1000 });
      const snippets = plugins.filter((row: any) => ['HEAD', 'BODY_END'].includes(row.position) && row.delayMs >= 3000 && row.delayMs <= 60000 && row.code.length <= 100000).map((row: any) => ({ id: row.id, revision: row.revision, position: row.position, code: row.code, delayMs: Math.max(3000, row.delayMs) }));
      return { theme, campaigns, snippets, serverTime: now.toISOString() };
    });
  }
}

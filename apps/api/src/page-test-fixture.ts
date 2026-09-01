// Opt-in isolated tests only. Not a substitute for PostgreSQL transaction tests.
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { cmsDatabaseFixture } from './cms-test-fixture';

export function pageDatabaseFixture() {
  const db = cmsDatabaseFixture();
  let state: Record<string, any[]> = { page: [], pageVersion: [], publishedPageRoute: [] };
  const originalRows = db.rows, originalReset = db.reset, originalTransaction = db.$transaction;
  const match = (row: any, where: any = {}) => Object.entries(where).every(([key, value]) => row[key] === value);
  db.rows = (name: string) => name in state ? state[name] : originalRows(name);
  db.reset = () => { originalReset(); for (const name of Object.keys(state)) state[name] = []; };
  db.$transaction = async (action: any, options: any) => {
    const snapshot = structuredClone(state);
    try { return await originalTransaction(action, options); } catch (error) { state = snapshot; throw error; }
  };
  const decorate = (name: string, row: any, include: any = {}) => {
    if (!row) return null;
    const value = structuredClone(row);
    if (name === 'page') {
      if (include.draftVersion) value.draftVersion = structuredClone(state.pageVersion.find(v => v.id === row.draftVersionId) || null);
      if (include.publishedVersion) value.publishedVersion = structuredClone(state.pageVersion.find(v => v.id === row.publishedVersionId) || null);
      if (include.publishedRoute) value.publishedRoute = structuredClone(state.publishedPageRoute.find(v => v.pageId === row.id) || null);
    }
    if (name === 'publishedPageRoute') {
      if (include.page) value.page = structuredClone(state.page.find(v => v.id === row.pageId));
      if (include.pageVersion) value.pageVersion = structuredClone(state.pageVersion.find(v => v.id === row.pageVersionId));
    }
    return value;
  };
  for (const name of Object.keys(state)) {
    const check = (row: any) => {
      if (name !== 'pageVersion' && state[name].some(v => v.id !== row.id && (v.slug === row.slug || name === 'publishedPageRoute' && v.pageId === row.pageId)))
        throw new Prisma.PrismaClientKnownRequestError('duplicate route', { code: 'P2002', clientVersion: 'test' });
    };
    db[name] = {
      findMany: async ({ where, include, orderBy }: any = {}) => {
        const rows = state[name].filter(row => match(row, where)).map(row => decorate(name, row, include));
        if (orderBy?.version === 'desc') rows.sort((a, b) => b.version - a.version);
        return rows;
      },
      findUnique: async ({ where, include }: any) => decorate(name, state[name].find(row => match(row, where)), include),
      findFirst: async (args: any) => (await db[name].findMany(args))[0] || null,
      create: async ({ data }: any) => {
        const row = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), draftVersionId: null, publishedVersionId: null, ...structuredClone(data) };
        check(row); state[name].push(row); return structuredClone(row);
      },
      update: async ({ where, data }: any) => {
        const row = state[name].find(row => match(row, where)); if (!row) throw new Error('missing record');
        const next = { ...row, ...data };
        for (const [key, value] of Object.entries(data) as any) if (value && typeof value === 'object' && 'increment' in value) next[key] = row[key] + value.increment;
        check(next); Object.assign(row, structuredClone(next)); return structuredClone(row);
      },
      deleteMany: async ({ where }: any) => { const count = state[name].filter(row => match(row, where)).length; state[name] = state[name].filter(row => !match(row, where)); return { count }; },
      delete: async ({ where }: any) => {
        const row = state[name].find(row => match(row, where)); await db[name].deleteMany({ where });
        if (name === 'page' && row) for (const relation of ['pageVersion', 'publishedPageRoute']) state[relation] = state[relation].filter(v => v.pageId !== row.id);
        return row;
      }
    };
  }
  return db;
}

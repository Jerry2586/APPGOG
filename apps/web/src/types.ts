export type Block = { id: string; type: string; props: Record<string, any>; children: Block[] };
export type ComponentControl = 'text' | 'textarea' | 'url' | 'number' | 'boolean' | 'select' | 'url-list' | 'json';
export type ComponentField = { key: string; label: string; control: ComponentControl; options?: string[]; min?: number; max?: number };
export type ComponentDefinition = {
  type: string; label: string; group: string; container: boolean;
  dataDependency: 'NONE' | 'CMS' | 'CATALOG' | 'AI';
  defaults: Record<string, unknown>; fields: ComponentField[];
};
export type ComponentManifest = { schemaVersion: number; components: ComponentDefinition[] };

export function newBlock(type: string, defaults: Record<string, unknown> = {}): Block {
  // Component props are schema-validated JSON. structuredClone rejects Vue proxies.
  return { id: crypto.randomUUID(), type, props: JSON.parse(JSON.stringify(defaults)), children: [] };
}

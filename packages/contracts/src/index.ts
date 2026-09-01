/** Public HTTP(S) destination. It is data only and must never be fetched by APPGOG servers. */
export type ExternalLink = {
  label: string;
  url: string;
  openInNewWindow: boolean;
};

export type XboardOutboundLinks = {
  login: ExternalLink;
  register: ExternalLink;
  purchase: ExternalLink;
  dashboard: ExternalLink;
  ticket: ExternalLink;
  affiliate?: ExternalLink;
};

export type ApiEnvelope<T> = {
  data: T;
  requestId: string;
};

export type HealthStatus = {
  service: 'APPGOG API';
  status: 'ok' | 'degraded';
  timestamp: string;
  checks?: {
    process: 'ok';
    database?: 'ok' | 'unavailable';
  };
};

export const PAGE_LAYOUT_SCHEMA_VERSION = 1 as const;

export const PAGE_BLOCK_TYPES = [
  'grid', 'hero', 'carousel', 'button', 'products', 'cart', 'sale', 'ai',
  'categories', 'contents', 'faq', 'popup', 'countdown', 'particles',
  'globe', 'header', 'footer', 'breadcrumb'
] as const;

export type PageBlockType = (typeof PAGE_BLOCK_TYPES)[number];

export type PageBlock = {
  id: string;
  type: PageBlockType;
  props: Record<string, unknown>;
  children: PageBlock[];
};

export type PageLayout = PageBlock[];

export type PageRouteType = 'PAGE' | 'REDIRECT';
export type PagePublishStatus = 'DRAFT' | 'PUBLISHED' | 'OFFLINE' | 'ARCHIVED';

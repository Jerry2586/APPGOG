export const ADMIN_ROLES = ['VIEWER', 'EDITOR', 'ADMIN', 'SUPER_ADMIN'] as const;
export type AdminRoleName = (typeof ADMIN_ROLES)[number];

export type AccessTokenPayload = {
  sub: string;
  sid: string;
  role: AdminRoleName;
  type: 'access';
};

export type AdminPrincipal = {
  id: string;
  sessionId: string;
  email: string;
  displayName: string;
  role: AdminRoleName;
};

export const ADMIN_REFRESH_COOKIE = 'appgog_admin_refresh';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

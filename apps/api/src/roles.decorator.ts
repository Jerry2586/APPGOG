import { SetMetadata } from '@nestjs/common';
import type { AdminRoleName } from './auth.types';

export const ADMIN_ROLES_METADATA = 'appgog:admin-roles';
export const Roles = (...roles: AdminRoleName[]) => SetMetadata(ADMIN_ROLES_METADATA, roles);

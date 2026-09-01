import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { Request } from 'express';
import { AdminSecurityService } from './admin-security.service';
import { AdminGuard } from './auth.guard';
import type { AdminPrincipal } from './auth.types';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

class CreateAdminAccountDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName!: string;

  @IsString()
  @MinLength(16)
  @MaxLength(128)
  password!: string;

  @IsEnum(AdminRole)
  role!: AdminRole;
}

class UpdateAdminAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName?: string;

  @IsOptional()
  @IsEnum(AdminRole)
  role?: AdminRole;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

class ResetAdminPasswordDto {
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  password!: string;
}

class AuditQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 100;
}

@Controller('admin/security')
@UseGuards(AdminGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class AdminSecurityController {
  constructor(private security: AdminSecurityService) {}

  private principal(request: Request) {
    return (request as Request & { user: AdminPrincipal }).user;
  }

  private metadata(request: Request) {
    return { ip: request.ip, userAgent: request.get('user-agent') };
  }

  @Get('accounts')
  accounts() {
    return this.security.listAccounts();
  }

  @Post('accounts')
  createAccount(@Body() dto: CreateAdminAccountDto, @Req() request: Request) {
    return this.security.createAccount(this.principal(request), dto, this.metadata(request));
  }

  @Patch('accounts/:id')
  updateAccount(@Param('id') id: string, @Body() dto: UpdateAdminAccountDto, @Req() request: Request) {
    return this.security.updateAccount(this.principal(request), id, dto, this.metadata(request));
  }

  @Post('accounts/:id/password')
  @HttpCode(204)
  resetPassword(@Param('id') id: string, @Body() dto: ResetAdminPasswordDto, @Req() request: Request) {
    return this.security.resetPassword(this.principal(request), id, dto.password, this.metadata(request));
  }

  @Get('accounts/:id/sessions')
  accountSessions(@Param('id') id: string) {
    return this.security.listAccountSessions(id);
  }

  @Delete('accounts/:accountId/sessions/:sessionId')
  @HttpCode(204)
  revokeAccountSession(
    @Param('accountId') accountId: string,
    @Param('sessionId') sessionId: string,
    @Req() request: Request
  ) {
    return this.security.revokeAccountSession(this.principal(request), accountId, sessionId, this.metadata(request));
  }

  @Get('audit')
  @Roles('ADMIN', 'SUPER_ADMIN')
  audit(@Query() query: AuditQueryDto) {
    return this.security.listAuditLogs(query.limit);
  }
}

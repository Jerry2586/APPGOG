import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { AdminOriginGuard } from './admin-origin.guard';
import { AdminGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { ADMIN_REFRESH_COOKIE, type AdminPrincipal } from './auth.types';

class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MaxLength(128)
  password!: string;
}

class ChangePasswordDto {
  @IsString()
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(16)
  @MaxLength(128)
  nextPassword!: string;
}

@Controller('auth/admin')
@UseGuards(AdminOriginGuard)
export class AuthController {
  constructor(private auth: AuthService, private config: ConfigService) {}

  private refreshToken(request: Request) {
    const cookies = request.headers.cookie?.split(';') ?? [];
    for (const item of cookies) {
      const separator = item.indexOf('=');
      if (separator < 0) continue;
      const name = item.slice(0, separator).trim();
      // The issued UUID/base64url token never needs URL decoding. Returning the
      // cookie value directly also prevents malformed percent escapes from
      // turning an unauthenticated request into a 500 response.
      if (name === ADMIN_REFRESH_COOKIE) return item.slice(separator + 1);
    }
    return undefined;
  }

  private setRefreshCookie(response: Response, token: string, expiresAt: Date) {
    response.cookie(ADMIN_REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth/admin',
      expires: expiresAt,
      maxAge: Math.max(0, expiresAt.getTime() - Date.now())
    });
    response.setHeader('Cache-Control', 'no-store');
  }

  private clearRefreshCookie(response: Response) {
    response.clearCookie(ADMIN_REFRESH_COOKIE, {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth/admin'
    });
    response.setHeader('Cache-Control', 'no-store');
  }

  private publicResult(result: Awaited<ReturnType<AuthService['adminLogin']>>) {
    const { refreshToken, refreshExpiresAt, ...body } = result;
    return { refreshToken, refreshExpiresAt, body };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = this.publicResult(await this.auth.adminLogin(dto.email, dto.password, request.ip || 'unknown', request.get('user-agent')));
    this.setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);
    return result.body;
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = this.publicResult(await this.auth.refresh(this.refreshToken(request)));
    this.setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);
    return result.body;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(this.refreshToken(request));
    this.clearRefreshCookie(response);
  }

  @Get('me')
  @UseGuards(AdminGuard)
  me(@Req() request: Request) {
    return (request as Request & { user: AdminPrincipal }).user;
  }

  @Get('sessions')
  @UseGuards(AdminGuard)
  sessions(@Req() request: Request) {
    return this.auth.listSessions((request as Request & { user: AdminPrincipal }).user);
  }

  @Delete('sessions/:id')
  @UseGuards(AdminGuard)
  @HttpCode(204)
  revokeSession(@Param('id') id: string, @Req() request: Request) {
    return this.auth.revokeSession((request as Request & { user: AdminPrincipal }).user, id);
  }

  @Post('sessions/revoke-all')
  @UseGuards(AdminGuard)
  @HttpCode(204)
  async revokeAll(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.revokeAllSessions((request as Request & { user: AdminPrincipal }).user);
    this.clearRefreshCookie(response);
  }

  @Post('password')
  @UseGuards(AdminGuard)
  @HttpCode(204)
  async changePassword(@Body() dto: ChangePasswordDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.changeOwnPassword(
      (request as Request & { user: AdminPrincipal }).user,
      dto.currentPassword,
      dto.nextPassword
    );
    this.clearRefreshCookie(response);
  }
}

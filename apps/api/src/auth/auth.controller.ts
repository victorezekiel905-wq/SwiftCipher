import { Body, Controller, Get, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, RegisterPlatformOwnerDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register-platform-owner')
  registerPlatformOwner(@Body() dto: RegisterPlatformOwnerDto) {
    return this.authService.registerPlatformOwner(dto);
  }

  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Headers('x-tenant-id') tenantId = 'system',
    @Req() req: Request,
  ) {
    return this.authService.login(dto, tenantId, {
      label: req.header('x-device-label') ?? 'web-session',
      ipAddress: req.ip,
      userAgent: req.header('user-agent') ?? undefined,
    });
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request & { user: { sub: string } }) {
    return this.authService.me(req.user.sub);
  }
}

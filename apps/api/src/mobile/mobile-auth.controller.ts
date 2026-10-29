import { MobileResponseInterceptor } from "./mobile-response.interceptor";
import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  UseInterceptors,
} from "@nestjs/common";
import {
  MobileAuthService,
  assertNativeTransport,
} from "./mobile-auth.service";
export type MobileRequest = {
  ip: string;
  headers: { origin?: string; cookie?: string; authorization?: string };
};
@UseInterceptors(MobileResponseInterceptor)
@Controller("mobile/auth")
export class MobileAuthController {
  constructor(
    @Inject(MobileAuthService) private readonly auth: MobileAuthService,
  ) {}
  @Get("status") status() {
    return this.auth.status();
  }
  @Post("code") code(
    @Body() body: { phone?: unknown },
    @Req() req: MobileRequest,
  ) {
    assertNativeTransport(req.headers);
    return this.auth.code(body ?? {}, req.ip);
  }
  @Post("verify") verify(
    @Body() body: { challengeId?: unknown; code?: unknown },
    @Req() req: MobileRequest,
  ) {
    assertNativeTransport(req.headers);
    return this.auth.verify(body ?? {}, req.ip);
  }
  @Post("refresh") refresh(
    @Body() body: { refreshToken?: unknown },
    @Req() req: MobileRequest,
  ) {
    assertNativeTransport(req.headers);
    return this.auth.refresh(body?.refreshToken, req.ip);
  }
  @Post("logout") logout(
    @Body() body: { refreshToken?: unknown },
    @Req() req: MobileRequest,
  ) {
    assertNativeTransport(req.headers);
    return this.auth.logout(body?.refreshToken);
  }
  @Get("me") me(@Req() req: MobileRequest) {
    assertNativeTransport(req.headers);
    return this.auth.session(req.headers.authorization);
  }
}

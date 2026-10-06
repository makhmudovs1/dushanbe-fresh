import { Body, Controller, ForbiddenException, Get, HttpCode, HttpException, Inject, Post, Req, Res } from "@nestjs/common";
import { parse, serialize } from "cookie";
import { AuthService } from "./auth.service";
import { Roles, StaffRequest } from "./staff.guard";

type Response = { setHeader(name: string, value: string): void };
const secureCookie = () => process.env.NODE_ENV === "production" || process.env.STAFF_COOKIE_SECURE === "true";
export const cookieName = () => secureCookie() ? "__Secure-df_refresh" : "df_refresh";
export function refreshCookie(token: string, expiresAt = new Date(Date.now() + 7 * 86400000)) {
  return serialize(cookieName(), token, { httpOnly: true, secure: secureCookie(), sameSite: "lax", path: "/api/v1/auth", expires: token ? expiresAt : new Date(0), maxAge: token ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)) : 0 });
}

@Controller()
export class AuthController {
  private readonly attempts = new Map<string, { count: number; until: number }>();
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  private origin(request: StaffRequest) {
    if (request.headers.origin !== (process.env.WEB_ORIGIN ?? "http://localhost:3000")) throw new ForbiddenException("Недопустимый Origin.");
  }
  private token(request: StaffRequest) { return parse(request.headers.cookie ?? "")[cookieName()]; }
  private limit(request: StaffRequest, body: unknown) {
    const now = Date.now();
    for (const [key, value] of this.attempts) if (value.until <= now) this.attempts.delete(key);
    const email = body && typeof body === "object" && "email" in body ? String(body.email).trim().toLowerCase().slice(0, 254) : "";
    for (const key of [`ip:${request.ip}`, `email:${email}`]) {
      const entry = this.attempts.get(key) ?? { count: 0, until: now + 15 * 60000 };
      if (entry.count >= (key.startsWith("ip:") ? 100 : 10) || this.attempts.size >= 10000) throw new HttpException("Слишком много попыток. Повторите позже.", 429);
      entry.count++; this.attempts.set(key, entry);
    }
  }
  @Post("auth/admin/login") @HttpCode(200)
  async login(@Req() request: StaffRequest, @Res({ passthrough: true }) response: Response, @Body() body: unknown) {
    this.origin(request); this.limit(request, body);
    const { refreshToken, ...result } = await this.auth.login(body);
    response.setHeader("Set-Cookie", refreshCookie(refreshToken)); response.setHeader("Cache-Control", "no-store");
    return result;
  }
  @Post("auth/refresh") @HttpCode(200)
  async refresh(@Req() request: StaffRequest, @Res({ passthrough: true }) response: Response) {
    this.origin(request);
    const { refreshToken, expiresAt, ...result } = await this.auth.refresh(this.token(request));
    response.setHeader("Set-Cookie", refreshCookie(refreshToken, expiresAt)); response.setHeader("Cache-Control", "no-store");
    return result;
  }
  @Post("auth/logout") @HttpCode(204)
  async logout(@Req() request: StaffRequest, @Res({ passthrough: true }) response: Response) {
    this.origin(request); await this.auth.logout(this.token(request));
    response.setHeader("Set-Cookie", refreshCookie("")); response.setHeader("Cache-Control", "no-store");
  }
  @Get("me") @Roles("admin", "picker", "courier")
  me(@Req() request: StaffRequest, @Res({ passthrough: true }) response: Response) { response.setHeader("Cache-Control", "no-store"); return request.staff; }
}

import { Body, Controller, Get, Header, Headers, Inject, Post, Req, Res } from "@nestjs/common";
import { assertCustomerOrigin, CustomerAuthService } from "./customer-auth.service";

type Request = { ip: string; headers: { cookie?: string; origin?: string } };
type Response = { setHeader(name: string, value: string): void };

@Controller("customer-auth")
export class CustomerAuthController {
  constructor(@Inject(CustomerAuthService) private readonly auth: CustomerAuthService) {}
  @Get("status")
  status() { return this.auth.status(); }
  @Get("me")
  @Header("Cache-Control", "private, no-store")
  async me(@Res() res: Response & { json(value: unknown): void }, @Headers("cookie") cookie?: string) {
    res.setHeader("Cache-Control", "private, no-store");
    res.json(await this.auth.session(cookie));
  }
  @Post("code")
  code(@Body() body: { phone?: unknown }, @Req() req: Request) {
    assertCustomerOrigin(req.headers.origin);
    return this.auth.requestCode(body?.phone, req.ip);
  }
  @Post("verify")
  async verify(@Body() body: { challengeId?: unknown; code?: unknown }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    assertCustomerOrigin(req.headers.origin);
    const result = await this.auth.verify(body?.challengeId, body?.code, req.ip);
    res.setHeader("Set-Cookie", this.auth.cookie(result.token));
    res.setHeader("Cache-Control", "private, no-store");
    return result.user;
  }
  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    assertCustomerOrigin(req.headers.origin);
    await this.auth.logout(req.headers.cookie);
    res.setHeader("Set-Cookie", this.auth.cookie("", true));
    return { ok: true };
  }
}

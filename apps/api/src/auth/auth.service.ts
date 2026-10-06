import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { compare, hash } from "bcryptjs";
import { sign, verify, JwtPayload } from "jsonwebtoken";
import { PrismaService } from "../prisma/prisma.service";
import type { StaffUser } from "@dushanbe-fresh/shared";

const issuer = "dushanbe-fresh";
const audience = "staff";
const sessionDays = 7;
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const staffSelect = { id: true, email: true, name: true, roles: true, status: true } as const;
export function authSecret() {
  const secret = process.env.STAFF_JWT_SECRET;
  if (secret && Buffer.byteLength(secret) >= 32) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("STAFF_JWT_SECRET must contain at least 32 bytes");
  return "local-development-only-staff-key-not-for-deployment";
}
export function staffDto(user: { id: string; email: string | null; name: string | null; roles: StaffUser["roles"] }): StaffUser {
  return { id: user.id, email: user.email!, name: user.name, roles: user.roles };
}

@Injectable()
export class AuthService {
  private readonly secret = authSecret();
  // Unknown accounts still perform a password comparison.
  private readonly dummyHash = hash(randomBytes(32).toString("hex"), 12);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async login(value: unknown) {
    const body = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || email.length > 254 || !password || Buffer.byteLength(password) > 72) throw new UnauthorizedException("Неверный email или пароль.");
    const user = await this.prisma.user.findUnique({ where: { email } });
    const matches = await compare(password, user?.passwordHash ?? await this.dummyHash);
    if (!matches || !user?.passwordHash || user.status !== "active" || !user.roles.length) {
      throw new UnauthorizedException("Неверный email или пароль.");
    }
    const id = randomUUID();
    const refreshToken = `${id}.${randomBytes(32).toString("base64url")}`;
    await this.prisma.refreshSession.create({ data: { id, userId: user.id, tokenHash: digest(refreshToken), expiresAt: new Date(Date.now() + sessionDays * 86400000) } });
    return { ...this.result(staffDto(user), id), refreshToken };
  }

  private result(user: StaffUser, sessionId: string) {
    return { accessToken: sign({ sid: sessionId }, this.secret, { algorithm: "HS256", subject: user.id, issuer, audience, expiresIn: "10m" }), user };
  }

  async refresh(token?: string) {
    const id = this.sessionId(token);
    const session = await this.prisma.refreshSession.findUnique({ where: { id }, include: { user: true } });
    const now = new Date();
    if (!session || session.revokedAt || session.expiresAt <= now || session.tokenHash !== digest(token!) || session.user.status !== "active" || !session.user.roles.length) throw new UnauthorizedException();
    const refreshToken = `${id}.${randomBytes(32).toString("base64url")}`;
    // Compare-and-swap makes each refresh token single-use, even across concurrent requests.
    const rotated = await this.prisma.refreshSession.updateMany({ where: { id, tokenHash: digest(token!), revokedAt: null, expiresAt: { gt: now } }, data: { tokenHash: digest(refreshToken) } });
    if (rotated.count !== 1) throw new UnauthorizedException();
    return { ...this.result(staffDto(session.user), id), refreshToken, expiresAt: session.expiresAt };
  }

  async logout(token?: string) {
    if (!token) return;
    let id: string;
    try { id = this.sessionId(token); } catch { return; }
    await this.prisma.refreshSession.updateMany({ where: { id, tokenHash: digest(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private sessionId(token?: string) {
    if (!token || !/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(token)) throw new UnauthorizedException();
    return token.split(".")[0];
  }

  async authenticate(authorization?: string): Promise<StaffUser> {
    if (!authorization?.startsWith("Bearer ")) throw new UnauthorizedException();
    let payload: JwtPayload;
    try { payload = verify(authorization.slice(7), this.secret, { algorithms: ["HS256"], issuer, audience }) as JwtPayload; }
    catch { throw new UnauthorizedException(); }
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") throw new UnauthorizedException();
    const session = await this.prisma.refreshSession.findFirst({ where: { id: payload.sid, userId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } }, include: { user: { select: staffSelect } } });
    if (!session || session.user.status !== "active" || !session.user.roles.length) throw new UnauthorizedException();
    return staffDto(session.user);
  }
}

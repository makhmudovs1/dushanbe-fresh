import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { StaffRole, StaffUser } from "@dushanbe-fresh/shared";
import { AuthService } from "./auth.service";

export const Roles = (...roles: StaffRole[]) => SetMetadata("staffRoles", roles);
export type StaffRequest = { staff: StaffUser; headers: Record<string, string | undefined>; path: string; ip?: string };

@Injectable()
export class StaffGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(Reflector) private readonly reflector: Reflector) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<StaffRequest>();
    const roles = this.reflector.getAllAndOverride<StaffRole[]>("staffRoles", [context.getHandler(), context.getClass()]);
    // Fail closed for every admin endpoint, including future controllers without a decorator.
    if (!roles && !/^\/api\/v1\/admin(?:\/|$)/i.test(request.path)) return true;
    request.staff = await this.auth.authenticate(request.headers.authorization);
    if (!(roles ?? ["admin"]).some(role => request.staff.roles.includes(role))) throw new ForbiddenException("Недостаточно прав.");
    return true;
  }
}

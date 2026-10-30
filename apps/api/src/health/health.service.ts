import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class HealthService {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  getHealth() {
    return {
      status: "ok" as const,
      service: "api"
    };
  }

  async getReadiness() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.database.$queryRaw`SELECT 1`,
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Readiness timeout")), 2000); })
      ]);
      return { ...this.getHealth(), database: "ok" as const };
    } catch {
      throw new ServiceUnavailableException("Service is not ready");
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

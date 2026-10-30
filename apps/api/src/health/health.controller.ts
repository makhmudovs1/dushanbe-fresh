import { Controller, Get, Header, Inject } from "@nestjs/common";

import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get()
  getHealth() {
    return this.healthService.getHealth();
  }

  @Get("ready")
  @Header("Cache-Control", "no-store")
  getReadiness() {
    return this.healthService.getReadiness();
  }
}

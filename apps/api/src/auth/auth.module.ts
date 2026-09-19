import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { StaffGuard } from "./staff.guard";

@Module({ imports: [PrismaModule], controllers: [AuthController], providers: [AuthService, { provide: APP_GUARD, useClass: StaffGuard }] })
export class AuthModule {}

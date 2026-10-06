import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { StaffController } from "./staff.controller";
import { StaffService } from "./staff.service";

@Module({ imports: [PrismaModule], providers: [StaffService], controllers: [StaffController] })
export class StaffModule {}

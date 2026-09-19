import { Controller, Get, Inject } from "@nestjs/common";
import { DeliverySlotsService } from "./delivery-slots.service";

@Controller("delivery-slots")
export class DeliverySlotsController {
  constructor(@Inject(DeliverySlotsService) private readonly slots: DeliverySlotsService) {}
  @Get()
  list() { return this.slots.list(); }
}

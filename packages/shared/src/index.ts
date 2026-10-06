export const SERVICE_NAME = "Dushanbe Fresh";
export type * from "./checkout";
export { slotUnavailableLabels } from "./checkout";
export type * from "./operations";

export type HealthStatus = {
  status: "ok";
  service: string;
};
export type * from "./auth";
export * from "./delivery-finance";
export * from "./tracking";

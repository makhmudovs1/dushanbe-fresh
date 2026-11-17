import { privateStorageKey } from "../domain/storage-scope";
import { secrets } from "./secure-storage.native";
import { randomUUID } from "expo-crypto";
import { api } from "../api/config";
import { createPrivateJournal } from "./private-journal";
import { createTrackingStore } from "./tracking-store";
function privateKey(kind: string, owner: string | null) {
  return privateStorageKey(kind, api.baseUrl, owner);
}
export const createOrderJournal = (owner: string | null) =>
  createPrivateJournal(secrets, randomUUID, privateKey("order", owner));
const tracking = createTrackingStore(secrets, api.baseUrl);
export const saveTracking = (token: string, owner: string | null = null) =>
  tracking.save(token, owner);
export const readTracking = (owner: string | null = null) =>
  tracking.read(owner);

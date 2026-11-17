import * as SecureStore from "expo-secure-store";
import { createSecureAdapter } from "./secure-store-adapter";
export const secrets = createSecureAdapter(
  SecureStore,
  SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
);

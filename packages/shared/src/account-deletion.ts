export type AccountDeletionCapability = {
  available: boolean;
  mode: "request";
  policyVersion: string | null;
  retentionNotice: { ru: string; tg: string } | null;
};
export type AccountDeletionReceipt = { requestId: string; requestedAt: string; status: "requested" };

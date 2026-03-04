import { z } from "zod";

export const SyncJsonStateV1 = z.object({
  application: z.string(),
  environment: z.string(),
  environments: z.record(z.string(), z.object({ filesVersion: z.string() })),
});

export const AnySyncJsonState = SyncJsonStateV1;

export const SyncJsonState = SyncJsonStateV1;

export type SyncJsonStateV1 = z.infer<typeof SyncJsonStateV1>;
export type AnySyncJsonState = z.infer<typeof AnySyncJsonState>;
export type SyncJsonState = z.infer<typeof SyncJsonState>;

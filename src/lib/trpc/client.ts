// Atlas — Wave 0 tRPC client placeholder.
// Wave 2 wires the real client + React Query provider.

import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "./server";

export const trpc = createTRPCReact<AppRouter>();

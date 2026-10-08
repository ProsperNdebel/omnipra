import { deviceSessions } from "@/services";
import { withDevice } from "@/server/api";

export const runtime = "nodejs";

/** GET /api/v1/device/sessions → what this body is booked to carry. Poll it. */
export function GET(req: Request) {
  return withDevice(req, async (d, device) => ({
    device: {
      id: device.id,
      name: device.name,
      kind: device.kind,
      capabilities: device.capabilities,
    },
    sessions: await deviceSessions(d, device),
  }));
}

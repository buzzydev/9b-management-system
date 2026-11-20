import { z } from "zod";
import { route } from "@/lib/api";
import { fmtDay } from "@/lib/dates";
import { setStatus } from "@/lib/services/duty";

const body = z.object({ status: z.enum(["ASSIGNED", "DONE", "MISSED"]) });
const LABEL = { ASSIGNED: "belgilangan", DONE: "bajarildi", MISSED: "bajarilmadi" } as const;

/** Navbatchilikni «bajarildi» / «bajarilmadi» deb belgilash yoki qaytarish. Faqat ADMIN. */
export const PATCH = route({ cap: "duty.manage", body }, async ({ params, body, session, log }) => {
  const { before, after } = await setStatus(params.id, body.status, { id: session.id, fullName: session.fullName });
  await log({
    action: "DUTY_STATUS",
    category: "duty",
    description: `Navbatchi ${after.studentName} (${fmtDay(after.date)}): ${LABEL[before.status]} → ${LABEL[after.status]}`,
    entityType: "DutyAssignment",
    entityId: after.id,
  });
  return { ok: true };
});

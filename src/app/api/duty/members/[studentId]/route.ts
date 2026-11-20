import { z } from "zod";
import { route } from "@/lib/api";
import { setEnabled } from "@/lib/services/duty";

const body = z.object({ enabled: z.boolean() });

/** O'quvchini navbatchilik ro'yxatidan vaqtincha chiqarish / qaytarish. Faqat ADMIN. */
export const PATCH = route({ cap: "duty.manage", body }, async ({ params, body, log }) => {
  const row = await setEnabled(params.studentId, body.enabled);
  await log({ action: "DUTY_MEMBER", category: "duty", description: `${row.fullName} navbatchilik ro'yxatidan ${body.enabled ? "qaytarildi" : "chiqarildi"}`, entityType: "DutyMember", entityId: params.studentId });
  return { ok: true };
});

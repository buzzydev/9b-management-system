import { z } from "zod";
import { route } from "@/lib/api";
import { fmtDay } from "@/lib/dates";
import { id, optionalText } from "@/lib/validators";
import { replaceAssignment } from "@/lib/services/duty";

const body = z.object({ studentId: id, note: optionalText(300) });

/** Bugungi navbatchini qo'lda almashtirish. Adolat qoidasi serverda tekshiriladi. Faqat ADMIN. */
export const POST = route({ cap: "duty.manage", body }, async ({ params, body, session, log }) => {
  const { before, after } = await replaceAssignment(params.id, body.studentId, { id: session.id, fullName: session.fullName }, body.note ?? null);
  await log({
    action: "DUTY_REPLACE",
    category: "duty",
    description: `Navbatchi qo'lda almashtirildi (${fmtDay(after.date)}): ${before.studentName} → ${after.studentName}`,
    entityType: "DutyAssignment",
    entityId: after.id,
  });
  return { ok: true };
});

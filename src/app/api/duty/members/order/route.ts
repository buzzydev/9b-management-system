import { z } from "zod";
import { route } from "@/lib/api";
import { id } from "@/lib/validators";
import { resetAlphabetical, setOrder } from "@/lib/services/duty";

const body = z.union([
  z.object({ action: z.literal("set"), order: z.array(id).min(1).max(500) }),
  z.object({ action: z.literal("alphabetical") }),
]);

/** Navbat tartibini o'zgartirish yoki alifbo bo'yicha tiklash. Tayinlangan kunlar o'zgarmaydi, faqat keyingilar. Faqat ADMIN. */
export const PUT = route({ cap: "duty.manage", body }, async ({ body, log }) => {
  if (body.action === "set") await setOrder(body.order);
  else await resetAlphabetical();
  await log({ action: "DUTY_ORDER", category: "duty", description: body.action === "set" ? "Navbat tartibi o'zgartirildi" : "Navbat tartibi alifbo bo'yicha tiklandi", entityType: "DutyMember" });
  return { ok: true };
});

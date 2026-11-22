import { z } from "zod";
import { route } from "@/lib/api";
import { setWeekdays } from "@/lib/services/duty";

const body = z.object({ weekdays: z.array(z.number().int().min(1).max(7)).min(1, "Kamida bitta kunni tanlang").max(7) });

/** Navbatchilik bo'ladigan hafta kunlari. Faqat ADMIN. */
export const PATCH = route({ cap: "duty.manage", body }, async ({ body, log }) => {
  const days = [...new Set(body.weekdays)].sort();
  await setWeekdays(days);
  await log({ action: "DUTY_SETTINGS", category: "duty", description: `Navbatchilik kunlari: ${days.join(", ")}`, entityType: "DutySettings", entityId: "singleton" });
  return { ok: true };
});

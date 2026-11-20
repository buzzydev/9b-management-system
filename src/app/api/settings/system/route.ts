import { z } from "zod";
import { prisma, getSystemSettings } from "@/lib/db";
import { route } from "@/lib/api";
import { requiredText } from "@/lib/validators";

const schema = z
  .object({
    schoolName: requiredText(120),
    academicYear: requiredText(20),
    defaultLanguage: z.enum(["uz", "en", "ru"]),
    attendanceAlertPercent: z.number().int().min(1).max(100),
    qrTtlMinutes: z.number().int().min(1).max(120),
    qrLateAfterMinutes: z.number().int().min(0).max(120),
  })
  .partial()
  .strict();

export const GET = route({ cap: "class.manage" }, async () => ({ settings: await getSystemSettings() }));

export const PATCH = route({ cap: "system.manage", body: schema }, async ({ body, log }) => {
  const before = await getSystemSettings();
  const saved = await prisma.systemSettings.update({ where: { id: "singleton" }, data: body });
  const diff = Object.entries(body)
    .filter(([k, v]) => (before as Record<string, unknown>)[k] !== v)
    .map(([k, v]) => `${k}: ${(before as Record<string, unknown>)[k]} → ${v}`)
    .join("; ");
  await log({ action: "SETTINGS_UPDATE", category: "settings", description: `Tizim sozlamalari: ${diff || "o'zgarish yo'q"}`, entityType: "SystemSettings", entityId: "singleton" });
  return { settings: saved };
});

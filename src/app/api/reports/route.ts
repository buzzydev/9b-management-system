import { route } from "@/lib/api";
import { buildReport, reportQuerySchema } from "@/lib/services/reports";

// Barcha hisobotlar bazadagi haqiqiy ma'lumotlardan quriladi
export const GET = route({ cap: "class.manage", rate: { name: "report", limit: 60, windowMs: 60_000 } }, async ({ query }) => {
  const q = reportQuerySchema.parse(Object.fromEntries(query.entries()));
  return buildReport(q);
});

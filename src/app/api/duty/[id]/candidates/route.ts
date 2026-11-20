import { route } from "@/lib/api";
import { replacementCandidates } from "@/lib/services/duty";

/** Almashtirish uchun adolatli nomzodlar (faqat hozirgi aylanishda navbati kelmaganlar). */
export const GET = route({ cap: "duty.manage" }, async ({ params }) => ({ items: await replacementCandidates(params.id) }));

import { route } from "@/lib/api";
import { checkBackupConnection } from "@/lib/services/backup-core";

export const dynamic = "force-dynamic";

// Zaxira bazasiga ulanishni jonli tekshirish (parol/URL qaytarilmaydi)
export const GET = route({ cap: "backup.manage", rate: { name: "backup-check", limit: 20, windowMs: 10 * 60_000 } }, async () => checkBackupConnection());

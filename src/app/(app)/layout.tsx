import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  // Ochiq rejimda tizimga kirmaganlar mehmon sifatida o'qish rejimida ko'radi (faqat xodim sahifalari middleware/shell tomonidan yopiladi)
  if (!session && !env.publicAccess) redirect("/login");
  return <AppShell>{children}</AppShell>;
}

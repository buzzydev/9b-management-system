import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

// Admin bo'limlariga server tomonda kirish nazorati (API ham alohida tekshiradi)
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/dashboard");
  return <>{children}</>;
}

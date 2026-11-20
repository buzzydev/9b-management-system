import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { Logo } from "@/components/shared/logo";

export const metadata = { title: "Kirish" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await getSession();
  const { next } = await searchParams;
  if (session) redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-b from-accent/60 to-background px-4 py-10">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft sm:p-7">
          <h1 className="text-xl font-semibold">Tizimga kirish</h1>
          <p className="mb-5 mt-1 text-sm text-muted-foreground">9-B sinf boshqaruv platformasi</p>
          <LoginForm next={next} />
        </div>
        <p className="mt-5 text-center text-xs text-muted-foreground">Hisobingiz yo'qmi? Administratorga murojaat qiling.</p>
      </div>
    </main>
  );
}

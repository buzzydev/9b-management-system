import { redirect } from "next/navigation";
import Image from "next/image";
import { CalendarCheck, ClipboardList, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { Logo } from "@/components/shared/logo";

export const metadata = { title: "Kirish" };

const FEATURES = [
  { icon: CalendarCheck, text: "Davomat telefonda bir necha soniyada" },
  { icon: ClipboardList, text: "Adolatli navbatchilar tartibi" },
  { icon: ShieldCheck, text: "Har kuni avtomatik zaxira nusxa" },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await getSession();
  const { next } = await searchParams;
  if (session) redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Rasm paneli — kompyuterda chap tomonda */}
      <section className="relative hidden overflow-hidden bg-[hsl(220_58%_6%)] lg:block">
        <Image src="/images/login-hero.webp" alt="Zamonaviy maktab binosi va davomat statistikasi illyustratsiyasi" fill priority sizes="(min-width: 1024px) 52vw, 0px" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[hsl(220_58%_5%/0.85)] via-transparent to-[hsl(220_58%_5%/0.35)]" aria-hidden />
        <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">
          <Logo tone="light" />
          <div className="max-w-md">
            <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white xl:text-4xl">Sinfingizni <span className="text-cyan-300">aqlli</span> boshqaring</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-300">Davomat, navbatchilar, jadval va hisobotlar — barchasi bitta qulay platformada.</p>
            <ul className="mt-6 space-y-3">
              {FEATURES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm text-slate-200">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15 backdrop-blur"><Icon className="h-4 w-4 text-cyan-300" /></span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Forma */}
      <section className="relative flex flex-col">
        {/* Mobil/planshet banneri */}
        <div className="relative h-40 w-full overflow-hidden sm:h-52 lg:hidden">
          <Image src="/images/banner-mobile.webp" alt="" fill priority sizes="100vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" aria-hidden />
          <div className="safe-top absolute left-5 top-5">
            <Logo tone="light" />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-10 pt-2 lg:py-10">
          <div className="w-full max-w-sm animate-fade-up">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
              <h1 className="t-title">Tizimga kirish</h1>
              <p className="mb-6 mt-1.5 text-sm text-muted-foreground">9-B sinf boshqaruv platformasiga xush kelibsiz</p>
              <LoginForm next={next} />
            </div>
            <p className="mt-5 text-center text-xs text-muted-foreground">Hisobingiz yo'qmi? Administratorga murojaat qiling.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

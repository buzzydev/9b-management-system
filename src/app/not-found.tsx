import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-6xl font-bold text-brand">404</p>
      <h1 className="text-xl font-semibold">Sahifa topilmadi</h1>
      <p className="text-sm text-muted-foreground">Siz izlagan sahifa mavjud emas yoki ko'chirilgan.</p>
      <Link href="/dashboard" className={cn(buttonVariants(), "mt-2")}>
        Bosh sahifaga qaytish
      </Link>
    </main>
  );
}

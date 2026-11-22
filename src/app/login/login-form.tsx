"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { api, errMsg } from "@/lib/client/api";

const schema = z.object({
  username: z.string().trim().min(1, "Foydalanuvchi nomini kiriting"),
  password: z.string().min(1, "Parolni kiriting"),
});
type Values = z.infer<typeof schema>;

export function LoginForm({ next }: { next?: string }) {
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (v: Values) => {
    setError(null);
    try {
      await api("/api/auth/login", { body: v });
      const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
      // To'liq yuklash: yangi sessiya cookie'si bilan provayderlar qayta quriladi
      window.location.assign(dest);
    } catch (e) {
      setError(errMsg(e));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Field label="Foydalanuvchi nomi" error={errors.username?.message}>
        <Input autoComplete="username" autoCapitalize="none" autoFocus {...register("username")} />
      </Field>
      <Field label="Parol" error={errors.password?.message}>
        <div className="relative">
          <Input type={show ? "text" : "password"} autoComplete="current-password" className="pr-10" {...register("password")} />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:text-foreground"
            aria-label={show ? "Parolni yashirish" : "Parolni ko'rsatish"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
        Kirish
      </Button>
    </form>
  );
}

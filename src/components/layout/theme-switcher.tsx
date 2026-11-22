"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun, Monitor, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem } from "@/components/ui/menu";
import { api } from "@/lib/client/api";
import { useMe, useT } from "@/lib/client/providers";

export function ThemeSwitcher() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { refresh } = useMe();
  const t = useT();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const choose = (v: "light" | "dark" | "system") => {
    setTheme(v);
    // Tanlov bazada ham saqlanadi (boshqa qurilmalarda ham ishlashi uchun)
    api("/api/settings/user", { method: "PATCH", body: { theme: v } }).then(refresh).catch(() => {});
  };

  const Icon = !mounted ? Sun : resolvedTheme === "dark" ? Moon : Sun;
  const opts = [
    { v: "light" as const, label: t("common.light"), icon: Sun },
    { v: "dark" as const, label: t("common.dark"), icon: Moon },
    { v: "system" as const, label: t("common.system"), icon: Monitor },
  ];
  return (
    <Dropdown
      trigger={({ toggle }) => (
        <Button variant="ghost" size="icon" onClick={toggle} aria-label={t("common.theme")}>
          <Icon className="h-[18px] w-[18px]" />
        </Button>
      )}
    >
      {({ close }) =>
        opts.map(({ v, label, icon: I }) => (
          <DropdownItem
            key={v}
            onClick={() => {
              choose(v);
              close();
            }}
          >
            <I className="h-4 w-4" />
            <span className="flex-1">{label}</span>
            {mounted && theme === v && <Check className="h-4 w-4 text-brand" />}
          </DropdownItem>
        ))
      }
    </Dropdown>
  );
}

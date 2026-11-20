"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { useApi } from "@/lib/client/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, Badge, EmptyState, Skeleton } from "@/components/ui/feedback";
import { DUTY_STATUS_LABEL, DUTY_STATUS_TONE, type DutyOverview } from "./duty-types";

/** Bosh sahifadagi «Bugungi navbatchilar» kartochkasi */
export function DutyWidget() {
  const { data, isLoading } = useApi<DutyOverview>("/api/duty");
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <CardTitle>Bugungi navbatchilar</CardTitle>
        <Link href="/duty" className="text-xs font-medium text-brand hover:underline">Batafsil</Link>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? <Skeleton className="h-40" /> : !data.todayDuty.length ? (
          <EmptyState icon={ClipboardList} title={data.isDutyDay ? "Navbatchi tayinlanmagan" : "Bugun navbatchilik yo'q"} className="py-6" />
        ) : (
          <ul className="space-y-2">
            {data.todayDuty.map((d) => (
              <li key={d.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
                <Avatar name={d.name} src={d.photoUrl} size={36} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.name}</span>
                <Badge tone={DUTY_STATUS_TONE[d.status]}>{DUTY_STATUS_LABEL[d.status]}</Badge>
              </li>
            ))}
            <li className="pt-1 text-xs text-muted-foreground">Vazifa: {data.tasks.join(" · ")}</li>
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

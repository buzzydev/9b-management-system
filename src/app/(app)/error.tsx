"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/feedback";
import { Card } from "@/components/ui/card";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Card className="mx-auto mt-10 max-w-lg">
      <ErrorState message="Sahifani ko'rsatishda xatolik yuz berdi. Qayta urinib ko'ring." onRetry={reset} />
    </Card>
  );
}

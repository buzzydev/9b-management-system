import type { Metadata } from "next";
import { CalendarView } from "./calendar-view";

export const metadata: Metadata = { title: "Kalendar" };

export default function CalendarPage() {
  return <CalendarView />;
}

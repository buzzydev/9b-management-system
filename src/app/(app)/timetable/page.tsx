import type { Metadata } from "next";
import { TimetableView } from "./timetable-view";

export const metadata: Metadata = { title: "Dars jadvali" };

export default function TimetablePage() {
  return <TimetableView />;
}

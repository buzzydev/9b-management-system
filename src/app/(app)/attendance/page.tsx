import type { Metadata } from "next";
import { AttendanceView } from "./attendance-view";

export const metadata: Metadata = { title: "Davomat" };

export default function AttendancePage() {
  return <AttendanceView />;
}

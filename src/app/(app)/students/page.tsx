import type { Metadata } from "next";
import { StudentsView } from "./students-view";

export const metadata: Metadata = { title: "O'quvchilar" };

export default function StudentsPage() {
  return <StudentsView />;
}

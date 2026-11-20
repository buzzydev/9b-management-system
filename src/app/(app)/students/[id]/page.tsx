import type { Metadata } from "next";
import { StudentProfileView } from "./student-profile-view";

export const metadata: Metadata = { title: "O'quvchi profili" };

export default function StudentProfilePage() {
  return <StudentProfileView />;
}

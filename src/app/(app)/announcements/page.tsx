import type { Metadata } from "next";
import { AnnouncementsView } from "./announcements-view";

export const metadata: Metadata = { title: "E'lonlar" };

export default function AnnouncementsPage() {
  return <AnnouncementsView />;
}

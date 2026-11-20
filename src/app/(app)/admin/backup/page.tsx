import type { Metadata } from "next";
import { BackupView } from "./backup-view";

export const metadata: Metadata = { title: "Zaxira nusxalar" };

export default function BackupPage() {
  return <BackupView />;
}

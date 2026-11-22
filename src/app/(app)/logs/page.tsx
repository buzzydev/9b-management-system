import type { Metadata } from "next";
import { LogsView } from "./logs-view";

export const metadata: Metadata = { title: "Faollik jurnali" };

export default function LogsPage() {
  return <LogsView />;
}

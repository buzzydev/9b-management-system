import type { Metadata } from "next";
import { SystemView } from "./system-view";

export const metadata: Metadata = { title: "Tizim sozlamalari" };

export default function SystemPage() {
  return <SystemView />;
}

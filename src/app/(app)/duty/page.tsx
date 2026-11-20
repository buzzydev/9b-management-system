import type { Metadata } from "next";
import { DutyView } from "./duty-view";

export const metadata: Metadata = { title: "Navbatchilar" };

export default function DutyPage() {
  return <DutyView />;
}

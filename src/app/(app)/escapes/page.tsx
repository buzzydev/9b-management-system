import type { Metadata } from "next";
import { EscapesView } from "./escapes-view";

export const metadata: Metadata = { title: "Qochib ketganlar tarixi" };

export default function EscapesPage() {
  return <EscapesView />;
}

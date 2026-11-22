import type { Metadata } from "next";
import { ScanForm } from "./scan-form";

export const metadata: Metadata = { title: "Davomat" };

export default async function ScanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ScanForm token={token} />;
}

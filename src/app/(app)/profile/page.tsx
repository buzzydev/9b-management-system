import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/data";
import { ProfileForm } from "../settings/profile-form";

export const metadata: Metadata = { title: "Mening profilim" };

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Mening profilim" />
      <ProfileForm />
    </div>
  );
}

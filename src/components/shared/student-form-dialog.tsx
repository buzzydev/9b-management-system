"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Camera } from "lucide-react";
import { api, errMsg, uploadFile } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/form";

export type StudentLite = {
  id: string;
  studentCode: string;
  fullName: string;
  photoUrl: string | null;
  dateOfBirth: string | null;
  phone: string | null;
  parentPhone: string | null;
  enrolledAt: string;
  notes: string | null;
};

const schema = z.object({
  fullName: z.string().trim().min(2, "F.I.Sh. kiriting").max(120),
  studentCode: z.string().trim().max(32).regex(/^[A-Za-z0-9._-]*$/, "Faqat lotin harflari, raqam, . _ -").optional().or(z.literal("")),
  dateOfBirth: z.string().optional(),
  phone: z.string().trim().max(32).optional(),
  parentPhone: z.string().trim().max(32).optional(),
  enrolledAt: z.string().optional(),
  notes: z.string().trim().max(2000).optional(),
});
type Values = z.infer<typeof schema>;

export function StudentFormDialog({ open, onClose, student, onSaved }: { open: boolean; onClose: () => void; student?: StudentLite | null; onSaved: () => void }) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!open) return;
    reset({
      fullName: student?.fullName ?? "",
      studentCode: student?.studentCode ?? "",
      dateOfBirth: student?.dateOfBirth ?? "",
      phone: student?.phone ?? "",
      parentPhone: student?.parentPhone ?? "",
      enrolledAt: student?.enrolledAt ?? "",
      notes: student?.notes ?? "",
    });
    setPhoto(student?.photoUrl ?? null);
  }, [open, student, reset]);

  const onFile = async (f?: File) => {
    if (!f) return;
    setUploading(true);
    try {
      const r = await uploadFile(f, "image");
      setPhoto(r.url);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setUploading(false);
    }
  };

  const submit = async (v: Values) => {
    try {
      const body = { ...v, photoUrl: photo ?? "" };
      if (student) await api(`/api/students/${student.id}`, { method: "PATCH", body });
      else await api("/api/students", { body });
      toast.success(student ? "O'quvchi yangilandi" : "O'quvchi qo'shildi");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={student ? "O'quvchini tahrirlash" : "Yangi o'quvchi"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Bekor qilish</Button>
          <Button onClick={handleSubmit(submit)} loading={isSubmitting} disabled={uploading}>Saqlash</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        <div className="flex items-center gap-4">
          <Avatar name={watch("fullName") || "?"} src={photo} size={64} />
          <div className="space-y-1">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <Button type="button" variant="outline" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
              <Camera className="h-4 w-4" /> Rasm yuklash
            </Button>
            {photo && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setPhoto(null)}>
                Olib tashlash
              </Button>
            )}
            <p className="text-xs text-muted-foreground">PNG, JPG, WEBP — 3 MB gacha</p>
          </div>
        </div>
        <Field label="To'liq ism (F.I.Sh.)" required error={errors.fullName?.message}>
          <Input {...register("fullName")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="O'quvchi ID" error={errors.studentCode?.message} hint={student ? undefined : "Bo'sh qoldirsangiz avtomatik beriladi"}>
            <Input {...register("studentCode")} placeholder="9B-001" />
          </Field>
          <Field label="Tug'ilgan sana" hint="QR davomat uchun kerak">
            <Input type="date" {...register("dateOfBirth")} />
          </Field>
          <Field label="Telefon raqami" error={errors.phone?.message}>
            <Input type="tel" {...register("phone")} placeholder="+998 90 123 45 67" />
          </Field>
          <Field label="Ota-ona telefoni" error={errors.parentPhone?.message}>
            <Input type="tel" {...register("parentPhone")} />
          </Field>
          <Field label="O'qishga kirgan sana">
            <Input type="date" {...register("enrolledAt")} />
          </Field>
        </div>
        <Field label="Qo'shimcha ma'lumot">
          <Textarea {...register("notes")} />
        </Field>
      </form>
    </Dialog>
  );
}

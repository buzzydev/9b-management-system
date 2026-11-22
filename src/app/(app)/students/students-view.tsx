"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { Archive, ArchiveRestore, Download, FileSpreadsheet, Pencil, Plus, Search, Upload, UserPlus } from "lucide-react";
import { api, downloadUrl, errMsg, qs, useApi } from "@/lib/client/api";
import { fmtDate, pct } from "@/lib/client/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { DataTable, PageHeader, Pagination, SortHeader } from "@/components/ui/data";
import { Avatar, Badge, EmptyState, ErrorState, ListSkeleton, Skeleton } from "@/components/ui/feedback";
import { useReadOnly } from "@/lib/client/providers";
import { Checkbox, Input, Select } from "@/components/ui/form";
import { Dropdown, DropdownItem } from "@/components/ui/menu";
import { useConfirm } from "@/components/ui/confirm";
import { StudentFormDialog, type StudentLite } from "@/components/shared/student-form-dialog";

type Row = StudentLite & { status: "ACTIVE" | "ARCHIVED"; attendanceRate: number | null };
type Resp = { items: Row[]; total: number; page: number; pageSize: number; totals: { active: number; archived: number } };

const PAGE_SIZE = 20;

function rateTone(r: number | null) {
  if (r == null) return "outline" as const;
  return r >= 90 ? ("success" as const) : r >= 75 ? ("warning" as const) : ("danger" as const);
}

export function StudentsView() {
  const ro = useReadOnly();
  return ro ? <GuestStudents /> : <StaffStudents />;
}

/** Mehmon uchun: faqat faol o'quvchilarning ismlari (server boshqa hech narsa qaytarmaydi). */
function GuestStudents() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, isLoading, mutate } = useApi<{ items: { id: string; fullName: string }[]; total: number; pageSize: number }>(`/api/students${qs({ q, page, pageSize: 40 })}`);
  return (
    <div className="space-y-4">
      <PageHeader title="O'quvchilar" description={data ? `Jami: ${data.total} ta` : undefined} />
      <Card className="p-3"><Input placeholder="Ism bo'yicha qidirish…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Qidirish" /></Card>
      <Card>
        {error && !data ? <ErrorState message={errMsg(error)} onRetry={() => mutate()} /> : isLoading && !data ? <ListSkeleton rows={8} /> : !data?.items.length ? <EmptyState title="O'quvchilar topilmadi" /> : (
          <ul className="grid gap-px sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3"><Avatar name={s.fullName} src={null} /><span className="text-sm font-medium">{(page - 1) * 40 + i + 1}. {s.fullName}</span></li>
            ))}
          </ul>
        )}
        {data && <div className="px-4"><Pagination page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} /></div>}
      </Card>
    </div>
  );
}

function StaffStudents() {
  const router = useRouter();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [hasPhone, setHasPhone] = useState("");
  const [sort, setSort] = useState("fullName");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [editing, setEditing] = useState<Row | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setTerm(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const filters = { q: term, status, hasPhone, sort, dir };
  const { data, error, isLoading, mutate } = useApi<Resp>(`/api/students${qs({ ...filters, page, pageSize: PAGE_SIZE })}`);
  const selectedIds = Object.keys(selection).filter((k) => selection[k]);

  useEffect(() => setSelection({}), [term, status, hasPhone, page]);

  const onSort = (f: string, d: "asc" | "desc") => {
    setSort(f);
    setDir(d);
    setPage(1);
  };

  const bulk = async (action: "archive" | "restore") => {
    const ok = await confirm({
      title: action === "archive" ? "Arxivlash" : "Arxivdan qaytarish",
      description: `${selectedIds.length} ta o'quvchi ${action === "archive" ? "arxivga o'tkaziladi (ma'lumotlari saqlanadi)" : "faol ro'yxatga qaytariladi"}.`,
      confirmText: "Ha",
      destructive: action === "archive",
    });
    if (!ok) return;
    try {
      const r = await api<{ updated: number }>("/api/students/bulk", { body: { ids: selectedIds, action } });
      toast.success(`${r.updated} ta o'quvchi yangilandi`);
      setSelection({});
      mutate();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const toggleOne = async (s: Row) => {
    const archive = s.status === "ACTIVE";
    const ok = await confirm({ title: archive ? "Arxivlash" : "Qaytarish", description: `${s.fullName} ${archive ? "arxivga o'tkaziladi" : "faol ro'yxatga qaytariladi"}.`, destructive: archive });
    if (!ok) return;
    try {
      if (archive) await api(`/api/students/${s.id}`, { method: "DELETE" });
      else await api(`/api/students/${s.id}`, { method: "PATCH", body: { ...s, photoUrl: s.photoUrl ?? "", status: "ACTIVE" } });
      toast.success(archive ? "Arxivlandi" : "Qaytarildi");
      mutate();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: "select",
        size: 44,
        header: ({ table }) => (
          <Checkbox label="Hammasini tanlash" checked={table.getIsAllRowsSelected()} indeterminate={table.getIsSomeRowsSelected()} onCheckedChange={(v) => table.toggleAllRowsSelected(v)} />
        ),
        cell: ({ row }) => (
          <span onClick={(e) => e.stopPropagation()}>
            <Checkbox label="Tanlash" checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(v)} />
          </span>
        ),
      },
      {
        id: "fullName",
        header: () => <SortHeader label="F.I.Sh." field="fullName" sort={sort} dir={dir} onSort={onSort} />,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <Avatar name={row.original.fullName} src={row.original.photoUrl} size={36} />
            <div className="min-w-0">
              <Link href={`/students/${row.original.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium hover:text-brand hover:underline">
                {row.original.fullName}
              </Link>
              {row.original.status === "ARCHIVED" && <Badge tone="outline">Arxiv</Badge>}
            </div>
          </div>
        ),
      },
      { id: "studentCode", header: () => <SortHeader label="ID" field="studentCode" sort={sort} dir={dir} onSort={onSort} />, cell: ({ row }) => <span className="font-mono text-xs">{row.original.studentCode}</span> },
      { id: "phone", header: "Telefon", cell: ({ row }) => row.original.phone ?? "—" },
      { id: "parentPhone", header: "Ota-ona", cell: ({ row }) => row.original.parentPhone ?? "—" },
      { id: "enrolledAt", header: () => <SortHeader label="Qabul sanasi" field="enrolledAt" sort={sort} dir={dir} onSort={onSort} />, cell: ({ row }) => fmtDate(row.original.enrolledAt) },
      {
        id: "attendance",
        header: () => <SortHeader label="Davomat" field="attendance" sort={sort} dir={dir} onSort={onSort} />,
        cell: ({ row }) => <Badge tone={rateTone(row.original.attendanceRate)}>{pct(row.original.attendanceRate)}</Badge>,
      },
      {
        id: "actions",
        header: "",
        size: 90,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon-sm" aria-label="Tahrirlash" onClick={() => { setEditing(row.original); setFormOpen(true); }}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={row.original.status === "ACTIVE" ? "Arxivlash" : "Qaytarish"} onClick={() => toggleOne(row.original)}>
              {row.original.status === "ACTIVE" ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sort, dir],
  );

  const exportUrl = (format: string) => `/api/students/export${qs({ ...filters, format })}`;

  return (
    <div>
      <PageHeader
        title="O'quvchilar"
        description={data ? `Faol: ${data.totals.active} · Arxiv: ${data.totals.archived}` : undefined}
        actions={
          <>
            <Dropdown trigger={({ toggle }) => <Button variant="outline" size="sm" onClick={toggle}><Download className="h-4 w-4" /> Eksport</Button>}>
              {({ close }) => (
                <>
                  <DropdownItem onClick={() => { downloadUrl(exportUrl("xlsx")); close(); }}><FileSpreadsheet className="h-4 w-4" /> Excel (.xlsx)</DropdownItem>
                  <DropdownItem onClick={() => { downloadUrl(exportUrl("csv")); close(); }}><Download className="h-4 w-4" /> CSV</DropdownItem>
                </>
              )}
            </Dropdown>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> Import</Button>
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> Qo'shish</Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Ism, ID yoki telefon bo'yicha qidirish…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select className="sm:w-40" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Holat">
            <option value="ACTIVE">Faol</option>
            <option value="ARCHIVED">Arxiv</option>
            <option value="ALL">Hammasi</option>
          </Select>
          <Select className="sm:w-44" value={hasPhone} onChange={(e) => { setHasPhone(e.target.value); setPage(1); }} aria-label="Telefon">
            <option value="">Telefon: hammasi</option>
            <option value="yes">Telefoni bor</option>
            <option value="no">Telefoni yo'q</option>
          </Select>
        </div>

        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-accent/50 px-4 py-2 text-sm">
            <span className="font-medium">{selectedIds.length} ta tanlandi</span>
            <Button size="sm" variant="outline" onClick={() => bulk("archive")}><Archive className="h-4 w-4" /> Arxivlash</Button>
            <Button size="sm" variant="outline" onClick={() => bulk("restore")}><ArchiveRestore className="h-4 w-4" /> Qaytarish</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelection({})}>Bekor qilish</Button>
          </div>
        )}

        {/* Desktop jadval */}
        <div className="hidden md:block">
          <DataTable
            columns={columns}
            data={data?.items ?? []}
            loading={isLoading}
            error={error ? errMsg(error) : null}
            onRetry={() => mutate()}
            emptyTitle="O'quvchilar topilmadi"
            emptyDescription="Filtrlarni o'zgartiring yoki yangi o'quvchi qo'shing."
            rowSelection={selection}
            onRowSelectionChange={setSelection}
            getRowId={(r) => r.id}
            onRowClick={(r) => router.push(`/students/${r.id}`)}
          />
        </div>

        {/* Mobil kartalar */}
        <div className="divide-y divide-border md:hidden">
          {isLoading && !data ? (
            Array.from({ length: 5 }).map((_, i) => <div key={i} className="p-4"><Skeleton className="h-12 w-full" /></div>)
          ) : error ? (
            <ErrorState message={errMsg(error)} onRetry={() => mutate()} />
          ) : !data?.items.length ? (
            <EmptyState icon={UserPlus} title="O'quvchilar topilmadi" />
          ) : (
            data.items.map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-3">
                <Checkbox label="Tanlash" checked={!!selection[s.id]} onCheckedChange={(v) => setSelection((p) => ({ ...p, [s.id]: v }))} />
                <Link href={`/students/${s.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={s.fullName} src={s.photoUrl} size={42} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.fullName}</span>
                    <span className="block truncate text-xs text-muted-foreground">{s.studentCode} · {s.phone ?? "telefon yo'q"}</span>
                  </span>
                </Link>
                <Badge tone={rateTone(s.attendanceRate)}>{pct(s.attendanceRate)}</Badge>
                <Button variant="ghost" size="icon-sm" aria-label="Tahrirlash" onClick={() => { setEditing(s); setFormOpen(true); }}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
        {data && <div className="px-4"><Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} /></div>}
      </Card>

      <StudentFormDialog open={formOpen} onClose={() => setFormOpen(false)} student={editing} onSaved={() => mutate()} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onDone={() => mutate()} />
    </div>
  );
}

function ImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: { row: number; message: string }[]; total: number } | null>(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setResult(null);
    }
  }, [open]);

  const run = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await api<NonNullable<typeof result>>("/api/students/import", { form });
      setResult(r);
      if (r.created) onDone();
      toast.success(`${r.created} ta o'quvchi qo'shildi`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="O'quvchilarni import qilish"
      description="CSV yoki Excel (.xlsx) fayl. Ustunlar: fullName, dateOfBirth, phone, parentPhone, studentCode (ixtiyoriy). Ko'pi bilan 500 qator."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Yopish</Button>
          <Button onClick={run} loading={busy} disabled={!file}>Import qilish</Button>
        </>
      }
    >
      <input ref={ref} type="file" accept=".csv,.xlsx,text/csv" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-8 text-sm text-muted-foreground transition-colors hover:border-brand hover:bg-accent/40"
      >
        <Upload className="h-6 w-6" />
        {file ? <span className="font-medium text-foreground">{file.name}</span> : "Fayl tanlash uchun bosing"}
      </button>
      {result && (
        <div className="mt-4 space-y-2 text-sm">
          <p>
            Jami: <b>{result.total}</b> · Qo'shildi: <b className="text-success">{result.created}</b> · O'tkazib yuborildi: <b>{result.skipped}</b> · Xatolar: <b className="text-destructive">{result.errors.length}</b>
          </p>
          {result.errors.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-muted p-3 text-xs">
              {result.errors.map((e, i) => (
                <li key={i}>
                  <b>{e.row}-qator:</b> {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Dialog>
  );
}

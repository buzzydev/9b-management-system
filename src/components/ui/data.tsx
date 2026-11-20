"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type RowSelectionState, type OnChangeFn } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Card } from "./card";
import { Skeleton, EmptyState, ErrorState } from "./feedback";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "brand",
  loading,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "brand" | "success" | "danger" | "warning" | "info";
  loading?: boolean;
}) {
  const toneCls = { brand: "bg-brand/15 text-brand", success: "bg-success/15 text-success", danger: "bg-destructive/15 text-destructive", warning: "bg-warning/20 text-warning", info: "bg-info/15 text-info" }[tone];
  return (
    <Card className="p-4 transition-transform duration-200 hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground sm:text-sm">{label}</p>
          {loading ? <Skeleton className="mt-2 h-8 w-16" /> : <p className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl">{value}</p>}
          {hint && !loading && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        {Icon && (
          <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", toneCls)}>
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>
    </Card>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-1 py-3 text-sm">
      <span className="text-muted-foreground tabular-nums">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Oldingi">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[4rem] text-center tabular-nums">
          {page} / {pages}
        </span>
        <Button variant="outline" size="icon-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Keyingi">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * TanStack Table asosidagi server-tomonlama sahifalangan/saralanadigan jadval.
 * Tor ekranlarda gorizontal aylantiriladi.
 */
export function DataTable<T>({
  columns,
  data,
  loading,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  rowSelection,
  onRowSelectionChange,
  getRowId,
  onRowClick,
}: {
  columns: ColumnDef<T, any>[];
  data: T[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  getRowId?: (row: T) => string;
  onRowClick?: (row: T) => void;
}) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: getRowId as any,
    state: { rowSelection: rowSelection ?? {} },
    onRowSelectionChange,
    enableRowSelection: !!onRowSelectionChange,
    manualSorting: true,
    manualPagination: true,
  });

  if (error) return <ErrorState message={error} onRetry={onRetry} />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              {hg.headers.map((h) => (
                <th key={h.id} className="whitespace-nowrap px-4 py-3 font-medium" style={{ width: h.getSize() !== 150 ? h.getSize() : undefined }}>
                  {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {loading && !data.length
            ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border/60">
                  {columns.map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-4 w-full max-w-[140px]" />
                    </td>
                  ))}
                </tr>
              ))
            : table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn("border-b border-border/60 transition-colors hover:bg-accent/50", onRowClick && "cursor-pointer", row.getIsSelected() && "bg-accent/60")}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
      {!loading && !data.length && <EmptyState title={emptyTitle} description={emptyDescription} />}
    </div>
  );
}

/** Sortlanadigan sarlavha tugmasi (server-tomonlama saralash uchun) */
export function SortHeader({
  label,
  field,
  sort,
  dir,
  onSort,
}: {
  label: string;
  field: string;
  sort: string;
  dir: "asc" | "desc";
  onSort: (field: string, dir: "asc" | "desc") => void;
}) {
  const active = sort === field;
  return (
    <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => onSort(field, active && dir === "asc" ? "desc" : "asc")}>
      {label}
      <span aria-hidden className={cn("text-[10px]", active ? "text-brand" : "opacity-30")}>
        {active ? (dir === "asc" ? "▲" : "▼") : "▲▼"}
      </span>
    </button>
  );
}

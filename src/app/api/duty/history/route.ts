import { route, paging, HttpError } from "@/lib/api";
import { getHistory, stripPhotos } from "@/lib/services/duty";

export const GET = route({ cap: "class.manage", guest: true }, async ({ query, session }) => {
  const { page, pageSize, skip, take } = paging(query, 20, 100);
  const studentId = query.get("studentId");
  const st = query.get("status");
  if (st && !["ASSIGNED", "DONE", "MISSED"].includes(st)) throw new HttpError(400, "Noto'g'ri holat");
  const res = await getHistory({ skip, take, studentId: studentId || null, status: (st as "ASSIGNED" | "DONE" | "MISSED" | null) || null });
  const out = { ...res, page, pageSize };
  return session.role === "GUEST" ? stripPhotos(out) : out;
});

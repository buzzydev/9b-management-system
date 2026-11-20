export type DutyStatus = "ASSIGNED" | "DONE" | "MISSED";
export type DutyPerson = { studentId: string; name: string; photoUrl: string | null };

export type DutyOverview = {
  today: string;
  isDutyDay: boolean;
  tasks: string[];
  todayDuty: { id: string; slot: number; studentId: string | null; name: string; photoUrl: string | null; status: DutyStatus; manual: boolean; replacedName: string | null; markedByName: string | null; markedAt: string | null }[];
  next: { date: string; students: DutyPerson[]; isTomorrow: boolean } | null;
  upcoming: { date: string; students: DutyPerson[] }[];
  pending: (DutyPerson & { order: number; isToday: boolean })[];
  served: DutyPerson[];
  progress: { percent: number; completedRounds: number; active: number; served: number; pending: number };
  queue: { studentId: string; name: string; photoUrl: string | null; studentCode: string; position: number; enabled: boolean; count: number; state: "today" | "pending" | "served" | "disabled" }[];
  settings: { weekdays: number[] };
  stats: { totalAssignments: number; lastDoneDate: string | null };
};

export const DUTY_STATUS_LABEL: Record<DutyStatus, string> = { ASSIGNED: "Navbatchi", DONE: "Bajarildi", MISSED: "Bajarilmadi" };
export const DUTY_STATUS_TONE: Record<DutyStatus, "info" | "success" | "danger"> = { ASSIGNED: "info", DONE: "success", MISSED: "danger" };

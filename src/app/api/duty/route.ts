import { route } from "@/lib/api";
import { getOverview, stripPhotos } from "@/lib/services/duty";

/** Navbatchilar sahifasi uchun umumiy ma'lumot. Mehmonlar ham ko'ra oladi (faqat o'qish, rasmsiz). */
export const GET = route({ cap: "class.manage", guest: true }, async ({ session }) => {
  const data = await getOverview();
  return session.role === "GUEST" ? stripPhotos(data) : data;
});

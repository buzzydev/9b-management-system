# 9-B Management System

9-B sinfi uchun to'liq boshqaruv platformasi: o'quvchilar, davomat (QR bilan ham), dars jadvali, navbatchilar, kalendar, e'lonlar, hisobotlar (PDF/Excel/CSV), ichki xabarlar, faollik jurnali, foydalanuvchilar, tizim sozlamalari va zaxira nusxalar.

**Texnologiyalar:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · Prisma 6 · PostgreSQL · Recharts · SWR · Zod · Sonner · Lucide.
**Interfeys tili:** o'zbekcha (en/ru uchun lug'at arxitekturasi tayyor: `src/lib/i18n/dictionaries.ts`).

> ⚠️ **Muhim — tekshiruv holati.** Bu loyiha tarmoqsiz muhitda yozilgan: `npm install`, `next build` va to'liq TypeScript tekshiruvi u yerda ishga tushirib **bo'lmadi**. Tekshirilgan narsalar: (1) 28 ta birlik test o'tdi (davomat foizi, navbatchilik algoritmi, jadval to'qnashuvi, QR muddati, rol ruxsatlari, sanalar); (2) `node scripts/check-static.cjs` — import/eksport va server/klient chegarasi tekshiruvi; (3) TypeScript sintaksis xatolari yo'q. Birinchi `npm install && npm run build` kompyuteringizda/Railway'da bajarilganda kichik tip xatolari chiqishi mumkin; `next.config.mjs` da `ignoreBuildErrors: true` qo'yilgani uchun ular deployni to'xtatmaydi. `npm run typecheck` bilan ularni ko'rib, tuzatib, so'ng bu bayroqni `false` qiling.

## Tezkor ishga tushirish (lokal)

```bash
cp .env.example .env        # DATABASE_URL, AUTH_SECRET, ADMIN_PASSWORD ni to'ldiring
npm install
npm run db:init-migration   # birinchi marta: migratsiya fayllarini yaratadi (prisma/migrations)
npm run dev                 # http://localhost:3000
```

`AUTH_SECRET` yaratish: `openssl rand -base64 48`.

Birinchi ishga tushishda `scripts/bootstrap.mjs` avtomatik: sxemani bazaga qo'llaydi, `ActivityLog` jadvaliga "faqat qo'shish" triggerini o'rnatadi (yozuvlarni o'zgartirib/o'chirib bo'lmaydi), tizim sozlamalari va sinfni yaratadi hamda **ADMIN yo'q bo'lsa** `ADMIN_USERNAME` / `ADMIN_PASSWORD` bilan birinchi administratorni yaratadi (parol kamida 10 belgi). Birinchi kirishdan keyin parolni Sozlamalar → Xavfsizlik'da almashtiring.

### Migratsiyalar haqida
Repozitoriyda tayyor `prisma/migrations` papkasi yo'q (generatsiya uchun DB va tarmoq kerak). Shuning uchun:
1. Lokalda bir marta `npm run db:init-migration` ni ishga tushiring va hosil bo'lgan `prisma/migrations/` ni commit qiling — bundan keyin Railway'da `prisma migrate deploy` ishlatiladi.
2. Migratsiya papkasi bo'lmasa, `bootstrap.mjs` avtomatik `prisma db push` ga o'tadi (yangi bo'sh baza uchun ishlaydi).

## Neon PostgreSQL (Railway orqali)

Railway o'zgaruvchilarida: `DATABASE_URL` — Neon **pooled** manzili (`...-pooler...?sslmode=require&pgbouncer=true`), `DIRECT_URL` — Neon **direct** manzili (pooler'siz, `sslmode=require`). Ishga tushirishdagi `db:bootstrap` Prisma CLI (jadval yaratish) uchun `DIRECT_URL` ni ishlatadi, ilova esa `DATABASE_URL` bilan ishlaydi. `APP_TIMEZONE=Asia/Tashkent`. Navbatchilik jadvallari (`DutyMember`, `DutySettings`, `DutyAssignment`) deploy paytida avtomatik yaratiladi; agar `prisma/migrations` papkasini yaratgan bo'lsangiz, lokal `npx prisma migrate dev --name duty` bajarib, natijani qo'shing.

## Railway'ga deploy

1. GitHub'ga push qiling → Railway'da **New Project → Deploy from GitHub repo**.
2. **Add → Database → PostgreSQL**. `DATABASE_URL` ni ilova servisiga ulang (`${{Postgres.DATABASE_URL}}` reference).
3. Ilova servisi **Variables**:
   | O'zgaruvchi | Qiymat |
   |---|---|
   | `AUTH_SECRET` | 32+ belgili tasodifiy matn (majburiy; productionda bo'lmasa ilova ishga tushmaydi) |
   | `ADMIN_USERNAME` | masalan `admin` |
   | `ADMIN_PASSWORD` | kamida 10 belgi |
   | `ADMIN_FULL_NAME` | ixtiyoriy |
   | `STORAGE_DIR` | `/data` |
   | `APP_TIMEZONE` | `Asia/Tashkent` |
   | `CLASS_NAME`, `SCHOOL_NAME` | ixtiyoriy |
4. **Volume** yarating (servis → Settings → Volumes) va **Mount path = `/data`**. Yuklangan fayllar va zaxira nusxalar shu yerda saqlanadi; redeploydan keyin ham yo'qolmaydi. (Zaxira nusxalar qo'shimcha ravishda Postgres'da ham saqlanadi.)
5. Deploy. `railway.json` bo'yicha build: `npm run build`, start: `npm start` (avval bootstrap, so'ng Next.js), healthcheck: `/api/health` (baza ulanishini tekshiradi).
6. Domen ochib, `ADMIN_USERNAME` / `ADMIN_PASSWORD` bilan kiring.

**Redeploy / yangilash:** kodni push qiling — `npm start` har safar bootstrap'ni (migratsiya/ sxema sinxronizatsiyasi) ishga tushiradi; admin allaqachon bo'lsa, qayta yaratilmaydi.

## Zaxira tizimi (avtomatik, alohida bazada)

**Qanday ishlaydi.** Har kuni **03:00 Asia/Tashkent** (= **22:00 UTC**, oldingi kun) Railway Cron xizmati `npm run backup:cron` ni ishga tushiradi:
1. asosiy bazadan bitta izchil snapshot (RepeatableRead) olinadi, gzip + SHA-256;
2. **alohida** PostgreSQL bazaga (`BACKUP_DATABASE_URL`) bo'laklab yoziladi;
3. qayta o'qib tekshiriladi (SHA-256, gzip, JSON, jadvallar bo'yicha yozuvlar soni) — faqat shundan keyin `SUCCESS`;
4. eng yangi 7 ta kunlik zaxira qoladi, eskilari o'chadi. Eng yangi yaroqli zaxira va bugungisi hech qachon o'chirilmaydi.

Takror ishga tushish xavfsiz: bir kunga faqat bitta kunlik yozuv (unique indeks). Xato bo'lsa 3 marta qayta uriniladi, so'ng adminlarga bildirishnoma + jurnal qaydi, Cron `exit 1` bilan tugaydi.

**Sozlash (bir martalik):**
1. Ikkinchi, **mustaqil** PostgreSQL yarating (masalan, boshqa Neon loyihasi). Asosiy baza bilan bir xil bo'lishi mumkin emas — tizim buni aniqlasa rad etadi.
2. Asosiy ilova xizmatiga o'zgaruvchi qo'shing: `BACKUP_DATABASE_URL=postgresql://...?sslmode=require`
3. Railway'da **yangi xizmat** yarating (shu GitHub repo), unga **bir xil** `DATABASE_URL`, `BACKUP_DATABASE_URL`, `APP_TIMEZONE=Asia/Tashkent` o'zgaruvchilarini bering va *Settings → Config as Code → Path* ga `railway.backup.json` yozing (unda `cronSchedule: "0 22 * * *"` bor).
4. Admin → Zaxira nusxalar sahifasida «Ulanishni tekshirish» va «Zaxira yaratish» ni bosing; Cron xizmatida «Run now» bilan sinab ko'ring.

`BACKUP_DATABASE_URL` yo'q bo'lsa sahifada qizil ogohlantirish chiqadi va avtomatik zaxira ishlamaydi (qo'lda zaxira faqat asosiy bazada saqlanadi va «himoyasiz» deb belgilanadi). Tiklashdan oldin har safar xavfsizlik nusxasi yaratiladi; u yaratilmasa tiklash bajarilmaydi.

## Tekshiruv skriptlari

| Buyruq | Nima qiladi |
|---|---|
| `npm test` | Barcha unit testlar + API route xavfsizlik auditi (statik) |
| `npm run verify:backup` | Haqiqiy asosiy va zaxira bazalarida zaxirani yaratish → tekshirish → takrorlanmaslik → saqlash siyosatini sinaydi (vaqtinchalik yozuvlarni o'chiradi) |
| `npm i --no-save playwright && npx playwright install chromium`, so'ng `BASE_URL=... CHECK_USER=... CHECK_PASS=... npm run check:responsive` | 18 sahifa × 10 ekran o'lchamida gorizontal siljish va buzuq rasmlarni tekshiradi, skrinshotlar `responsive-report/` ga |

## Rollar va ruxsatlar

| Imkoniyat | ADMIN | TEACHER | CLASS_LEADER | ASSISTANT |
|---|:-:|:-:|:-:|:-:|
| O'quvchilar, davomat, jadval, navbatchilar (ko'rish), kalendar, e'lon, hisobot, xabar | ✔ | ✔ | ✔ | ✔ |
| Sinf faoliyat jurnali | ✔ | ✔ | ✔ | ✔ |
| Foydalanuvchi qo'shish/rol/faollashtirish/parol tiklash | ✔ | — | — | — |
| Tizim sozlamalari (shkala, QR, til) | ✔ | — | — | — |
| Zaxira / tiklash | ✔ | — | — | — |
| To'liq faollik jurnali (auth, foydalanuvchi, tizim) | ✔ | — | — | — |
| O'quvchini butunlay o'chirish | ✔ | arxivlash | arxivlash | arxivlash |
| «Qochib ketdi» qaydini kiritish | ✔ | — | — | — |
| «Qochib ketganlar tarixi»ni ko'rish | ✔ | ✔ | ✔ | ✔ |

Barcha tekshiruvlar **serverda** (`src/lib/permissions.ts`, `route({ cap })` o'ramasi); admin sahifalari serverda ham `redirect` bilan himoyalangan.

## Ochiq (mehmon) rejimi — `PUBLIC_ACCESS`

Standart holatda (`PUBLIC_ACCESS="true"`) havolani bilgan har kim **login va parolsiz** saytni ochib, *faqat ko'ra oladi*. U telefon, planshet va kompyuterda ishlaydi (mobile-first dizayn).

| Mehmon ko'radi | Mehmonga yopiq (faqat tizimga kirgan xodim) |
|---|---|
| Bosh sahifa (sinf bo'yicha umumiy statistika), **davomat (faqat ko'rish: kunlik, tarix, kalendar, statistika — ID, rasm va izohlarsiz)**, dars jadvali, navbatchilar (rasmsiz), kalendar, e'lonlar (fayllarsiz), o'quvchilar **ismlari** | Davomatni o'zgartirish, QR, hisobotlar, xabarlar, bildirishnomalar, faollik jurnali, sozlamalar, profil, o'quvchi profili, «Qochib ketganlar tarixi», barcha admin bo'limlari |

Xavfsizlik kafolatlari (serverda bajariladi, faqat UI emas):
- Mehmon sessiyasi bazada mavjud emas va `can()` unga **hech qachon** ruxsat bermaydi — admin huquqi berilmaydi.
- Mehmon faqat `guest: true` deb belgilangan **GET** route'larga kira oladi (dashboard, timetable, duty, announcements, calendar, students, subjects, me). Har qanday yozuvchi so'rov (POST/PUT/PATCH/DELETE) 401 qaytaradi.
- Mehmonga o'quvchining telefoni, tug'ilgan sanasi, ID raqami, rasmi, davomati va ota-ona ma'lumotlari **umuman yuborilmaydi** (server maydonlarni olib tashlaydi).
- Xodimlar `/login` orqali kiradi (sahifadagi «Xodimlar kirishi» tugmasi).
- Saytni to'liq yopish: `PUBLIC_ACCESS="false"` — shunda hamma sahifa yana login talab qiladi.

> ⚠️ Ochiq rejimda o'quvchilar (voyaga yetmaganlar) **ismlari** internetda ko'rinadi. Agar bu maqbul bo'lmasa, `PUBLIC_ACCESS="false"` qiling yoki ismlarni yashirishni so'rang.

## «Qochib ketdi» funksiyasi

Barcha xodimlar (**ADMIN, ustoz, klasskom, klasskom yordamchisi**): Davomat → kunlik ro'yxatda o'quvchi qatoridagi **«Qochib ketdi»** tugmasi:
1. Necha soatga ketgani: 1 / 2 / 3 / 4 / 5 soat yoki **Boshqa** (qo'lda, 0,5–24 soat).
2. **Majburiy izoh** (kamida 10 belgi): nima sababdan va qaysi vaqtda ketgani.
3. Yakuniy **Tasdiqlash** — faqat shundan keyin o'quvchining holati «Qochib ketdi» ga o'zgaradi (server `confirmed: true` talab qiladi; qayd va davomat holati bitta tranzaksiyada yoziladi).

Har bir qayd saqlaydi: o'quvchi ismi, qochib ketgan sana, qayd kiritilgan vaqt, necha soatga ketgani, izoh, kim kiritgani. **«Qochib ketganlar tarixi»** (`/escapes`) bo'limida qidiruv (ism/izoh/muallif) va filtrlar: o'quvchi, kim kiritgan, aniq sana yoki sana oralig'i, soat oralig'i. Qaydlar o'zgartirilmaydi va o'chirilmaydi (bunday API yo'q); ism va muallif nusxasi saqlanadi, shuning uchun o'quvchi o'chirilsa ham tarix qoladi. «Qochib ketdi» holatini keyin faqat admin boshqa holatga o'zgartira oladi. Davomat foizida u «Kelmadi» kabi hisoblanadi.

## Navbatchilar

«Yutuqlar», «Uyga vazifalar» va «Baholar» bo'limlari olib tashlandi (ularning **eski ma'lumotlari bazada saqlanib qoladi**, hech narsa o'chirilmadi). Ularning o'rniga **Navbatchilar** (`/duty`) bo'limi qo'shildi.

**Qoidalar**
- Har navbatchilik kuni **2 nafar** o'quvchi alifbo (A→Z) tartibida avtomatik tayinlanadi; keyingi kuni — keyingi 2 nafar.
- Hamma navbatchi bo'lib bo'lmaguncha hech kim ikkinchi marta tanlanmaydi; aylanish tugagach, navbat avtomatik ro'yxat boshidan qayta boshlanadi (o'quvchilar soni toq bo'lsa, aylanish chegarasidagi kun «oxirgi + yangi aylanishning birinchisi»dan iborat bo'ladi).
- Ikkala navbatchi ham ikkala vazifani bajaradi: 1) bo'r olib kelish, 2) doskani artish.
- Navbat **hisob** asosida yuritiladi: hisob = boshlang'ich + tayinlashlar soni; eng kam hisobli, teng bo'lsa navbat tartibidagi tepadagi tanlanadi. Shu sababli qo'lda almashtirish, yangi/arxivlangan o'quvchi, tartib o'zgarishi — hammasi adolatli hisoblanadi.

**Avtomatik ishlash**
- Tayinlash «lazy»: sana (Asia/Tashkent) o'zgargach, saytga/APIga birinchi so'rovda yetishmayotgan kunlar uchun navbatchilar yoziladi (server uzoq o'chiq turgan bo'lsa, o'tkazib yuborilgan kunlar ham — oxirgi 62 tagacha — to'ldiriladi). Cron kerak emas.
- Yangilash (refresh) navbatchini o'zgartirmaydi: (sana, slot) bazada noyob, yozuv PostgreSQL advisory lock ostida bajariladi. Hammasi Neon PostgreSQL'da saqlanadi — qayta ishga tushirishda tartib yo'qolmaydi.
- Ertangi va keyingi kunlar — **taxminiy ko'rinish** (bazaga yozilmaydi); administrator tartibni o'zgartirsa, o'zgarishi mumkin. Bugungi navbatchi esa qat'iy.
- Standart kunlar: dushanba–shanba (Boshqaruv → «Navbatchilik kunlari»da o'zgartiriladi).

**Administrator boshqaruvi** (faqat ADMIN; mehmon va boshqa rollar faqat ko'radi)
- «Bajarildi» / «Bajarilmadi» / qaytarish; «Bajarilmadi» o'quvchining navbatini hisobdan chiqaradi — u keyingi kuni birinchi bo'lib tanlanadi.
- Qo'lda almashtirish: faqat hozirgi aylanishda hali navbati kelmagan o'quvchilar tanlanadi (server tekshiradi). Almashtirish tarixda «Qo'lda» deb belgilanadi, asl o'quvchining navbati saqlanib qoladi.
- Navbat tartibini yuqoriga/pastga siljitish, «Alifbo bo'yicha» tiklash, o'quvchini ro'yxatdan vaqtincha chiqarish/qaytarish. O'quvchi qo'shish/arxivlash — «O'quvchilar» bo'limida; navbat ro'yxati avtomatik yangilanadi (yangi o'quvchi alifbo bo'yicha qo'yiladi va joriy aylanishga tenglanadi).

**Cheklovlar:** aylanishning oxirgi navbatchisi kelmagan bo'lsa, adolatli almashtiruvchi bo'lmasligi mumkin — shunda «Bajarilmadi» belgilang. Alifbo tartibi Intl «uz» qoidasiga tayanadi (Sh, Ch, O', G' harflari serverdagi ICU'ga bog'liq); kerak bo'lsa tartibni qo'lda to'g'rilang. O'quvchilarga navbatchilik haqida alohida bildirishnoma yuborilmaydi.

## Asosiy qoidalar

- **Davomat foizi** = (Keldi + Kechikdi) / (Keldi + Kechikdi + Kelmadi) × 100; "Sababli" maxrajga kirmaydi.
- **QR davomat:** o'qituvchi sessiya ochadi → muddati cheklangan, bir martalik-sessiyaga xos token (bazada faqat SHA-256 hash). O'quvchi QR'ni skanerlab **o'quvchi ID + tug'ilgan sana** bilan tasdiqlaydi (o'quvchilar uchun alohida hisob yo'q). Holat (Keldi/Kechikdi) **serverda** vaqtga qarab aniqlanadi; takroriy belgilash bloklanadi; qo'lda davomat har doim mumkin; barcha amallar jurnalga yoziladi.
- **Eslatmalar** (imtihon) so'rov paytida "lazy" hisoblanadi — cron kerak emas.
- **Xavfsizlik:** bcrypt, JWT cookie (`httpOnly`, `SameSite=Lax`, productionda `__Host-`), har so'rovda sessiya bazadan tekshiriladi (nofaol/parol almashgan sessiyalar bekor), kirishda urinishlar cheklovi va bloklash, Origin asosida CSRF himoyasi, CSP va xavfsizlik sarlavhalari, Zod validatsiyasi, fayl turi/hajmi va rasm "magic bytes" tekshiruvi, CSV/Excel formula-injection himoyasi.

## Ma'lum cheklovlar

- So'rovlar cheklovchisi (rate limit) xotirada — bitta nusxa (instance) uchun. Ko'p nusxaga o'tilsa Redis kerak.
- O'quvchilar uchun alohida kirish yo'q (QR faqat ID + tug'ilgan sana bilan).
- en/ru tarjimalari qisman; asosiy til o'zbekcha.
- Bildirishnomalar real-vaqt (WebSocket) emas: 15–30 soniyalik so'rov bilan yangilanadi.
- Zaxira — JSON dump (gzip). Katta bazalar uchun `pg_dump` ham tavsiya etiladi.
- Dizayn ikki ma'lumotnoma skrinshotisiz, tavsif asosida qurilgan (skrinshotlar ilova qilinmagan).

## Foydali buyruqlar

```bash
npm test                  # birlik testlar
npm run typecheck         # TypeScript tekshiruvi
node scripts/check-static.cjs   # import/eksport va server/klient chegarasi tekshiruvi
npm run db:bootstrap      # sxema + admin yaratish (qo'lda)
npm run db:migrate        # prisma migrate deploy
```

## Loyiha tuzilishi

```
prisma/schema.prisma      ma'lumotlar modeli
scripts/bootstrap.mjs     DB sinxronizatsiya, trigger, birinchi admin
src/app/(app)/*           sahifalar (har biri: page.tsx + *-view.tsx)
src/app/api/*             REST route handler'lar (route() o'ramasi: auth, RBAC, CSRF, rate limit, audit)
src/lib/*                 auth, permissions, stats, timetable, qr, dates, storage, ...
src/lib/services/*        hisobotlar, eksport, zaxira, foydalanuvchilar
tests/*.test.ts           birlik testlar
```

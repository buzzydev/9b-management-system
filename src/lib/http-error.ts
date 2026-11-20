export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (m: string) => new HttpError(400, m);
export const forbidden = (m = "Ruxsat yo'q") => new HttpError(403, m);
export const notFound = (m = "Topilmadi") => new HttpError(404, m);
export const conflict = (m: string) => new HttpError(409, m);

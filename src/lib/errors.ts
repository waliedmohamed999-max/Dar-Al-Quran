export class AppError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}
export const notFound = () => new AppError(404, "not_found");
export const forbidden = () => new AppError(403, "forbidden");
export const unauthorized = () => new AppError(401, "unauthorized");
export const conflict = (code: string) => new AppError(409, code);
export const badRequest = (code: string) => new AppError(400, code);

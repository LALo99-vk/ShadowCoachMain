import { isAxiosError } from "axios";

export function getApiErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as
      | { error?: unknown; message?: unknown }
      | undefined;

    if (typeof data?.message === "string") return data.message;
    if (typeof data?.error === "string") return data.error;
    if (data?.message && typeof data.message === "object") {
      return JSON.stringify(data.message);
    }
    if (data?.error && typeof data.error === "object") {
      return JSON.stringify(data.error);
    }

    return error.message || fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

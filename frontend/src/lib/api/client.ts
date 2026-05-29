import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "/api" : "http://localhost:3000/api"),
  withCredentials: true,
});

let refreshPromise: Promise<void> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const code = error.response?.data?.code;

    const isRefreshCall = original?.url?.includes("/auth/refresh");
    const shouldRefresh =
      status === 401 &&
      code === "TOKEN_EXPIRED" &&
      !original?._retry &&
      !isRefreshCall;

    if (!shouldRefresh) {
      return Promise.reject(error);
    }

    original._retry = true;

    if (!refreshPromise) {
      refreshPromise = api
        .post("/auth/refresh")
        .then(() => undefined)
        .finally(() => {
          refreshPromise = null;
        });
    }

    try {
      await refreshPromise;
      return api(original);
    } catch {
      return Promise.reject(error);
    }
  },
);

declare module "axios" {
  export interface AxiosRequestConfig {
    _retry?: boolean;
  }
}

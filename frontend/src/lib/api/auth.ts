import { api } from "./client";

export type Sport = "CRICKET" | "FOOTBALL" | "BASKETBALL" | "BADMINTON";
export type ExperienceLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  age: number;
  country: string;
  state: string;
  sport: Sport;
  role: string;
  level: ExperienceLevel;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterPayload {
  fullName: string;
  email: string;
  password: string;
  age: number;
  country: string;
  state: string;
  sport: Sport;
  role: string;
  level: ExperienceLevel;
}

export const authApi = {
  register: (data: RegisterPayload) => api.post("/auth/register", data),
  login: (data: { email: string; password: string }) =>
    api.post<{ message: string; user: UserProfile }>("/auth/login", data),
  logout: () => api.post("/auth/logout"),
  refresh: () => api.post("/auth/refresh"),
  me: () => api.get<{ user: UserProfile }>("/auth/me"),
};

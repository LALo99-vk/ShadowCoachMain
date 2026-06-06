import { api } from "./client";
import type { AnalysisData } from "@/components/shadow/AnalysisCard";

export interface SessionSummary {
  id: string;
  imageUrl: string;
  overallScore: number;
  priorityFix: string;
  confidenceLevel: string;
  createdAt: string;
}

export interface ReportSummary {
  id: string;
  pdfUrl: string;
  createdAt: string;
  sessionId: string;
  session: SessionSummary;
}

export interface ChatMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  message: string;
  createdAt: string;
  userId: string;
}

export interface SessionDetail extends AnalysisData {
  id: string;
  imageUrl: string;
  createdAt: string;
  userId: string;
  reportPdfUrl: string | null;
  chats: ChatMessage[];
}

export interface SessionResponse {
  message: string;
  session: SessionDetail;
}

export const sessionApi = {
  analyze: async (image: File, question: string) => {
    const form = new FormData();
    form.append("image", image);
    if (question.trim()) form.append("question", question.trim());
    const res = await api.post<SessionResponse>("/session/analyze", form);
    return res.data;
  },

  list: async () => {
    const res = await api.get<{ sessions: SessionSummary[] }>("/session");
    return res.data.sessions;
  },

  listReports: async () => {
    const res = await api.get<{ reports: ReportSummary[] }>("/session/reports");
    return res.data.reports;
  },

  get: async (id: string) => {
    const res = await api.get<{ session: SessionDetail }>(`/session/${id}`);
    return res.data.session;
  },

  followUp: async (id: string, message: string) => {
    const res = await api.post<{ message: string; reply: ChatMessage }>(
      `/session/${id}`,
      { message },
    );
    return res.data;
  },

  delete: async (id: string) => {
    const res = await api.delete<{ message: string }>(`/session/${id}`);
    return res.data;
  },

  getReport: async (id: string) => {
    const res = await api.get<{ pdfUrl: string; sessionId: string }>(
      `/session/${id}/report`,
    );
    return res.data;
  },

  fetchReportFile: async (sessionId: string, download = false) => {
    const res = await api.get<Blob>(`/session/${sessionId}/report/file`, {
      params: download ? { download: "1" } : undefined,
      responseType: "blob",
    });
    return res.data;
  },
};

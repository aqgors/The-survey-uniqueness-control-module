import axios from "axios";

const BASE_URL =
  import.meta.env.VITE_API_URL || "https://survey-api.avalon.exposed/api";

export const api = axios.create({ baseURL: BASE_URL, withCredentials: true });

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("authToken");
  if (token) config.headers["Authorization"] = `Bearer ${token}`;
  // Legacy header support for existing routes
  const userId = localStorage.getItem("userId");
  const userRole = localStorage.getItem("userRole");
  if (userId) config.headers["x-user-id"] = userId;
  if (userRole) config.headers["x-user-role"] = userRole;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      ["authToken", "userId", "userEmail", "userName", "userRole"].forEach(
        (k) => localStorage.removeItem(k),
      );
      window.dispatchEvent(new Event("auth:logout"));
    }
    return Promise.reject(err);
  },
);

// ── Admin API helpers ───────────────────────────────────────────────────────

export const adminApi = {
  // Dashboard
  getDashboard: () => api.get("/admin/surveys/dashboard"),

  // Users
  getUsers: (params?: any) => api.get("/admin/users", { params }),
  getUserStats: () => api.get("/admin/users/stats"),
  getUserById: (id: string) => api.get(`/admin/users/${id}`),
  changeRole: (id: string, role: string) =>
    api.patch(`/admin/users/${id}/role`, { role }),
  toggleBlock: (id: string, block: boolean, reason?: string) =>
    api.patch(`/admin/users/${id}/block`, { block, reason }),

  deleteUser: (id: string) => api.delete(`/admin/users/${id}`),

  // Surveys
  getSurveys: (params?: any) => api.get("/admin/surveys", { params }),
  getSurveyStats: (id: string) => api.get(`/admin/surveys/${id}/stats`),
  toggleSurvey: (id: string, isActive: boolean) =>
    api.patch(`/admin/surveys/${id}/toggle`, { isActive }),
  duplicateSurvey: (id: string) => api.post(`/admin/surveys/${id}/duplicate`),
  deleteSurvey: (id: string) => api.delete(`/admin/surveys/${id}`),

  // Anomalies
  getAnomalyStats: () => api.get("/admin/anomalies/stats"),
  getAnomalies: (params?: any) => api.get("/admin/anomalies", { params }),
  scanSurvey: (surveyId: string) =>
    api.post(`/admin/anomalies/scan/${surveyId}`),
  flagAnomaly: (id: string, flag: string) =>
    api.patch(`/admin/anomalies/${id}/flag`, { flag }),

  // Export
  exportCSV: (id: string) =>
    api.get(`/admin/export/surveys/${id}/csv`, { responseType: "blob" }),
  exportJSON: (id: string) =>
    api.get(`/admin/export/surveys/${id}/json`, { responseType: "blob" }),
  exportExcel: (id: string) =>
    api.get(`/admin/export/surveys/${id}/excel`, { responseType: "blob" }),
  exportAnomaliesExcel: (params?: any) =>
    api.get("/admin/export/anomalies/excel", { params, responseType: "blob" }),
};

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Profile API helpers ──────────────────────────────────────────────────────

export const profileApi = {
  getMe: () => api.get("/profile/me"),
  updateName: (name: string) => api.patch("/profile/name", { name }),
  uploadAvatar: (formData: FormData) =>
    api.post("/profile/avatar", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  requestPassword: () => api.post("/profile/password/request"),
  confirmPassword: (code: string, newPassword: string) =>
    api.post("/profile/password/confirm", { code, newPassword }),
  requestEmailChange: (newEmail: string) =>
    api.post("/profile/email/request", { newEmail }),
  confirmOldEmail: (code: string) =>
    api.post("/profile/email/confirm-old", { code }),
  confirmNewEmail: (code: string) =>
    api.post("/profile/email/confirm-new", { code }),
};

// ── Auth API helpers ────────────────────────────────────────────────────────

export const authApi = {
  requestForgotPassword: (email: string) =>
    api.post("/auth/forgot-password/request", { email }),
  confirmForgotPassword: (email: string, code: string, newPassword: string) =>
    api.post("/auth/forgot-password/confirm", { email, code, newPassword }),
};

// ── Friends API helpers ─────────────────────────────────────────────────────

export const friendsApi = {
  getFriends: () => api.get("/friends"),
  addFriend: (friendId: string) => api.post("/friends", { friendId }),
  removeFriend: (friendId: string) => api.delete(`/friends/${friendId}`),
  acceptFriendRequest: (friendId: string) =>
    api.patch(`/friends/${friendId}/accept`),
  rejectFriendRequest: (friendId: string) =>
    api.patch(`/friends/${friendId}/reject`),
  getFriendsSurveys: () => api.get("/friends/surveys"),
};

// ── Chat API helpers ────────────────────────────────────────────────────────

export const chatApi = {
  getHistory: (friendId: string) => api.get(`/chat/history/${friendId}`),
  uploadImage: (formData: FormData) => api.post("/chat/image", formData),
  deleteHistory: (friendId: string) => api.delete(`/chat/history/${friendId}`),
  deleteMessage: (messageId: string) =>
    api.delete(`/chat/messages/${messageId}`),
  editMessage: (messageId: string, content: string) =>
    api.put(`/chat/messages/${messageId}`, { content }),
};

// ── Export Module Types ───────────────────────────────────────────────────────

export interface ExportVoter {
  voterUserId: string | null;
  userName: string | null;
  userEmail: string | null;
  createdAt: string;
}

export interface ExportOption {
  id: string;
  text: string;
  votes: number;
  percentage: number;
}

export interface ExportQuestion {
  id: string;
  text: string;
  imageUrl: string | null;
  options: ExportOption[];
}

export interface ExportSurveyData {
  survey: {
    id: string;
    title: string;
    description: string | null;
    createdAt: string;
    deadline: string | null;
    isPrivate: boolean;
    isActive: boolean;
    createdById: string | null;
  };
  statistics: {
    totalVoters: number;
    totalQuestions: number;
    totalOptions: number;
    exportedAt: string;
  };
  questions: ExportQuestion[];
  voters: ExportVoter[];
}

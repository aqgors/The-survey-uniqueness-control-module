import { api } from './axios'
import { AxiosError } from 'axios'
import { v4 as uuidv4 } from 'uuid'

// ── Types ──────────────────────────────────────────────────────────────────

export interface Option {
  id: string
  text: string
}

export interface Question {
  id: string
  surveyId: string
  text: string
  imageUrl?: string | null
  options: Option[]
}

export interface Survey {
  id: string
  title: string
  description: string | null
  imageUrl: string | null
  isPrivate: boolean
  isActive: boolean
  accessType?: string
  createdAt: string
  deadline: string | null
  createdById?: string | null
  questions: Question[]
}

export interface SurveyListItem {
  id: string
  title: string
  description?: string | null
  imageUrl?: string | null
  isPrivate: boolean
  accessType?: string
  createdAt: string
  deadline?: string | null
  _count: {
    votes: number
    questions: number
  }
}

export interface OptionResult {
  id: string
  text: string
  votes: number
  percentage: number
}

export interface QuestionResult {
  id: string
  text: string
  imageUrl?: string | null
  options: OptionResult[]
}

export interface SurveyResults {
  surveyId: string
  title: string
  description?: string | null
  imageUrl?: string | null
  isPrivate: boolean
  isActive?: boolean
  accessType?: string
  totalVoters: number
  createdAt: string
  deadline?: string | null
  createdById: string | null
  voters: {
    voterUserId: string | null
    createdAt: string
    userName: string | null
    userEmail: string | null
  }[]
  questions: QuestionResult[]
}

export interface CreateSurveyPayload {
  title: string
  description?: string
  imageUrl?: string
  isPrivate?: boolean
  accessType?: string
  initialInvitesCount?: number
  password?: string
  deadline?: string
  inviteExpiresAt?: string
  questions: {
    text: string
    imageUrl?: string
    options: { text: string }[]
  }[]
}

export interface UpdateSurveyPayload {
  title?: string
  description?: string
  imageUrl?: string
  isActive?: boolean
  accessType?: 'PUBLIC' | 'PRIVATE' | 'ANONYMOUS_INVITE'
  currentPassword?: string
  password?: string
  deadline?: string
  inviteExpiresAt?: string
  questions?: {
    text: string
    imageUrl?: string
    options: { text: string }[]
  }[]
}

export interface VotePayload {
  cookieId?: string
  inviteToken?: string
  isAnonymous?: boolean
  fingerprint?: string
  answers: { questionId: string; optionIds: string[] }[]
}

export interface VoteResponse {
  success: boolean
  message: string
  cookieId: string
  resultsUrl: string
}

export interface AlreadyVotedError {
  error: 'already_voted'
  signal: 'ip' | 'userAgent' | 'cookieId'
  message: string
}

// ── Cookie/localStorage voter ID ───────────────────────────────────────────

const VOTER_ID_KEY = 'survey_voter_id'

export function getOrCreateVoterId(): string {
  let id = localStorage.getItem(VOTER_ID_KEY)

  if (!id) {
    id = uuidv4()
    localStorage.setItem(VOTER_ID_KEY, id)
  }

  return id
}

export function persistVoterId(id: string): void {
  localStorage.setItem(VOTER_ID_KEY, id)
}

// ── API Methods ─────────────────────────────────────────────────────────────

export const surveyApi = {
  getAll: async (): Promise<SurveyListItem[]> => {
    const { data } = await api.get('/surveys')
    return data.surveys
  },

  getById: async (id: string, unlockToken?: string, inviteToken?: string): Promise<Survey> => {
    const { data } = await api.get(`/surveys/${id}`, {
      headers: unlockToken ? { 'X-Unlock-Token': unlockToken } : {},
      params: inviteToken ? { invite: inviteToken } : {}
    })
    return data.survey
  },

  create: async (payload: CreateSurveyPayload): Promise<{
    survey: Survey
    voteUrl: string
    resultsUrl: string
  }> => {
    const { data } = await api.post('/surveys', payload)
    return data
  },

  getResults: async (id: string, unlockToken?: string): Promise<SurveyResults> => {
    const { data } = await api.get(`/surveys/${id}/results`, {
      headers: unlockToken ? { 'X-Unlock-Token': unlockToken } : {}
    })
    return data.results
  },

  /**
   * Submit a vote via the new anti-fraud endpoint: POST /vote/:surveyId
   * Returns VoteResponse on success, throws AxiosError on 403/4xx/5xx
   */
  vote: async (surveyId: string, payload: VotePayload, unlockToken?: string): Promise<VoteResponse> => {
    const { data } = await api.post(`/vote/${surveyId}`, payload, {
      headers: unlockToken ? { 'X-Unlock-Token': unlockToken } : {}
    });
    return data
  },

  getInvites: async (id: string): Promise<any[]> => {
    const { data } = await api.get(`/surveys/${id}/invites`);
    return data.tokens;
  },

  generateNewInvite: async (id: string, expiresAt?: string): Promise<any[]> => {
    const { data } = await api.post(`/surveys/${id}/invites/new`, { expiresAt });
    return data.tokens;
  },

  deactivateAllInvites: async (id: string): Promise<void> => {
    await api.post(`/surveys/${id}/invites/deactivate`);
  },

  unlock: async (surveyId: string, password: string): Promise<{ success: boolean; unlockToken: string }> => {
    const { data } = await api.post(`/surveys/${surveyId}/unlock`, { password }, {
      headers: { 'x-skip-auth-interceptor': 'true' }
    });
    return data;
  },

  update: async (id: string, payload: UpdateSurveyPayload): Promise<Survey> => {
    const { data } = await api.patch(`/surveys/${id}`, payload);
    return data.results?.questions ? data.results : data;
  },

  getParticipated: async (): Promise<SurveyListItem[]> => {
    const { data } = await api.get('/surveys/participated');
    return data.surveys;
  },
}

/**
 * Type guard — checks if an AxiosError response is an AlreadyVotedError
 */
export function isAlreadyVotedError(err: unknown): err is AxiosError<AlreadyVotedError> {
  return (
    err instanceof AxiosError &&
    err.response?.status === 403 &&
    err.response?.data?.error === 'already_voted'
  )
}

export { api }

import axios, { AxiosError } from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  timeout: 10000,
  withCredentials: true,
})

// ── Types ──────────────────────────────────────────────────────────────────

export interface Option {
  id: string
  text: string
}

export interface Question {
  id: string
  surveyId: string
  text: string
  options: Option[]
}

export interface Survey {
  id: string
  title: string
  isPublic: boolean
  createdAt: string
  questions: Question[]
}

export interface SurveyListItem {
  id: string
  title: string
  isPublic: boolean
  createdAt: string
  _count: { votes: number; questions: number }
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
  options: OptionResult[]
}

export interface SurveyResults {
  surveyId: string
  title: string
  isPublic: boolean
  totalVoters: number
  createdAt: string
  questions: QuestionResult[]
}

export interface CreateSurveyPayload {
  title: string
  isPublic?: boolean
  questions: {
    text: string
    options: { text: string }[]
  }[]
}

export interface VotePayload {
  cookieId?: string
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
    id = crypto.randomUUID()
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

  getById: async (id: string): Promise<Survey> => {
    const { data } = await api.get(`/surveys/${id}`)
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

  getResults: async (id: string): Promise<SurveyResults> => {
    const { data } = await api.get(`/surveys/${id}/results`)
    return data.results
  },

  /**
   * Submit a vote via the new anti-fraud endpoint: POST /vote/:surveyId
   * Returns VoteResponse on success, throws AxiosError on 403/4xx/5xx
   */
  vote: async (surveyId: string, payload: VotePayload): Promise<VoteResponse> => {
    // Use /vote/:id (standalone anti-fraud endpoint), not /api/surveys/:id/vote
    const { data } = await axios.post(
      `/vote/${surveyId}`,
      payload,
      {
        withCredentials: true,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }
    )
    return data
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

export default api

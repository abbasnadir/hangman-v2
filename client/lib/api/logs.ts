import { supabase } from '../supabaseClient';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export interface RoundEntry {
  id: string;
  word: string;
  result: string;
  timeTaken: string;
  usedLives: number;
  roundIndex: number;
}

export interface GameEntry {
  id: string;
  gameMode: string;
  gameResult: string;
  totalLives: number;
  totalWords: number;
  timestamp: string;
  rounds: RoundEntry[];
}

export interface LogsResponse {
  logs: GameEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const getAuthToken = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || '';
};

export const LogsAPI = {
  getLogs: async (page: number = 1, limit: number = 10, search?: string): Promise<LogsResponse> => {
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');

    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString()
    });

    if (search) {
      params.append('search', search);
    }

    const response = await fetch(`${API_BASE_URL}/logs?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'Failed to fetch logs');
    }

    return response.json();
  }
};

import { supabase } from '../supabaseClient';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export interface CreateGameParams {
  gamemode: number;
  wordlistId: string;
  totalLives?: number;
  number_of_words: number;
}

export interface CreateGameResponse {
  gameId: string;
}

const getAuthToken = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || '';
};

export const GameAPI = {
  createGame: async (params: CreateGameParams): Promise<CreateGameResponse> => {
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');

    const query = new URLSearchParams({
      gamemode: params.gamemode.toString(),
      wordlistId: params.wordlistId,
      totalLives: (params.totalLives || 5).toString(),
      number_of_words: params.number_of_words.toString()
    });

    const response = await fetch(`${API_BASE_URL}/game/create?${query.toString()}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (errorData.error?.activeGameId) {
        throw new Error(`ACTIVE_GAME:${errorData.error.activeGameId}`);
      }
      throw new Error(errorData.error?.message || 'Failed to create game');
    }

    return response.json();
  }
};

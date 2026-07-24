import { supabase } from '../supabaseClient';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export interface Wordlist {
  id: string;
  name: string;
  is_public: boolean;
  default: boolean;
}

const getAuthToken = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || '';
};

let allAvailableWordlistsCache: Wordlist[] | null = null;

export const WordlistAPI = {
  getDefaultWordlists: async (): Promise<Wordlist[]> => {
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`${API_BASE_URL}/wordlists`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'Failed to fetch wordlists');
    }

    return response.json();
  },
  getAllAvailableWordlists: async (forceRefresh: boolean = false): Promise<Wordlist[]> => {
    if (!forceRefresh && allAvailableWordlistsCache) {
      return allAvailableWordlistsCache;
    }
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');

    const [defaultsRes, myRes] = await Promise.all([
      fetch(`${API_BASE_URL}/wordlists`, { headers: { 'Authorization': `Bearer ${token}` } }),
      fetch(`${API_BASE_URL}/wordlists/me/`, { headers: { 'Authorization': `Bearer ${token}` } }).catch(() => null)
    ]);

    let defaults: Wordlist[] = [];
    if (defaultsRes.ok) defaults = await defaultsRes.json();

    let my: Wordlist[] = [];
    if (myRes && myRes.ok) my = await myRes.json();

    // Combine and remove duplicates by ID
    const combined = [...defaults, ...my];
    const unique = Array.from(new Map(combined.map(w => [w.id, w])).values());
    allAvailableWordlistsCache = unique;
    return unique;
  },

  getMyWordlists: async (): Promise<(Wordlist & { words: string[] })[]> => {
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`${API_BASE_URL}/wordlists/me/`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      if (response.status === 404) return [];
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'Failed to fetch wordlists');
    }
    return response.json();
  },

  createWordlist: async (name: string, words: string[], is_public: boolean = false): Promise<Wordlist> => {
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`${API_BASE_URL}/wordlists/me/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, words, is_public })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'Failed to create wordlist');
    }
    allAvailableWordlistsCache = null;
    return response.json();
  },

  updateWordlist: async (id: string, updates: { name?: string; words?: string[]; is_public?: boolean }): Promise<Wordlist> => {
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`${API_BASE_URL}/wordlists/me/`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id, ...updates })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'Failed to update wordlist');
    }
    allAvailableWordlistsCache = null;
    return response.json();
  },

  deleteWordlist: async (id: string): Promise<void> => {
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`${API_BASE_URL}/wordlists/me/`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'Failed to delete wordlist');
    }
    allAvailableWordlistsCache = null;
  },

  searchPublicWordlists: async (query: string, page: number = 1, limit: number = 20): Promise<Wordlist[]> => {
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');

    const params = new URLSearchParams({ q: query, page: page.toString(), limit: limit.toString() });
    const response = await fetch(`${API_BASE_URL}/wordlists/search/?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      if (response.status === 404) return [];
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'Failed to search wordlists');
    }
    return response.json();
  }
};

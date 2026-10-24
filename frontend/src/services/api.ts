const API_BASE = '/api';

export function getAuthToken(): string | null {
  return localStorage.getItem('hisabx_jwt_token');
}

export function setAuthToken(token: string | null) {
  if (token) localStorage.setItem('hisabx_jwt_token', token);
  else localStorage.removeItem('hisabx_jwt_token');
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
  }

  return data;
}

export const api = {
  // Auth
  register: (payload: any) => request<any>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload: any) => request<any>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  me: () => request<any>('/auth/me'),

  // SaaS Subscriptions
  getSubscriptionStatus: () => request<any>('/subscription/status'),
  upgradeSubscription: (plan: string) => request<any>('/subscription/upgrade', { method: 'POST', body: JSON.stringify({ plan }) }),

  // Bank Statement AI Parsing
  parseStatement: (content: string, commit = false) => request<any>('/statement/parse', { method: 'POST', body: JSON.stringify({ content, commit }) }),

  // Splitwise Groups
  getGroups: () => request<any>('/groups'),
  createGroup: (payload: any) => request<any>('/groups', { method: 'POST', body: JSON.stringify(payload) }),
  addGroupExpense: (groupId: string, payload: any) => request<any>(`/groups/${groupId}/expenses`, { method: 'POST', body: JSON.stringify(payload) }),

  // Health
  checkHealth: () => request<any>('/health'),
};

import {
  type AuthSuccessResponse,
  type LoginRequest,
  type MeResponse,
  type RefreshResponse,
  type RegisterRequest,
  type UpdateMeRequest,
  type UpdateMeResponse,
} from '@quorum/shared';
import type { ApiClient } from './client';

export interface AuthApi {
  register: (req: RegisterRequest) => Promise<AuthSuccessResponse>;
  login: (req: LoginRequest) => Promise<AuthSuccessResponse>;
  refresh: (refreshToken: string) => Promise<RefreshResponse>;
  logout: (refreshToken: string) => Promise<void>;
  me: () => Promise<MeResponse>;
  updateMe: (req: UpdateMeRequest) => Promise<UpdateMeResponse>;
}

export function makeAuthApi(api: ApiClient): AuthApi {
  return {
    register: (req) =>
      api.request<AuthSuccessResponse>('/auth/register', {
        method: 'POST',
        body: req,
        skipRefresh: true,
      }),
    login: (req) =>
      api.request<AuthSuccessResponse>('/auth/login', {
        method: 'POST',
        body: req,
        skipRefresh: true,
      }),
    refresh: (refreshToken) =>
      api.request<RefreshResponse>('/auth/refresh', {
        method: 'POST',
        body: { refreshToken },
        skipRefresh: true,
      }),
    logout: (refreshToken) =>
      api.request<void>('/auth/logout', {
        method: 'POST',
        body: { refreshToken },
        skipRefresh: true,
      }),
    me: () => api.request<MeResponse>('/auth/me', { method: 'GET' }),
    updateMe: (req) =>
      api.request<UpdateMeResponse>('/users/me', {
        method: 'PATCH',
        body: req,
      }),
  };
}

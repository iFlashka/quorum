export type AuthErrorCode =
  | 'invalid_credentials'
  | 'username_taken'
  | 'invite_invalid'
  | 'invite_exhausted'
  | 'invite_expired'
  | 'refresh_invalid'
  | 'refresh_replay'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly statusCode: number;

  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.statusCode = STATUS_BY_CODE[code];
    this.name = 'AuthError';
  }
}

const STATUS_BY_CODE: Record<AuthErrorCode, number> = {
  invalid_credentials: 401,
  username_taken: 409,
  invite_invalid: 400,
  invite_exhausted: 410,
  invite_expired: 410,
  refresh_invalid: 401,
  refresh_replay: 401,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
};

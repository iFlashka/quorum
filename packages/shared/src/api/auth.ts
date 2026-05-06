import { z } from 'zod';
import { PrivateUserSchema, PublicGuildSchema } from '../domain/user.js';

export const UsernameSchema = z
  .string()
  .min(3, 'не меньше 3 символов')
  .max(32, 'не больше 32 символов')
  .regex(/^[a-z0-9_]+$/, 'только латинские буквы в нижнем регистре, цифры и _')
  .transform((v) => v.toLowerCase());

export const PasswordSchema = z
  .string()
  .min(8, 'минимум 8 символов')
  .max(256, 'слишком длинный');

export const DisplayNameSchema = z.string().min(1).max(48);

export const InviteCodeSchema = z
  .string()
  .min(6)
  .max(32)
  .regex(/^[A-Za-z0-9]+$/, 'только латинские буквы и цифры');

export const RegisterRequestSchema = z.object({
  username: UsernameSchema,
  password: PasswordSchema,
  displayName: DisplayNameSchema,
  email: z.string().email().optional(),
  inviteCode: InviteCodeSchema,
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  username: UsernameSchema,
  password: PasswordSchema,
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(20),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const LogoutRequestSchema = RefreshRequestSchema;
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;

export const TokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresAt: z.string().datetime(),
  refreshTokenExpiresAt: z.string().datetime(),
});
export type TokenPair = z.infer<typeof TokenPairSchema>;

export const AuthSuccessResponseSchema = z.object({
  user: PrivateUserSchema,
  tokens: TokenPairSchema,
});
export type AuthSuccessResponse = z.infer<typeof AuthSuccessResponseSchema>;

export const RefreshResponseSchema = z.object({
  tokens: TokenPairSchema,
});
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

export const MeResponseSchema = z.object({
  user: PrivateUserSchema,
  guilds: z.array(PublicGuildSchema),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

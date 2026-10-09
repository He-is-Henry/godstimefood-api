import { type User } from '@prisma/client';
import { type Response } from 'express';

export const handleTokenRes = (
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
  action = 'Sign in',
  user?: Omit<User, 'password'>,
) => {
  const { accessToken, refreshToken } = tokens;
  res.cookie('refreshToken', refreshToken, {
    maxAge: 1000 * 60 * 60 * 24 * 30,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });

  return res.status(200).json({
    message: `${action} successful`,
    accessToken,
    user,
  });
};

export const removeCookie = (res: Response) => {
  return res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
};

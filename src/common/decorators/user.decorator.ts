import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { type Request } from 'express';

export const User = createParamDecorator(
  (data: keyof JwtPayload | undefined, context: ExecutionContext) => {
    const request: Request = context.switchToHttp().getRequest();

    const user = request.user;

    if (!user) return null;

    return data ? user?.[data] : user;
  },
);

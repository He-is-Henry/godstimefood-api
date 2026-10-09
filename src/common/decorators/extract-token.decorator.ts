import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { type Request } from 'express';

export const ExtractToken = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request: Request = context.switchToHttp().getRequest();
    console.log('cookies', request.cookies);
    return request.cookies.refreshToken as string | undefined;
  },
);

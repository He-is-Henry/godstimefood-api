import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request } from 'express';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request: Request = context.switchToHttp().getRequest();

    const authHeader: string | undefined = request.headers['authorization'];
    const headerValid = authHeader?.startsWith('Bearer ');

    if (!authHeader || !headerValid)
      throw new UnauthorizedException('Access token not present in header');

    const accessToken: string = authHeader.split('Bearer ')[1];

    try {
      const decoded: JwtPayload = this.jwtService.verify(accessToken);

      if (
        decoded.mustChangePassword &&
        !request.url.includes('change-password')
      )
        throw new BadRequestException('You must change your password');

      request.user = decoded;

      return true;
    } catch (e) {
      console.log(e);
      throw new UnauthorizedException('Access token malformed or expired');
    }
  }
}

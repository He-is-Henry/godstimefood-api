import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import * as bcrypt from 'bcrypt';
import { SignupDto } from './dto/signup.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { ISClientData } from 'src/common/decorators/client-data.decorator';
import { SessionsService } from 'src/sessions/sessions.service';
import { UpdateUserDto } from 'src/users/dto/update-user.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async signup(signupDto: SignupDto) {
    const userAlreadyExists = await this.usersService.findByEmail(
      signupDto.email,
    );

    if (userAlreadyExists)
      throw new ConflictException('User email already exists');

    const password = await bcrypt.hash(signupDto.password, 10);

    const user = await this.usersService.create({
      ...signupDto,
      password,
      role: 'CUSTOMER',
    });

    return {
      message: 'Account created successfully',
      user: {
        id: user.id,
      },
    };
  }

  async login(email: string, password: string, clientData: ISClientData) {
    const user = await this.usersService.findByEmail(email);

    if (!user) throw new NotFoundException('This email does not exist');

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches)
      throw new UnauthorizedException('Incorrect password, try again');

    const sessionId = crypto.randomUUID();

    const tokens = this.signTokens({
      id: user.id,
      email: user.email,
      sessionId,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    });

    const refreshTokenHash = this.hashToken(tokens.refreshToken);

    await this.sessionsService.create({
      ...clientData,
      id: sessionId,
      userId: user.id,
      refreshTokenHash,
    });

    const { password: pwd, ...safeUser } = user;

    void this.sessionsService.resolveLocation(sessionId, clientData.ipAddress);

    return { user: safeUser, tokens };
  }

  async refresh(refreshToken: string | undefined, clientData: ISClientData) {
    if (!refreshToken) throw new UnauthorizedException('Refresh token missing');

    let decoded: JwtPayload;
    try {
      decoded = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('REFRESH_TOKEN_SECRET'),
      });
    } catch {
      const unverified: JwtPayload = this.jwtService.decode(refreshToken);
      if (unverified?.sessionId) {
        await this.sessionsService.delete(unverified.sessionId);
      }

      throw new UnauthorizedException('Refresh token expired or malformed');
    }

    if (!decoded)
      throw new UnauthorizedException('Refresh token expired or malformed');

    const session = await this.sessionsService.findById(decoded.sessionId);

    if (!session) throw new UnauthorizedException('Session expired or invalid');

    const incomingTokenHash = this.hashToken(refreshToken);

    if (session.refreshTokenHash !== incomingTokenHash) {
      console.log('session refresh hash', session.refreshTokenHash);

      console.log('incoming refresh hash', incomingTokenHash);

      await this.sessionsService.delete(decoded.sessionId);
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findById(decoded.id);

    if (!user) throw new NotFoundException('User not found');

    const { id, mustChangePassword, role, email } = user;
    const sessionId = decoded.sessionId;

    const payload: JwtPayload = {
      id,
      sessionId,
      mustChangePassword,
      email,
      role,
    };

    const tokens = this.signTokens(payload);

    const refreshTokenHash: string = this.hashToken(tokens.refreshToken);

    await this.sessionsService.update(sessionId, {
      ...clientData,
      refreshTokenHash,
    });

    void this.sessionsService.resolveLocation(sessionId, clientData.ipAddress);

    return tokens;
  }

  async getProfile(id: number) {
    const user = await this.usersService.findById(id);

    if (!user) throw new NotFoundException('User not found');

    return user;
  }

  async editProfile(id: number, updateUserDto: UpdateUserDto) {
    return this.usersService.updateUser(id, updateUserDto);
  }

  async uploadAvatar(id: number, file: Express.Multer.File) {
    return this.usersService.uploadAvatar(id, file);
  }

  logout(sessionId: string) {
    return this.sessionsService.delete(sessionId);
  }

  signTokens(payload: JwtPayload) {
    const accessToken = this.jwtService.sign(payload); // default details

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('REFRESH_TOKEN_SECRET'),
      expiresIn: '30d',
    });

    return { accessToken, refreshToken };
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

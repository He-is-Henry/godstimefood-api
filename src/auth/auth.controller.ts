import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from 'src/common/decorators/public.decorator';
import { SignupDto } from './dto/signup.dto';
import {
  ClientData,
  type ISClientData,
} from 'src/common/decorators/client-data.decorator';
import { type Response } from 'express';
import {
  handleTokenRes,
  removeCookie,
} from 'src/common/utils/auth-cookie.util';
import { ExtractToken } from 'src/common/decorators/extract-token.decorator';
import { User } from 'src/common/decorators/user.decorator';
import { UpdateUserDto } from 'src/users/dto/update-user.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('signup')
  async signup(
    @Res() res: Response,
    @Body() signupDto: SignupDto,
    @ClientData() clientData: ISClientData,
  ) {
    await this.authService.signup(signupDto);

    return this.login(
      res,
      { email: signupDto.email, password: signupDto.password },
      clientData,
    );
  }

  @Public()
  @Post('login')
  async login(
    @Res() res: Response,
    @Body() loginDto: LoginDto,
    @ClientData() clientData: ISClientData,
  ) {
    const { user, tokens } = await this.authService.login(
      loginDto.email,
      loginDto.password,
      clientData,
    );

    return handleTokenRes(res, tokens, 'Sign in', user);
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Res() res: Response,
    @ExtractToken() refreshToken: string,
    @ClientData() clientData: ISClientData,
  ) {
    try {
      const tokens = await this.authService.refresh(refreshToken, clientData);

      return handleTokenRes(res, tokens, 'Refresh');
    } catch (e) {
      removeCookie(res);

      throw e;
    }
  }

  @Get('profile')
  async getProfile(@User('id') userId: number) {
    return this.authService.getProfile(userId);
  }

  @Patch()
  async editProfile(
    @User('id') userId: number,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.authService.editProfile(userId, updateUserDto);
  }

  @UseInterceptors(FileInterceptor('file'))
  @Patch()
  async uploadAvatar(
    @User('id') userId: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.authService.uploadAvatar(userId, file);
  }

  @Post('logout')
  async logout(@User('sessionId') sessionId: string, @Res() res: Response) {
    await this.authService.logout(sessionId);

    removeCookie(res);

    res.json({
      message: 'Logout successful',
    });
  }
}

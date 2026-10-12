import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SupabaseService } from 'src/supabase/supabase.service';
import { User } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseService: SupabaseService,
  ) {}

  formatUser<T extends Partial<User> | null>(user: T): NonNullable<T> {
    if (!user) throw new NotFoundException('User not found');

    if (user.avatar) {
      user.avatar = this.supabaseService.getFile(user.avatar);
    }

    return user;
  }

  create(createUserDto: CreateUserDto) {
    return this.prisma.user.create({
      data: createUserDto,
    });
  }

  async findByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) return null;

    if (user.avatar) {
      user.avatar = this.supabaseService.getFile(user.avatar);
    }

    return user;
  }

  async findById(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      omit: {
        password: true,
      },
    });

    return this.formatUser(user);
  }

  async updateUser(id: number, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.user.update({
      where: { id },
      data: updateUserDto,
      omit: {
        password: true,
      },
    });

    return this.formatUser(user);
  }

  async updatePassword(id: number, password: string) {
    const user = await this.prisma.user.update({
      where: {
        id,
      },
      data: {
        password,
      },
    });

    return this.formatUser(user);
  }

  async uploadAvatar(id: number, file: Express.Multer.File) {
    const user = await this.findById(id);

    if (!user) throw new NotFoundException('User not found');

    if (user.avatar) {
      await this.supabaseService.deleteFile(user.avatar);
    }

    const avatar = await this.supabaseService.uploadFile(file, 'avatars');

    return this.updateUser(id, {
      avatar,
    });
  }
}

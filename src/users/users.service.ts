import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SupabaseService } from 'src/supabase/supabase.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseService: SupabaseService,
  ) {}

  create(createUserDto: CreateUserDto) {
    return this.prisma.user.create({
      data: createUserDto,
    });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  findById(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      omit: {
        password: true,
      },
    });
  }

  updateUser(id: number, updateUserDto: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id },
      data: updateUserDto,
      omit: {
        password: true,
      },
    });
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

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';
import { SupabaseService } from 'src/supabase/supabase.service';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly supabaseService: SupabaseService,
  ) {}

  async findAll(page = 1, limit = 20, roles?: Role[]) {
    const skip = (page - 1) * limit;
    const where = roles && roles.length > 0 ? { role: { in: roles } } : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        omit: { password: true },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((u) => ({
        ...u,
        avatar: u.avatar ? this.supabaseService.getFile(u.avatar) : null,
      })),
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async create(dto: CreateUserDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new BadRequestException('Email is alrebady registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.usersService.create({
      ...dto,
      mustChangePassword: true,
      password: hashedPassword,
    });

    const { password, ...safeUser } = user;

    return safeUser;
  }

  async toggleActive(
    currentUserId: number,
    targetUserId: number,
    active: boolean,
  ) {
    if (currentUserId === targetUserId) {
      throw new BadRequestException('You cannot change your own active status');
    }

    const [currentUser, targetUser] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: currentUserId } }),
      this.prisma.user.findUnique({ where: { id: targetUserId } }),
    ]);

    if (!targetUser || !currentUser) {
      throw new NotFoundException('User not found');
    }

    if (
      targetUser.role === Role.ADMIN &&
      targetUser.createdAt <= currentUser.createdAt
    ) {
      throw new ForbiddenException(
        'You cannot modify an admin account created before or alongside yours',
      );
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { active },
      omit: { password: true },
    });

    if (!active) {
      await this.prisma.session.deleteMany({
        where: { userId: targetUserId },
      });
    }

    return updatedUser;
  }

  async updateRole(currentUserId: number, targetUserId: number, newRole: Role) {
    if (currentUserId === targetUserId) {
      throw new BadRequestException('You cannot alter your own role');
    }

    const [currentUser, targetUser] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: currentUserId } }),
      this.prisma.user.findUnique({ where: { id: targetUserId } }),
    ]);

    if (!targetUser || !currentUser) {
      throw new NotFoundException('User not found');
    }

    if (
      targetUser.role === Role.ADMIN &&
      targetUser.createdAt <= currentUser.createdAt
    ) {
      throw new ForbiddenException(
        'You cannot alter the role of an admin account created before or alongside yours',
      );
    }

    return this.prisma.user.update({
      where: { id: targetUserId },
      data: { role: newRole },
      omit: { password: true },
    });
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from 'src/common/decorators/roles.decorator';
import { User } from 'src/common/decorators/user.decorator';
import { AdminUsersService } from './admin-users.service';
import { CreateUserDto } from './dto/create-user.dto';

@Roles(Role.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('roles') roles?: string,
  ) {
    const roleArray = roles
      ? (roles.split(',').map((r) => r.trim().toUpperCase()) as Role[])
      : undefined;

    return this.adminUsersService.findAll(
      page ? +page : 1,
      limit ? +limit : 20,
      roleArray,
    );
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.adminUsersService.create(dto);
  }

  @Patch(':id/active')
  toggleActive(
    @User('id') currentUserId: number,
    @Param('id') targetUserId: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.adminUsersService.toggleActive(
      currentUserId,
      +targetUserId,
      isActive,
    );
  }

  @Patch(':id/role')
  updateRole(
    @User('id') currentUserId: number,
    @Param('id') targetUserId: string,
    @Body('role') role: Role,
  ) {
    return this.adminUsersService.updateRole(
      currentUserId,
      +targetUserId,
      role,
    );
  }
}

import { IsInt, IsString } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  id!: string;

  @IsInt()
  userId!: number;

  @IsString()
  refreshTokenHash!: string;

  @IsString()
  deviceInfo!: string;

  @IsString()
  ipAddress!: string;
}

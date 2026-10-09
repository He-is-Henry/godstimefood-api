import { IsString, IsOptional } from 'class-validator';

export class CreateAddressDto {
  @IsString()
  address!: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  label?: string;
}

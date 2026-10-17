import { IsInt } from 'class-validator';

export class AssignOrderDto {
  @IsInt()
  assignedToId!: number;
}

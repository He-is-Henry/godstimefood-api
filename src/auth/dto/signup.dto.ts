import { IsEmail, IsString, IsStrongPassword } from 'class-validator';

export class SignupDto {
  @IsEmail()
  email!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsStrongPassword(
    {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    },
    {
      message:
        'Password must be at least 8 characters long and contain an uppercase letter, lowercase letter, number, and special character.',
    },
  )
  password!: string;
}

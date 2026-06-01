import { IsEmail, IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Format email tidak valid' })
  @IsNotEmpty({ message: 'Email tidak boleh kosong' })
  email!: string;

  @MinLength(8, { message: 'Password minimal 8 karakter' })
  @IsNotEmpty({ message: 'Password tidak boleh kosong' })
  password!: string;

  @IsOptional()
  name?: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'Format email tidak valid' })
  @IsNotEmpty({ message: 'Email tidak boleh kosong' })
  email!: string;

  @IsNotEmpty({ message: 'Password tidak boleh kosong' })
  password!: string;
}

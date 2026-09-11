import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @IsNotEmpty() motDePasse!: string;
}

export class RefreshDto {
  @ApiProperty() @IsString() @IsNotEmpty() refreshToken!: string;
}

export class ChangerMotDePasseDto {
  @ApiProperty() @IsString() @IsNotEmpty() ancienMotDePasse!: string;
  @ApiProperty({ minLength: 12 }) @IsString() @MinLength(12) nouveauMotDePasse!: string;
}

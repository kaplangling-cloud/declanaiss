import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { EstMotDePasseRobuste } from '../../common/mot-de-passe.decorator';
import { MESSAGE_MOT_DE_PASSE } from '../../common/mot-de-passe';

export class LoginDto {
  /** Adresse e-mail ou nom d'utilisateur. */
  @ApiPropertyOptional({ description: "Adresse e-mail ou nom d'utilisateur" })
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(254) identifiant?: string;

  /**
   * Ancienne forme, conservee pour les postes dont l'application hors-ligne n'a pas
   * encore ete mise a jour : elle envoyait l'adresse sous ce nom.
   */
  @ApiPropertyOptional({ deprecated: true }) @IsOptional() @IsEmail() email?: string;

  @ApiProperty() @IsString() @IsNotEmpty() motDePasse!: string;
}

export class RefreshDto {
  @ApiProperty() @IsString() @IsNotEmpty() refreshToken!: string;
}

export class ChangerMotDePasseDto {
  @ApiProperty() @IsString() @IsNotEmpty() ancienMotDePasse!: string;
  @ApiProperty({ minLength: 8, description: MESSAGE_MOT_DE_PASSE }) @IsString() @EstMotDePasseRobuste() nouveauMotDePasse!: string;
}

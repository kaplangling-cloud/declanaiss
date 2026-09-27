import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { FONCTIONS_PERSONNEL, FonctionPersonnel } from '../../common/referentiel/fonctions-personnel';

export class CreerUtilisateurDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty({ minLength: 12 }) @IsString() @MinLength(12) motDePasse!: string;
  @ApiProperty() @IsString() nom!: string;
  @ApiProperty() @IsString() prenoms!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() telephone?: string;
  @ApiProperty({ enum: Role }) @IsEnum(Role) role!: Role;
  @ApiPropertyOptional() @IsOptional() @IsUUID() centreId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() mairieId?: string;
  /** Lie ce compte a une fiche de personnel de sante existante. */
  @ApiPropertyOptional() @IsOptional() @IsUUID() personnelSanteId?: string;
  /**
   * Fonction du personnel de sante (compte PERSONNEL_SANTE uniquement). Sans fiche
   * existante, une fiche de personnel habilite est creee avec cette fonction.
   */
  @ApiPropertyOptional({ enum: FONCTIONS_PERSONNEL }) @IsOptional() @IsIn(FONCTIONS_PERSONNEL) fonction?: FonctionPersonnel;
}

export class ModifierUtilisateurDto extends PartialType(CreerUtilisateurDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() actif?: boolean;
}

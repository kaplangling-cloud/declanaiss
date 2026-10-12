import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsIn, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { EstMotDePasseRobuste } from '../../common/mot-de-passe.decorator';
import { MESSAGE_MOT_DE_PASSE } from '../../common/mot-de-passe';
import { FORMAT_NOM_UTILISATEUR, MESSAGE_FORMAT_NOM_UTILISATEUR, normaliserNomUtilisateur } from '../nom-utilisateur';
import { FONCTIONS_PERSONNEL, FonctionPersonnel } from '../../common/referentiel/fonctions-personnel';

export class CreerUtilisateurDto {
  @ApiProperty() @IsEmail() email!: string;
  /**
   * Identifiant de connexion, obligatoire a la creation : l'utilisateur se connecte
   * avec son nom d'utilisateur ou son adresse e-mail.
   */
  @ApiProperty({ example: 'r.ngo', description: MESSAGE_FORMAT_NOM_UTILISATEUR })
  @Transform(({ value }) => normaliserNomUtilisateur(value))
  @IsString() @Matches(FORMAT_NOM_UTILISATEUR, { message: MESSAGE_FORMAT_NOM_UTILISATEUR }) nomUtilisateur!: string;
  @ApiProperty({ minLength: 8, description: MESSAGE_MOT_DE_PASSE }) @IsString() @EstMotDePasseRobuste() motDePasse!: string;
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

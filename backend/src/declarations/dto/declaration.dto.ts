import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ModeAccouchement, Sexe, StatutDeclaration, TermeGrossesse, TypePieceJointe } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsISO8601, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID,
  Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

/**
 * Charge utile d'une declaration. Tous les champs sont optionnels au niveau
 * du transport (brouillons partiels, saisie hors-ligne) ; la completude est
 * verifiee a la soumission par `DeclarationsService.validerPourSoumission`.
 */
export class DeclarationPayloadDto {
  // --- Enfant ---
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) enfantNom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) enfantPrenoms?: string;
  @ApiPropertyOptional({ enum: Sexe }) @IsOptional() @IsEnum(Sexe) enfantSexe?: Sexe;
  @ApiPropertyOptional({ example: '2026-02-17' }) @IsOptional() @IsDateString() enfantDateNaissance?: string;
  @ApiPropertyOptional({ example: '14:35' }) @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) enfantHeureNaissance?: string;
  @ApiPropertyOptional({ enum: ModeAccouchement }) @IsOptional() @IsEnum(ModeAccouchement) modeAccouchement?: ModeAccouchement;
  @ApiPropertyOptional({ enum: TermeGrossesse }) @IsOptional() @IsEnum(TermeGrossesse) termeGrossesse?: TermeGrossesse;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(4) @Max(9) moisGrossesse?: number;
  @ApiPropertyOptional({ description: 'grammes' }) @IsOptional() @IsInt() @Min(300) @Max(8000) poidsNaissanceGrammes?: number;

  // --- Pere ---
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) pereNom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) perePrenoms?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) pereProfession?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) pereDomicile?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) pereNationalite?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() pereDateNaissance?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) pereLieuNaissance?: string;
  @ApiPropertyOptional({ description: 'Numero CNI (chiffre au repos)' }) @IsOptional() @IsString() @MaxLength(40) pereCniNumero?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() pereCniDateDelivrance?: string;

  // --- Mere ---
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) mereNom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) merePrenoms?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) mereProfession?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) mereDomicile?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) mereNationalite?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() mereDateNaissance?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) mereLieuNaissance?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) mereCniNumero?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() mereCniDateDelivrance?: string;

  // --- Personnel medical / declarant ---
  @ApiPropertyOptional() @IsOptional() @IsUUID() personnelAccoucheurId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() declarantEstPersonnel?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) declarantNom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) declarantPrenoms?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) declarantQualite?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) declarantContact?: string;

  // --- Extension sans migration ---
  @ApiPropertyOptional() @IsOptional() @IsObject() donneesComplementaires?: Record<string, unknown>;
}

export class CreerDeclarationDto extends DeclarationPayloadDto {
  @ApiProperty({ description: 'UUID genere cote client (idempotence hors-ligne)' })
  @IsUUID() clientUuid!: string;

  @ApiPropertyOptional({ description: 'Horodatage local de la saisie' })
  @IsOptional() @IsISO8601() saisieLe?: string;
}

export class ModifierDeclarationDto extends DeclarationPayloadDto {
  @ApiProperty({ description: 'Version connue du client (verrou optimiste)' })
  @IsInt() @Min(1) version!: number;
}

export class RejeterDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(1000) motif!: string;
}

export class ListerDeclarationsDto {
  @ApiPropertyOptional({ enum: StatutDeclaration }) @IsOptional() @IsEnum(StatutDeclaration) statut?: StatutDeclaration;
  @ApiPropertyOptional() @IsOptional() @IsUUID() centreId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) recherche?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() du?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() au?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) taille?: number;
}

// ---------------------------------------------------------------- SYNC

export enum ActionSync {
  ENREGISTRER = 'ENREGISTRER',
  SOUMETTRE = 'SOUMETTRE',
}

export class ElementSyncDto {
  @ApiProperty() @IsUUID() clientUuid!: string;
  @ApiProperty({ enum: ActionSync }) @IsEnum(ActionSync) action!: ActionSync;
  /** Version serveur connue du client ; 0 si jamais synchronisee. */
  @ApiProperty() @IsInt() @Min(0) versionBase!: number;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() saisieLe?: string;
  /** Force l'ecrasement en cas de conflit (uniquement si le serveur est encore en brouillon). */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() forcer?: boolean;
  @ApiProperty({ type: DeclarationPayloadDto }) @ValidateNested() @Type(() => DeclarationPayloadDto) payload!: DeclarationPayloadDto;
}

export class LotSyncDto {
  @ApiProperty({ type: [ElementSyncDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => ElementSyncDto) elements!: ElementSyncDto[];
}

export class AjouterPieceDto {
  @ApiProperty({ enum: TypePieceJointe }) @IsEnum(TypePieceJointe) type!: TypePieceJointe;
}

export class DemanderRectificationDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(2000) motif!: string;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) champsCibles!: string[];
  @ApiProperty({ type: DeclarationPayloadDto }) @ValidateNested() @Type(() => DeclarationPayloadDto) valeursApres!: DeclarationPayloadDto;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) referenceLegale?: string;
}

export class DeciderRectificationDto {
  @ApiProperty() @IsBoolean() approuver!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) commentaire?: string;
}

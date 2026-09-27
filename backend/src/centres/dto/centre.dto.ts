import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { FONCTIONS_PERSONNEL, FonctionPersonnel } from '../../common/referentiel/fonctions-personnel';

export class CreerCentreDto {
  @ApiProperty({ example: 'EBOL01' }) @IsString() @Matches(/^[A-Z0-9]{2,10}$/) code!: string;
  @ApiProperty() @IsString() @MaxLength(200) nom!: string;
  @ApiProperty() @IsString() adresse!: string;

  @ApiProperty() @IsString() numeroAutorisation!: string;
  @ApiProperty() @IsDateString() autorisationDateDelivrance!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() autorisationDateFinValidite?: string;

  @ApiProperty() @IsUUID() regionId!: string;
  @ApiProperty() @IsUUID() departementId!: string;
  @ApiProperty() @IsUUID() arrondissementId!: string;
  @ApiProperty() @IsUUID() mairieId!: string;

  @ApiProperty() @IsString() chefNom!: string;
  @ApiProperty() @IsString() chefFonction!: string;
  @ApiProperty() @IsString() chefContact!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() telephone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
}

export class ModifierCentreDto extends PartialType(CreerCentreDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() actif?: boolean;
}

export class CreerPersonnelDto {
  @ApiProperty() @IsString() nom!: string;
  @ApiProperty() @IsString() prenoms!: string;
  @ApiProperty({ enum: FONCTIONS_PERSONNEL }) @IsIn(FONCTIONS_PERSONNEL) fonction!: FonctionPersonnel;
  @ApiPropertyOptional() @IsOptional() @IsString() numeroOrdre?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() telephone?: string;
}

export class ModifierPersonnelDto extends PartialType(CreerPersonnelDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() habilite?: boolean;
}

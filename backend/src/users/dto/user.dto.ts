import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

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
}

export class ModifierUtilisateurDto extends PartialType(CreerUtilisateurDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() actif?: boolean;
}

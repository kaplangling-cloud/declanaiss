import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class EditerActeDto {
  @ApiPropertyOptional({ description: 'Par defaut : aujourd\'hui' }) @IsOptional() @IsDateString() dateDressage?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) secretaireNomComplet?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) mentionMarginale?: string;
}

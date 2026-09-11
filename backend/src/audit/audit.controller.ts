import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActionAudit, Role } from '@prisma/client';
import { IsEnum, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Roles } from '../common/decorators';
import { AuditService } from './audit.service';

class RechercheAuditDto {
  @IsOptional() @IsString() entite?: string;
  @IsOptional() @IsString() entiteId?: string;
  @IsOptional() @IsString() declarationId?: string;
  @IsOptional() @IsString() acteurId?: string;
  @IsOptional() @IsEnum(ActionAudit) action?: ActionAudit;
  @IsOptional() @IsISO8601() du?: string;
  @IsOptional() @IsISO8601() au?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) taille?: number;
}

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
@Roles(Role.ADMIN_NATIONAL)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** Journal d'audit consultable par l'administrateur national. */
  @Get()
  rechercher(@Query() q: RechercheAuditDto) {
    return this.audit.rechercher({
      ...q,
      du: q.du ? new Date(q.du) : undefined,
      au: q.au ? new Date(q.au) : undefined,
    });
  }

  /** Verification d'integrite de la chaine de hash. */
  @Get('integrite')
  integrite() {
    return this.audit.verifierChaine();
  }
}

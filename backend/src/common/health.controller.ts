import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from './decorators';

@ApiTags('sante')
@Controller('sante')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Sonde de vivacite (Docker healthcheck, supervision). */
  @Public()
  @Get()
  async sante() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { statut: 'ok', horodatage: new Date().toISOString() };
  }
}

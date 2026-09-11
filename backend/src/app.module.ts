import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CentresModule } from './centres/centres.module';
import { MairiesModule } from './mairies/mairies.module';
import { DeclarationsModule } from './declarations/declarations.module';
import { ActesModule } from './actes/actes.module';
import { AuditModule } from './audit/audit.module';
import { VerificationModule } from './verification/verification.module';
import { StatsModule } from './stats/stats.module';
import { JobsModule } from './jobs/jobs.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL || 60) * 1000,
        limit: Number(process.env.THROTTLE_LIMIT || 120),
      },
    ]),
    ScheduleModule.forRoot(),
    PrismaModule,
    StorageModule,
    CommonModule,
    AuthModule,
    UsersModule,
    CentresModule,
    MairiesModule,
    DeclarationsModule,
    ActesModule,
    AuditModule,
    VerificationModule,
    StatsModule,
    JobsModule,
  ],
  providers: [
    // Ordre important : throttling -> authentification -> autorisation par role
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

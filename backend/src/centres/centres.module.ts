import { Module } from '@nestjs/common';
import { CentresService } from './centres.service';
import { CentresController } from './centres.controller';

@Module({
  providers: [CentresService],
  controllers: [CentresController],
  exports: [CentresService],
})
export class CentresModule {}

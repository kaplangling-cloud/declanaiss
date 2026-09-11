import { Module } from '@nestjs/common';
import { ActesService } from './actes.service';
import { ActesController } from './actes.controller';
import { PdfActeService } from './pdf-acte.service';

@Module({
  providers: [ActesService, PdfActeService],
  controllers: [ActesController],
  exports: [ActesService],
})
export class ActesModule {}

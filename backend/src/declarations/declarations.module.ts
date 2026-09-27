import { Module } from '@nestjs/common';
import { DeclarationsService } from './declarations.service';
import { DeclarationsController } from './declarations.controller';
import { PdfDeclarationService } from './pdf-declaration.service';

@Module({
  providers: [DeclarationsService, PdfDeclarationService],
  controllers: [DeclarationsController],
  exports: [DeclarationsService],
})
export class DeclarationsModule {}

import { Module } from '@nestjs/common';
import { DeclarationsService } from './declarations.service';
import { DeclarationsController } from './declarations.controller';

@Module({
  providers: [DeclarationsService],
  controllers: [DeclarationsController],
  exports: [DeclarationsService],
})
export class DeclarationsModule {}

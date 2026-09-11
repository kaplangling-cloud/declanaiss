import { Global, Module } from '@nestjs/common';
import { CryptoService } from './services/crypto.service';
import { NumerotationService } from './services/numerotation.service';
import { HealthController } from './health.controller';

@Global()
@Module({
  controllers: [HealthController],
  providers: [CryptoService, NumerotationService],
  exports: [CryptoService, NumerotationService],
})
export class CommonModule {}

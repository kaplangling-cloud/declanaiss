import { Global, Module } from '@nestjs/common';
import { CryptoService } from './services/crypto.service';
import { MailService } from './services/mail.service';
import { NumerotationService } from './services/numerotation.service';
import { HealthController } from './health.controller';

@Global()
@Module({
  controllers: [HealthController],
  providers: [CryptoService, MailService, NumerotationService],
  exports: [CryptoService, MailService, NumerotationService],
})
export class CommonModule {}

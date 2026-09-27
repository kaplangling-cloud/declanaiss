import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Journalisation applicative : jamais de donnee personnelle dans les logs
    logger: ['error', 'warn', 'log'],
  });

  // L'API n'est joignable que derriere Nginx : on ne fait confiance qu'a ce seul saut.
  // req.ip devient l'adresse ajoutee par Nginx a X-Forwarded-For, que le client ne peut
  // pas forger. Sans ce reglage, tous les clients partageaient l'IP du conteneur Nginx :
  // un seul compteur de limitation de debit pour tout le pays (10 connexions / minute).
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

  const prefix = process.env.API_PREFIX || 'api';
  app.setGlobalPrefix(prefix);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));

  app.enableCors({
    origin: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(','),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Declaration de naissance en ligne')
      .setDescription('API centres de sante -> mairies')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(`${prefix}/docs`, app, SwaggerModule.createDocument(app, config));
  }

  const port = Number(process.env.API_PORT || 3000);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`API demarree sur le port ${port} (prefixe /${prefix})`);
}

void bootstrap();

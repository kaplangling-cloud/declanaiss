import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { extname, isAbsolute, join, resolve } from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * Regles de cache de l'interface, reprises de `nginx/nginx.prod.conf`.
 * Les fichiers d'`assets/` portent une empreinte dans leur nom : ils sont
 * immuables. Le service worker, son script d'enregistrement, le manifeste et
 * l'index ne doivent jamais etre servis depuis le cache, sinon un poste reste
 * indefiniment sur une version perimee de l'application.
 */
const SANS_CACHE = /(^|\/)(sw\.js|registerSW\.js|manifest\.webmanifest|index\.html)$/;

function appliquerCache(res: Response, chemin: string): void {
  if (SANS_CACHE.test(chemin.replace(/\\/g, '/'))) {
    res.setHeader('Cache-Control', 'no-cache');
    if (chemin.endsWith('.webmanifest')) {
      // Express sait deja typer .webmanifest ; on le fixe explicitement car un
      // type errone (application/octet-stream) empeche l'installation de la PWA.
      res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    }
    return;
  }
  if (chemin.replace(/\\/g, '/').includes('/assets/')) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=3600');
}

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

  // En-tetes de securite. La politique reprend celle de `nginx/nginx.prod.conf`
  // mot pour mot : derriere Nginx elle ne concerne que les reponses de l'API,
  // mais quand l'API sert elle-meme l'interface (hebergement sans Nginx, cf.
  // FRONTEND_DIST) elle devient la seule politique appliquee aux pages.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'same-site' },
      frameguard: { action: 'deny' },
      hsts: { maxAge: 63072000, includeSubDomains: true },
      // Aucun referent transmis : les chemins portent des identifiants de
      // declaration, et rien dans l'application ne depend de cet en-tete
      // (la CSP n'autorise aucune ressource tierce). Fixe explicitement pour
      // que les deux deploiements annoncent la meme politique.
      referrerPolicy: { policy: 'no-referrer' },
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'"],
          // Apercu des PDF produits dans le navigateur (URL blob:)
          frameSrc: ['blob:'],
          // Service worker du mode hors-ligne
          workerSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );

  // Service de l'interface par l'API. Sur un hebergement sans Nginx (Hostinger),
  // FRONTEND_DIST designe le build de la SPA : l'API devient alors le seul
  // serveur HTTP, et reprend le repli SPA, les regles de cache et l'en-tete
  // Permissions-Policy que Nginx assurait. Sous Docker la variable reste vide et
  // Nginx garde ce role : rien ne change.
  const frontendDist = process.env.FRONTEND_DIST;
  if (frontendDist) {
    // Un chemin relatif est resolu depuis la racine de l'application (le dossier
    // qui contient `dist/`), jamais depuis le repertoire courant : un hebergeur
    // peut demarrer le processus depuis n'importe ou, et l'interface serait alors
    // introuvable — toutes les pages renverraient 404.
    const racine = isAbsolute(frontendDist)
      ? frontendDist
      : resolve(__dirname, '..', frontendDist);

    app.use((_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('Permissions-Policy', 'camera=(self), geolocation=()');
      next();
    });

    app.useStaticAssets(racine, {
      index: false,
      redirect: false,
      setHeaders: (res: Response, chemin: string) => appliquerCache(res, chemin),
    });

    // Repli SPA : toute route de navigation renvoie l'index, le routeur client
    // prend le relais. Une requete vers un fichier absent reste un 404 : sans
    // cette reserve, un asset retire par un nouveau build renverrait du HTML a
    // la place d'un script, et l'erreur serait indechiffrable au navigateur.
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path === `/${prefix}` || req.path.startsWith(`/${prefix}/`)) return next();
      if (extname(req.path)) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(racine, 'index.html'), (erreur) => {
        if (erreur) next(erreur);
      });
    });
  }

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

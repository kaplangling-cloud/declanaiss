import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/**
 * Reponses d'erreur homogenes. Les erreurs Prisma sont traduites (conflit
 * d'unicite -> 409) et les details techniques ne sont jamais exposes.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Erreur interne';
    let code = 'ERREUR_INTERNE';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message = typeof body === 'string' ? body : ((body as any).message ?? exception.message);
      code = (body as any)?.code ?? HttpStatus[status];
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        message = 'Un enregistrement identique existe deja';
        code = 'CONFLIT_UNICITE';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'Ressource introuvable';
        code = 'INTROUVABLE';
      }
      this.logger.warn(`Prisma ${exception.code}: ${exception.message.split('\n').pop()}`);
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(status).json({ statusCode: status, code, message, timestamp: new Date().toISOString() });
  }
}

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { IS_PUBLIC_KEY, ROLES_KEY, UtilisateurCourant } from '../decorators';

/**
 * RBAC strict : une route sans @Roles() n'est accessible qu'authentifiee ;
 * une route avec @Roles() exige l'un des roles listes. Le cloisonnement
 * par centre / mairie est verifie en plus, au niveau des services.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const rolesRequis = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rolesRequis || rolesRequis.length === 0) return true;

    const user = context.switchToHttp().getRequest().user as UtilisateurCourant | undefined;
    if (!user || !rolesRequis.includes(user.role)) {
      throw new ForbiddenException("Votre role ne permet pas d'acceder a cette ressource");
    }
    return true;
  }
}

import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';

export const IS_PUBLIC_KEY = 'isPublic';
/** Route accessible sans authentification (login, verification publique). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** Restreint une route a une liste de roles (RBAC strict). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export interface UtilisateurCourant {
  id: string;
  email: string;
  role: Role;
  centreId: string | null;
  mairieId: string | null;
  nomComplet: string;
}

/** Injecte l'utilisateur authentifie dans un controleur. */
export const CurrentUser = createParamDecorator(
  (data: keyof UtilisateurCourant | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as UtilisateurCourant;
    return data ? user?.[data] : user;
  },
);

/**
 * Contexte de la requete pour la journalisation (IP, user-agent).
 * L'IP est celle qu'Express deduit selon `trust proxy` (cf. main.ts) : la premiere
 * valeur de X-Forwarded-For est fournie par le client et pouvait falsifier l'audit.
 */
export const RequestContext = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return {
    ip: req.ip as string | undefined,
    userAgent: req.headers['user-agent'] as string | undefined,
    ressource: `${req.method} ${req.route?.path ?? req.url}`,
  };
});

export interface ContexteRequete {
  ip?: string;
  userAgent?: string;
  ressource: string;
}

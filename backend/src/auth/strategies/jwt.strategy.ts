import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { UtilisateurCourant } from '../../common/decorators';

export interface JwtPayload {
  sub: string;
  role: string;
  typ: 'access' | 'refresh';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret'),
    });
  }

  /** Recharge l'utilisateur a chaque requete : un compte desactive perd
   *  l'acces immediatement, sans attendre l'expiration du token. */
  async validate(payload: JwtPayload): Promise<UtilisateurCourant> {
    if (payload.typ !== 'access') throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, centreId: true, mairieId: true, nom: true, prenoms: true, actif: true },
    });
    if (!user || !user.actif) throw new UnauthorizedException('Compte inactif');
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      centreId: user.centreId,
      mairieId: user.mairieId,
      nomComplet: `${user.prenoms} ${user.nom}`.trim(),
    };
  }
}

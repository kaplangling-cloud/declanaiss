import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ActionAudit } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/services/crypto.service';
import { AuditService } from '../audit/audit.service';
import { ContexteRequete, UtilisateurCourant } from '../common/decorators';
import { JwtPayload } from './strategies/jwt.strategy';

const MAX_TENTATIVES = 5;
const DUREE_BLOCAGE_MIN = 15;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  /** Hash jetable servant a egaliser le temps de reponse des echecs. */
  private hashFactice?: string;

  /**
   * argon2 est volontairement lent : ne pas l'executer lorsque le compte est
   * inconnu rendrait l'echec mesurablement plus rapide et permettrait
   * d'enumerer les adresses. On verifie donc contre un hash jetable.
   */
  private async verifierFactice(motDePasse: string): Promise<void> {
    this.hashFactice ??= await argon2.hash(this.crypto.tokenOpaque(32));
    await argon2.verify(this.hashFactice, motDePasse).catch(() => false);
  }

  async login(email: string, motDePasse: string, ctx: ContexteRequete) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { centre: { select: { id: true, nom: true, code: true } }, mairie: { select: { id: true, nom: true, code: true } } },
    });

    // Reponse identique que le compte existe ou non (anti-enumeration) :
    // meme message, et meme cout de calcul (cf. verifierFactice).
    const echec = () => new UnauthorizedException('Identifiants invalides');

    if (!user || !user.actif) {
      await this.verifierFactice(motDePasse);
      await this.audit.journaliser({
        entite: 'User', entiteId: user?.id ?? 'inconnu', action: ActionAudit.ECHEC_CONNEXION,
        metadonnees: { email, raison: user ? 'compte inactif' : 'compte inconnu' }, contexte: ctx,
      });
      throw echec();
    }

    if (user.bloqueJusquA && user.bloqueJusquA > new Date()) {
      // Le blocage n'est pas divulgue : l'annoncer revelerait que l'adresse
      // correspond a un compte existant. Le motif reste dans l'audit.
      await this.verifierFactice(motDePasse);
      await this.audit.journaliser({
        entite: 'User', entiteId: user.id, action: ActionAudit.ECHEC_CONNEXION,
        metadonnees: { raison: 'compte bloque', bloqueJusquA: user.bloqueJusquA.toISOString() }, contexte: ctx,
      });
      throw echec();
    }

    const ok = await argon2.verify(user.motDePasseHash, motDePasse);
    if (!ok) {
      const tentatives = user.tentativesEchouees + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          tentativesEchouees: tentatives,
          bloqueJusquA: tentatives >= MAX_TENTATIVES ? new Date(Date.now() + DUREE_BLOCAGE_MIN * 60_000) : null,
        },
      });
      await this.audit.journaliser({
        entite: 'User', entiteId: user.id, action: ActionAudit.ECHEC_CONNEXION,
        metadonnees: { tentatives }, contexte: ctx,
      });
      throw echec();
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { tentativesEchouees: 0, bloqueJusquA: null, derniereConnexion: new Date() },
    });

    const courant: UtilisateurCourant = {
      id: user.id, email: user.email, role: user.role, centreId: user.centreId, mairieId: user.mairieId,
      nomComplet: `${user.prenoms} ${user.nom}`.trim(),
    };
    const tokens = await this.emettreTokens(courant, ctx);

    await this.audit.journaliser({ entite: 'User', entiteId: user.id, action: ActionAudit.CONNEXION, acteur: courant, contexte: ctx });

    return {
      ...tokens,
      utilisateur: {
        ...courant,
        doitChangerMotDePasse: user.doitChangerMotDePasse,
        centre: user.centre,
        mairie: user.mairie,
      },
    };
  }

  /**
   * Rotation des refresh tokens : chaque refresh invalide le precedent.
   * La reutilisation d'un token deja consomme revoque toute la famille
   * (vol de token detecte).
   */
  async refresh(refreshToken: string, ctx: ContexteRequete) {
    let payload: JwtPayload & { fam: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: this.config.get('jwt.refreshSecret') });
    } catch {
      throw new UnauthorizedException('Refresh token invalide');
    }
    if (payload.typ !== 'refresh') throw new UnauthorizedException();

    const tokenHash = this.crypto.sha256(refreshToken);
    const stocke = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stocke || stocke.revoqueLe || stocke.expireLe < new Date()) {
      if (stocke?.revoqueLe) {
        await this.prisma.refreshToken.updateMany({
          where: { familleId: stocke.familleId, revoqueLe: null },
          data: { revoqueLe: new Date() },
        });
      }
      throw new UnauthorizedException('Session expiree, reconnectez-vous');
    }

    const user = await this.prisma.user.findUnique({ where: { id: stocke.userId } });
    if (!user || !user.actif) throw new UnauthorizedException('Compte inactif');

    await this.prisma.refreshToken.update({ where: { id: stocke.id }, data: { revoqueLe: new Date() } });

    const courant: UtilisateurCourant = {
      id: user.id, email: user.email, role: user.role, centreId: user.centreId, mairieId: user.mairieId,
      nomComplet: `${user.prenoms} ${user.nom}`.trim(),
    };
    return this.emettreTokens(courant, ctx, stocke.familleId);
  }

  async logout(refreshToken: string | undefined, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: this.crypto.sha256(refreshToken), revoqueLe: null },
        data: { revoqueLe: new Date() },
      });
    }
    await this.audit.journaliser({ entite: 'User', entiteId: acteur.id, action: ActionAudit.DECONNEXION, acteur, contexte: ctx });
    return { ok: true };
  }

  async changerMotDePasse(acteur: UtilisateurCourant, ancien: string, nouveau: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: acteur.id } });
    if (!(await argon2.verify(user.motDePasseHash, ancien))) {
      throw new BadRequestException('Ancien mot de passe incorrect');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: acteur.id },
        data: { motDePasseHash: await argon2.hash(nouveau), doitChangerMotDePasse: false },
      }),
      // Toutes les sessions sont invalidees
      this.prisma.refreshToken.updateMany({ where: { userId: acteur.id, revoqueLe: null }, data: { revoqueLe: new Date() } }),
    ]);
    return { ok: true };
  }

  private async emettreTokens(user: UtilisateurCourant, ctx: ContexteRequete, familleId?: string) {
    const famille = familleId ?? this.crypto.tokenOpaque(16);
    const accessToken = this.jwt.sign(
      { sub: user.id, role: user.role, typ: 'access' } satisfies JwtPayload,
      { secret: this.config.get('jwt.accessSecret'), expiresIn: this.config.get('jwt.accessTtl') },
    );
    const refreshToken = this.jwt.sign(
      { sub: user.id, role: user.role, typ: 'refresh', fam: famille, jti: this.crypto.tokenOpaque(8) },
      { secret: this.config.get('jwt.refreshSecret'), expiresIn: this.config.get('jwt.refreshTtl') },
    );
    const decoded = this.jwt.decode(refreshToken) as { exp: number };

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.crypto.sha256(refreshToken),
        familleId: famille,
        expireLe: new Date(decoded.exp * 1000),
        ip: ctx.ip,
        userAgent: ctx.userAgent?.slice(0, 300),
      },
    });
    return { accessToken, refreshToken };
  }
}

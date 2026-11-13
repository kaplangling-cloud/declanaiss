import { Injectable, UnauthorizedException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ActionAudit } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/services/crypto.service';
import { MailService } from '../common/services/mail.service';
import { AuditService } from '../audit/audit.service';
import { ContexteRequete, UtilisateurCourant } from '../common/decorators';
import { JwtPayload } from './strategies/jwt.strategy';
import { estAdresseEmail } from '../users/nom-utilisateur';

const MAX_TENTATIVES = 5;
const DUREE_BLOCAGE_MIN = 15;

/**
 * Duree de vie d'un lien de reinitialisation. Volontairement courte : le lien
 * donne acces au compte sans connaitre le mot de passe, et il transite par une
 * boite aux lettres dont on ne maitrise pas la securite.
 */
const DUREE_JETON_MIN = 30;

/**
 * Delai de garde entre deux envois pour un meme compte. La limitation de debit
 * du controleur porte sur l'adresse IP : elle n'empeche pas d'inonder la boite
 * d'un utilisateur connu depuis plusieurs postes, ni d'epuiser le quota d'envoi
 * de la messagerie — un quota depasse fait suspendre la boite chez l'hebergeur,
 * et la fonction tombe alors pour tout le monde.
 */
const DELAI_RENVOI_S = 60;

/**
 * Reponse unique de la demande de reinitialisation : elle ne doit jamais
 * laisser deviner si le compte existe, s'il est actif, ni si le courriel est
 * parti.
 */
const REPONSE_DEMANDE =
  "Si un compte correspond à cet identifiant, un message vient d'être envoyé à son adresse e-mail.";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
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

  /** `identifiant` : adresse e-mail, ou nom d'utilisateur (qui ne contient jamais "@"). */
  async login(identifiant: string, motDePasse: string, ctx: ContexteRequete) {
    const saisie = identifiant.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: estAdresseEmail(saisie) ? { email: saisie } : { nomUtilisateur: saisie },
      include: { centre: { select: { id: true, nom: true, code: true } }, mairie: { select: { id: true, nom: true, code: true } } },
    });

    // Reponse identique que le compte existe ou non (anti-enumeration) :
    // meme message, et meme cout de calcul (cf. verifierFactice).
    const echec = () => new UnauthorizedException('Identifiants invalides');

    if (!user || !user.actif) {
      await this.verifierFactice(motDePasse);
      await this.audit.journaliser({
        entite: 'User', entiteId: user?.id ?? 'inconnu', action: ActionAudit.ECHEC_CONNEXION,
        metadonnees: { identifiant: saisie, raison: user ? 'compte inactif' : 'compte inconnu' }, contexte: ctx,
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

  async changerMotDePasse(acteur: UtilisateurCourant, ancien: string, nouveau: string, ctx: ContexteRequete) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: acteur.id } });
    if (!(await argon2.verify(user.motDePasseHash, ancien))) {
      throw new BadRequestException('Ancien mot de passe incorrect');
    }
    const hash = await argon2.hash(nouveau);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: acteur.id }, data: { motDePasseHash: hash, doitChangerMotDePasse: false } });
      // Toutes les sessions sont invalidees
      await tx.refreshToken.updateMany({ where: { userId: acteur.id, revoqueLe: null }, data: { revoqueLe: new Date() } });
      // ... ainsi que les liens de reinitialisation en attente : un lien demande
      // puis oublie dans une boite aux lettres ne doit pas defaire ce changement.
      await tx.jetonMotDePasse.updateMany({
        where: { userId: acteur.id, utiliseLe: null, revoqueLe: null },
        data: { revoqueLe: new Date() },
      });
      // Evenement de securite : le journal n'en gardait jusqu'ici aucune trace
      await this.audit.journaliser({
        entite: 'User', entiteId: acteur.id, action: ActionAudit.MODIFICATION, acteur,
        metadonnees: { motDePasseChange: true, sessionsRevoquees: true }, contexte: ctx,
      }, tx);
    });
    return { ok: true };
  }

  /**
   * Demande de reinitialisation par courriel. `identifiant` est une adresse
   * e-mail ou un nom d'utilisateur, comme pour la connexion ; le message part
   * toujours vers l'adresse enregistree sur le compte, jamais vers une adresse
   * fournie par le demandeur.
   *
   * La reponse est identique dans tous les cas (compte inconnu, inactif, envoi
   * en echec) : annoncer autre chose permettrait d'enumerer les comptes. Pour
   * la meme raison l'envoi n'est pas attendu — il est lent et rendrait les
   * comptes existants mesurables au chronometre.
   */
  async demanderReinitialisation(identifiant: string, ctx: ContexteRequete) {
    if (!this.mail.estConfigure) {
      throw new ServiceUnavailableException(
        "La réinitialisation par e-mail n'est pas configurée sur ce serveur. Contactez un administrateur.",
      );
    }

    const saisie = identifiant.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: estAdresseEmail(saisie) ? { email: saisie } : { nomUtilisateur: saisie },
    });

    if (!user || !user.actif) {
      await this.audit.journaliser({
        entite: 'User', entiteId: user?.id ?? 'inconnu', action: ActionAudit.MODIFICATION,
        metadonnees: {
          demandeReinitialisation: true, envoye: false,
          raison: user ? 'compte inactif' : 'compte inconnu',
        },
        contexte: ctx,
      });
      return { ok: true, message: REPONSE_DEMANDE };
    }

    // Un lien recent et encore valable est conserve tel quel, sans nouvel envoi :
    // il reste utilisable, et la reponse ne change pas — rien ne doit distinguer
    // ce cas des autres.
    const recent = await this.prisma.jetonMotDePasse.findFirst({
      where: {
        userId: user.id,
        utiliseLe: null,
        revoqueLe: null,
        expireLe: { gt: new Date() },
        createdAt: { gt: new Date(Date.now() - DELAI_RENVOI_S * 1000) },
      },
      select: { id: true },
    });
    if (recent) {
      await this.audit.journaliser({
        entite: 'User', entiteId: user.id, action: ActionAudit.MODIFICATION,
        metadonnees: { demandeReinitialisation: true, envoye: false, raison: 'lien recent encore valable' },
        contexte: ctx,
      });
      return { ok: true, message: REPONSE_DEMANDE };
    }

    const jeton = this.crypto.tokenOpaque(32);
    const expireLe = new Date(Date.now() + DUREE_JETON_MIN * 60_000);

    await this.prisma.$transaction(async (tx) => {
      // Un seul lien valable a la fois : une nouvelle demande annule les precedentes.
      await tx.jetonMotDePasse.updateMany({
        where: { userId: user.id, utiliseLe: null, revoqueLe: null },
        data: { revoqueLe: new Date() },
      });
      await tx.jetonMotDePasse.create({
        data: {
          userId: user.id,
          tokenHash: this.crypto.sha256(jeton),
          expireLe,
          // Pose explicitement plutot que laisse au defaut de la colonne
          // (CURRENT_TIMESTAMP) : la base et l'API sont deux machines
          // distinctes en hebergement, et le delai de garde comparerait sinon
          // une date ecrite par l'une a une date calculee par l'autre.
          createdAt: new Date(),
          ip: ctx.ip,
          userAgent: ctx.userAgent?.slice(0, 300),
        },
      });
      // L'action reutilise MODIFICATION plutot que d'ajouter une valeur a
      // l'enum : le detail est dans les metadonnees, et la migration reste
      // purement additive.
      await this.audit.journaliser({
        entite: 'User', entiteId: user.id, action: ActionAudit.MODIFICATION,
        metadonnees: { demandeReinitialisation: true, envoye: true, expireLe: expireLe.toISOString() },
        contexte: ctx,
      }, tx);
    });

    const lien = `${this.config.get<string>('publicUrl')}/reinitialiser?jeton=${encodeURIComponent(jeton)}`;
    void this.mail.envoyerReinitialisation(user.email, `${user.prenoms} ${user.nom}`.trim(), lien, DUREE_JETON_MIN);

    return { ok: true, message: REPONSE_DEMANDE };
  }

  /**
   * Consomme un lien de reinitialisation et fixe le nouveau mot de passe.
   * Le jeton est a usage unique ; la reussite debloque aussi le compte, sans
   * quoi un utilisateur verrouille par cinq echecs resterait dehors apres
   * avoir pourtant prouve qu'il controle l'adresse.
   */
  async reinitialiserMotDePasse(jeton: string, nouveau: string, ctx: ContexteRequete) {
    const stocke = await this.prisma.jetonMotDePasse.findUnique({
      where: { tokenHash: this.crypto.sha256(jeton) },
      include: { user: { select: { id: true, actif: true } } },
    });

    // Message unique : un lien inconnu, deja utilise ou expire se valent.
    const invalide = () =>
      new BadRequestException('Lien de réinitialisation invalide, déjà utilisé ou expiré. Demandez-en un nouveau.');

    if (!stocke || stocke.utiliseLe || stocke.revoqueLe || stocke.expireLe < new Date() || !stocke.user.actif) {
      throw invalide();
    }

    const hash = await argon2.hash(nouveau);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: stocke.userId },
        data: {
          motDePasseHash: hash,
          doitChangerMotDePasse: false,
          tentativesEchouees: 0,
          bloqueJusquA: null,
        },
      });
      await tx.jetonMotDePasse.update({ where: { id: stocke.id }, data: { utiliseLe: new Date() } });
      await tx.jetonMotDePasse.updateMany({
        where: { userId: stocke.userId, utiliseLe: null, revoqueLe: null },
        data: { revoqueLe: new Date() },
      });
      // Toutes les sessions tombent : si le compte etait compromis, l'intrus perd la main.
      await tx.refreshToken.updateMany({
        where: { userId: stocke.userId, revoqueLe: null },
        data: { revoqueLe: new Date() },
      });
      await this.audit.journaliser({
        entite: 'User', entiteId: stocke.userId, action: ActionAudit.MODIFICATION,
        metadonnees: { motDePasseReinitialise: true, parLienCourriel: true, sessionsRevoquees: true },
        contexte: ctx,
      }, tx);
    });

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

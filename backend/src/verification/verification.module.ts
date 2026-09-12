import { Controller, Get, Injectable, Module, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { StatutDeclaration } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NumerotationService } from '../common/services/numerotation.service';
import { ContexteRequete, Public, RequestContext } from '../common/decorators';

export type ResultatVerification = {
  statut: 'AUTHENTIQUE' | 'INTROUVABLE';
  /** Type de document reconnu (aucune donnee personnelle) */
  type?: 'ACTE' | 'DECLARATION';
  /** Annee du registre, seule information contextuelle divulguee */
  annee?: number;
  verifieLe: string;
};

/**
 * Verification publique d'authenticite.
 * Accepte : le token du QR code, le numero d'acte (CODE/AAAA/NNNNN) ou le
 * numero de declaration (RG-CENTRE-AAAA-NNNNNN-CC).
 * Ne renvoie JAMAIS de donnee personnelle : uniquement authentique / introuvable.
 */
@Injectable()
export class VerificationService {
  constructor(private readonly prisma: PrismaService) {}

  async verifier(reference: string, ctx: ContexteRequete): Promise<ResultatVerification> {
    // Le numero d'acte contient des "/" : il arrive encode dans le chemin.
    // Une sequence d'echappement invalide ne doit pas produire une erreur 500.
    let ref: string;
    try {
      ref = decodeURIComponent(reference).trim();
    } catch {
      ref = reference.trim();
    }
    let resultat: ResultatVerification = { statut: 'INTROUVABLE', verifieLe: new Date().toISOString() };

    if (ref.length >= 6 && ref.length <= 80) {
      const refMaj = ref.toUpperCase();

      // 1. Numero d'acte
      const acte = /^[A-Z0-9]{2,10}\/\d{4}\/\d{5}$/.test(refMaj)
        ? await this.prisma.acte.findFirst({ where: { numeroActe: refMaj, annuleLe: null }, select: { anneeRegistre: true } })
        : null;
      if (acte) resultat = { ...resultat, statut: 'AUTHENTIQUE', type: 'ACTE', annee: acte.anneeRegistre };

      // 2. Numero de declaration (avec cle de controle)
      if (resultat.statut === 'INTROUVABLE' && NumerotationService.verifierFormat(refMaj)) {
        const d = await this.prisma.declaration.findFirst({
          where: { numeroDeclaration: refMaj, statut: { in: [StatutDeclaration.SOUMISE, StatutDeclaration.VALIDEE, StatutDeclaration.VERROUILLEE] } },
          select: { acte: { select: { anneeRegistre: true } }, dateSoumission: true },
        });
        if (d) resultat = { ...resultat, statut: 'AUTHENTIQUE', type: d.acte ? 'ACTE' : 'DECLARATION', annee: d.acte?.anneeRegistre ?? d.dateSoumission?.getFullYear() };
      }

      // 3. Token QR (sensible a la casse)
      if (resultat.statut === 'INTROUVABLE') {
        const d = await this.prisma.declaration.findFirst({
          where: { qrToken: ref, statut: { not: StatutDeclaration.BROUILLON } },
          select: { acte: { select: { anneeRegistre: true, annuleLe: true } }, dateSoumission: true },
        });
        if (d && !d.acte?.annuleLe) resultat = { ...resultat, statut: 'AUTHENTIQUE', type: d.acte ? 'ACTE' : 'DECLARATION', annee: d.acte?.anneeRegistre ?? d.dateSoumission?.getFullYear() };
      }
    }

    await this.prisma.verificationLog.create({
      data: { reference: ref.slice(0, 12) + (ref.length > 12 ? '…' : ''), resultat: resultat.statut, ip: ctx.ip ?? null },
    });
    return resultat;
  }
}

@ApiTags('verification')
@Controller('verification')
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(':reference')
  verifier(@Param('reference') reference: string, @RequestContext() ctx: ContexteRequete) {
    return this.verification.verifier(reference, ctx);
  }
}

@Module({
  providers: [VerificationService],
  controllers: [VerificationController],
})
export class VerificationModule {}

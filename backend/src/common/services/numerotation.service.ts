import { Injectable } from '@nestjs/common';
import { PrismaService, TxClient } from '../../prisma/prisma.service';

/**
 * Numero unique de declaration :
 *   {codeRegion}-{codeCentre}-{annee}-{sequence sur 6}-{cle de controle}
 * ex : CE-EBOL01-2026-000123-K7
 *
 * La sequence est attribuee dans la transaction de soumission, par un
 * verrou de ligne sur la table `sequences_declaration` (une seule sequence
 * par centre et par annee) : deux soumissions simultanees ne peuvent pas
 * obtenir le meme numero.
 */
@Injectable()
export class NumerotationService {
  private static readonly ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // sans I et O

  constructor(private readonly prisma: PrismaService) {}

  async attribuerNumero(
    tx: TxClient,
    params: { centreId: string; codeRegion: string; codeCentre: string; annee: number },
  ): Promise<{ numeroDeclaration: string; cleControle: string; sequence: number }> {
    // upsert + increment atomique : le SELECT ... FOR UPDATE est implicite
    // dans l'UPDATE, la ligne est verrouillee jusqu'au COMMIT.
    const existante = await tx.sequenceDeclaration.findUnique({
      where: { centreId_annee: { centreId: params.centreId, annee: params.annee } },
    });

    const sequence = existante
      ? (
          await tx.sequenceDeclaration.update({
            where: { id: existante.id },
            data: { dernierNumero: { increment: 1 } },
          })
        ).dernierNumero
      : (
          await tx.sequenceDeclaration.create({
            data: { centreId: params.centreId, annee: params.annee, dernierNumero: 1 },
          })
        ).dernierNumero;

    const base = [
      params.codeRegion.toUpperCase(),
      params.codeCentre.toUpperCase(),
      String(params.annee),
      String(sequence).padStart(6, '0'),
    ].join('-');

    const cleControle = NumerotationService.calculerCle(base);
    return { numeroDeclaration: `${base}-${cleControle}`, cleControle, sequence };
  }

  /**
   * Cle de controle sur 2 caracteres (variante de Luhn mod N sur l'alphabet
   * sans caracteres ambigus) : detecte les fautes de frappe et de transposition
   * lors d'une saisie manuelle du numero sur la page de verification.
   */
  static calculerCle(base: string): string {
    const A = NumerotationService.ALPHABET;
    const chars = base.replace(/-/g, '').toUpperCase().split('');
    let somme = 0;
    chars.forEach((c, i) => {
      const v = A.indexOf(c);
      const valeur = v === -1 ? 0 : v;
      somme += (i % 2 === 0 ? 2 : 1) * valeur;
    });
    const reste = somme % (A.length * A.length);
    return A[Math.floor(reste / A.length)] + A[reste % A.length];
  }

  /** Verifie la coherence d'un numero saisi a la main (page publique). */
  static verifierFormat(numero: string): boolean {
    const m = /^([A-Z0-9]{2,4})-([A-Z0-9]{2,10})-(\d{4})-(\d{6})-([A-Z0-9]{2})$/.exec(
      numero.trim().toUpperCase(),
    );
    if (!m) return false;
    const base = `${m[1]}-${m[2]}-${m[3]}-${m[4]}`;
    return NumerotationService.calculerCle(base) === m[5];
  }

  /** Numero d'acte de mairie : {codeMairie}/{annee}/{sequence sur 5}. */
  async attribuerNumeroActe(
    tx: TxClient,
    params: { mairieId: string; codeMairie: string; annee: number },
  ): Promise<string> {
    const dernier = await tx.acte.findFirst({
      where: { mairieId: params.mairieId, anneeRegistre: params.annee },
      orderBy: { numeroActe: 'desc' },
      select: { numeroActe: true },
    });
    const dernierSeq = dernier ? Number(dernier.numeroActe.split('/').pop()) : 0;
    const suivant = String(dernierSeq + 1).padStart(5, '0');
    return `${params.codeMairie.toUpperCase()}/${params.annee}/${suivant}`;
  }
}

import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Chiffrement applicatif des donnees sensibles au repos (numeros CNI,
 * donnees de sante, pieces jointes).
 *
 * Format de sortie : "v1:<iv b64>:<tag b64>:<ciphertext b64>"
 * Le prefixe de version permet une rotation de cle ulterieure sans
 * migration destructive (dechiffrer v1, rechiffrer v2).
 */
@Injectable()
export class CryptoService {
  private readonly dataKey: Buffer;
  private readonly blindIndexKey: Buffer;

  constructor(config: ConfigService) {
    this.dataKey = this.loadKey(config.get<string>('crypto.dataKey'), 'DATA_ENCRYPTION_KEY');
    this.blindIndexKey = this.loadKey(
      config.get<string>('crypto.blindIndexKey'),
      'BLIND_INDEX_KEY',
    );
  }

  private loadKey(value: string | undefined, name: string): Buffer {
    if (!value) throw new InternalServerErrorException(`Cle ${name} absente`);
    // Accepte une cle base64 de 32 octets ; sinon derive par HKDF pour le dev.
    const raw = Buffer.from(value, 'base64');
    if (raw.length === 32) return raw;
    return crypto.createHash('sha256').update(value, 'utf8').digest();
  }

  /** Chiffre une chaine. Retourne null si l'entree est vide. */
  chiffrer(clair: string | null | undefined): string | null {
    if (clair === null || clair === undefined || clair === '') return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.dataKey, iv);
    const chiffre = Buffer.concat([cipher.update(clair, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${chiffre.toString('base64')}`;
  }

  /** Dechiffre une chaine produite par `chiffrer`. */
  dechiffrer(paquet: string | null | undefined): string | null {
    if (!paquet) return null;
    const [version, ivB64, tagB64, dataB64] = paquet.split(':');
    if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
      throw new InternalServerErrorException('Format de donnee chiffree invalide');
    }
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.dataKey,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  /** Chiffre un buffer (pieces jointes). Retourne iv || tag || ciphertext. */
  chiffrerBuffer(clair: Buffer): Buffer {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.dataKey, iv);
    const data = Buffer.concat([cipher.update(clair), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]);
  }

  dechiffrerBuffer(paquet: Buffer): Buffer {
    const iv = paquet.subarray(0, 12);
    const tag = paquet.subarray(12, 28);
    const data = paquet.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.dataKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  }

  /**
   * Index aveugle : permet une recherche par egalite sur une donnee chiffree
   * (ex : retrouver les declarations liees a une CNI) sans stocker le clair.
   */
  indexAveugle(clair: string | null | undefined): string | null {
    if (!clair) return null;
    return crypto
      .createHmac('sha256', this.blindIndexKey)
      .update(clair.trim().toUpperCase(), 'utf8')
      .digest('hex');
  }

  sha256(data: Buffer | string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /** Token opaque non devinable (QR d'authentification, refresh token). */
  tokenOpaque(octets = 32): string {
    return crypto.randomBytes(octets).toString('base64url');
  }
}

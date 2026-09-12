import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { CryptoService } from './crypto.service';

const config = (dataKey: string, blindKey: string) =>
  ({ get: (k: string) => (k === 'crypto.dataKey' ? dataKey : blindKey) }) as unknown as ConfigService;

const CLE_A = crypto.randomBytes(32).toString('base64');
const CLE_B = crypto.randomBytes(32).toString('base64');
const service = new CryptoService(config(CLE_A, CLE_B));

describe('CryptoService', () => {
  it('chiffre puis dechiffre une chaine', () => {
    const clair = '123456789';
    const paquet = service.chiffrer(clair)!;
    expect(paquet).toMatch(/^v1:/);
    expect(paquet).not.toContain(clair);
    expect(service.dechiffrer(paquet)).toBe(clair);
  });

  it('preserve les accents et les caracteres non latins', () => {
    const clair = "Ngoulémakong — Extrême-Nord ✓";
    expect(service.dechiffrer(service.chiffrer(clair)!)).toBe(clair);
  });

  it('produit un cryptogramme different a chaque appel (IV aleatoire)', () => {
    expect(service.chiffrer('identique')).not.toBe(service.chiffrer('identique'));
  });

  it('traite les valeurs vides comme absentes', () => {
    expect(service.chiffrer('')).toBeNull();
    expect(service.chiffrer(null)).toBeNull();
    expect(service.chiffrer(undefined)).toBeNull();
    expect(service.dechiffrer(null)).toBeNull();
  });

  it('detecte une alteration du cryptogramme', () => {
    const [v, iv, tag, data] = service.chiffrer('100200300')!.split(':');
    const altere = Buffer.from(data, 'base64');
    altere[0] ^= 0xff;
    expect(() => service.dechiffrer(`${v}:${iv}:${tag}:${altere.toString('base64')}`)).toThrow();
  });

  it('refuse un format inconnu', () => {
    expect(() => service.dechiffrer('v2:a:b:c')).toThrow();
    expect(() => service.dechiffrer('n-importe-quoi')).toThrow();
  });

  it('ne dechiffre pas avec une autre cle', () => {
    const autre = new CryptoService(config(CLE_B, CLE_A));
    expect(() => autre.dechiffrer(service.chiffrer('secret')!)).toThrow();
  });

  describe('index aveugle', () => {
    it('est stable et normalise la casse et les espaces', () => {
      const attendu = service.indexAveugle('123456789');
      expect(service.indexAveugle(' 123456789 ')).toBe(attendu);
      expect(service.indexAveugle('ab12cd')).toBe(service.indexAveugle('AB12CD'));
    });

    it('differe pour deux valeurs distinctes et ne revele pas le clair', () => {
      const index = service.indexAveugle('123456789')!;
      expect(index).not.toContain('123456789');
      expect(index).toHaveLength(64);
      expect(service.indexAveugle('123456788')).not.toBe(index);
    });

    it('depend de la cle dediee', () => {
      // Une cle reellement differente : concatener un caractere a une chaine
      // base64 deja completee par "=" redonnerait les memes 32 octets.
      const autre = new CryptoService(config(CLE_A, crypto.randomBytes(32).toString('base64')));
      expect(autre.indexAveugle('123456789')).not.toBe(service.indexAveugle('123456789'));
    });

    it("n'utilise pas la cle de chiffrement des donnees", () => {
      const permutee = new CryptoService(config(CLE_B, CLE_A));
      expect(permutee.indexAveugle('123456789')).not.toBe(service.indexAveugle('123456789'));
    });
  });

  it('chiffre puis dechiffre un binaire (pieces jointes)', () => {
    const octets = crypto.randomBytes(4096);
    const paquet = service.chiffrerBuffer(octets);
    expect(paquet.equals(octets)).toBe(false);
    expect(service.dechiffrerBuffer(paquet).equals(octets)).toBe(true);
  });

  it('genere des tokens opaques distincts et sans caractere reserve dans une URL', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => service.tokenOpaque()));
    expect(tokens.size).toBe(200);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

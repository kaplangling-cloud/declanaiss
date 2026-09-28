import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/services/crypto.service';
import { AuditService } from '../audit/audit.service';
import { ContexteRequete } from '../common/decorators';
import { AuthService } from './auth.service';

const ctx: ContexteRequete = { ip: '10.0.0.1', userAgent: 'jest', ressource: 'POST /auth/login' };
const MOT_DE_PASSE = 'MotDePasseDeTest2026';

describe('AuthService.login - identifiant', () => {
  let hash: string;
  beforeAll(async () => { hash = await argon2.hash(MOT_DE_PASSE); });

  const monter = () => {
    const compte = {
      id: 'u-1', email: 'rose.ngo@exemple.cm', nomUtilisateur: 'r.ngo', motDePasseHash: hash, nom: 'NGO', prenoms: 'Rose',
      role: Role.PERSONNEL_SANTE, centreId: 'c-1', mairieId: null, actif: true, doitChangerMotDePasse: false,
      tentativesEchouees: 0, bloqueJusquA: null, centre: null, mairie: null,
    };
    const recherches: Array<Record<string, string>> = [];
    const prisma = {
      user: {
        findUnique: async ({ where }: { where: Record<string, string> }) => {
          recherches.push(where);
          return (where.email && where.email === compte.email) || (where.nomUtilisateur && where.nomUtilisateur === compte.nomUtilisateur) ? compte : null;
        },
        update: async () => compte,
      },
      refreshToken: { create: async () => ({}) },
    };
    const config = { get: (k: string) => ({ 'jwt.accessSecret': 'a'.repeat(32), 'jwt.refreshSecret': 'r'.repeat(32), 'jwt.accessTtl': '15m', 'jwt.refreshTtl': '7d' }[k]) };
    const crypto = new CryptoService({ get: () => 'ZGV2LWRldi1kZXYtZGV2LWRldi1kZXYtZGV2LWRldi0xMg==' } as unknown as ConfigService);
    const audit = { journaliser: jest.fn(async () => undefined) };
    const service = new AuthService(
      prisma as unknown as PrismaService, new JwtService({}), config as unknown as ConfigService, crypto, audit as unknown as AuditService,
    );
    return { service, recherches, audit };
  };

  it("se connecte avec le nom d'utilisateur, sans tenir compte de la casse ni des espaces", async () => {
    const { service, recherches } = monter();
    const r = await service.login('  R.Ngo ', MOT_DE_PASSE, ctx);
    expect(r.utilisateur.email).toBe('rose.ngo@exemple.cm');
    expect(recherches[0]).toEqual({ nomUtilisateur: 'r.ngo' });
  });

  it("se connecte toujours avec l'adresse e-mail", async () => {
    const { service, recherches } = monter();
    await service.login('Rose.Ngo@Exemple.cm', MOT_DE_PASSE, ctx);
    expect(recherches[0]).toEqual({ email: 'rose.ngo@exemple.cm' });
  });

  it('repond de la meme facon a un identifiant inconnu, sans reveler lequel des deux champs', async () => {
    const { service, audit } = monter();
    await expect(service.login('inconnu', MOT_DE_PASSE, ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(audit.journaliser).toHaveBeenCalledWith(expect.objectContaining({ metadonnees: expect.objectContaining({ identifiant: 'inconnu', raison: 'compte inconnu' }) }));
  });
});

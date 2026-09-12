import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { CryptoService } from '../common/services/crypto.service';
import { StorageService } from './storage.service';

/**
 * La resolution de chemin est la frontiere de securite du stockage : elle
 * recoit aussi des chemins relus en base (cheminStockage, cheminPdf).
 */
describe('StorageService', () => {
  let racine: string;
  let voisin: string;
  let service: StorageService;

  beforeAll(async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'declanaiss-'));
    racine = path.join(tmp, 'storage');
    // Dossier dont le chemin commence par celui de la racine : piege classique
    // d'une garde ecrite avec startsWith.
    voisin = path.join(tmp, 'storage-autre');
    await fs.mkdir(racine, { recursive: true });
    await fs.mkdir(voisin, { recursive: true });
    await fs.writeFile(path.join(voisin, 'secret.txt'), 'donnee hors perimetre');

    const cle = crypto.randomBytes(32).toString('base64');
    const cryptoService = new CryptoService({ get: () => cle } as unknown as ConfigService);
    service = new StorageService(
      { get: (k: string) => (k === 'storage.root' ? racine : undefined) } as unknown as ConfigService,
      cryptoService,
    );
    await service.onModuleInit();
  });

  it('ecrit puis relit une piece jointe chiffree', async () => {
    const contenu = Buffer.from('scan de la CNI');
    const { relatif, sha256 } = await service.ecrirePieceChiffree('decl-1', 'cni recto.jpg', contenu);
    const surDisque = await fs.readFile(path.join(racine, relatif));
    expect(surDisque.includes('scan de la CNI')).toBe(false); // chiffre au repos
    expect((await service.lirePieceChiffree(relatif)).equals(contenu)).toBe(true);
    expect(sha256).toHaveLength(64);
  });

  it('assainit le nom televerse', async () => {
    const { relatif } = await service.ecrirePieceChiffree('decl-2', '../../evasion.jpg', Buffer.from('x'));
    expect(path.normalize(relatif).startsWith(path.join('pieces', 'decl-2'))).toBe(true);
    expect(relatif).not.toContain('..');
  });

  it('refuse une remontee de repertoire', async () => {
    await expect(service.lireFichier('../storage-autre/secret.txt')).rejects.toThrow('Chemin de stockage invalide');
    await expect(service.lireFichier('pieces/../../storage-autre/secret.txt')).rejects.toThrow('Chemin de stockage invalide');
  });

  it('refuse un dossier voisin dont le chemin partage le prefixe de la racine', async () => {
    await expect(service.lireFichier(path.join('..', 'storage-autre', 'secret.txt'))).rejects.toThrow(
      'Chemin de stockage invalide',
    );
  });

  it('refuse un chemin absolu', async () => {
    const absolu = path.join(voisin, 'secret.txt');
    await expect(service.lireFichier(absolu)).rejects.toThrow('Chemin de stockage invalide');
  });

  it('refuse la racine elle-meme', async () => {
    await expect(service.lireFichier('.')).rejects.toThrow('Chemin de stockage invalide');
  });
});

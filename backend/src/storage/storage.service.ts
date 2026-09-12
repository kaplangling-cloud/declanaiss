import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import { CryptoService } from '../common/services/crypto.service';

/**
 * Stockage disque des pieces jointes et des PDF d'actes.
 * Les pieces jointes (CNI, actes de mariage) sont chiffrees AES-256-GCM
 * avant ecriture ; les PDF d'actes sont stockes en clair (document public
 * une fois delivre) mais leur empreinte SHA-256 est conservee en base.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly root: string;

  constructor(config: ConfigService, private readonly crypto: CryptoService) {
    this.root = path.resolve(config.get<string>('storage.root') || './storage');
  }

  async onModuleInit() {
    for (const sub of ['pieces', 'actes', 'exports']) {
      await fs.mkdir(path.join(this.root, sub), { recursive: true });
    }
    this.logger.log(`Stockage initialise dans ${this.root}`);
  }

  /**
   * Resout un chemin relatif sous la racine de stockage.
   * La comparaison porte sur le chemin relatif calcule, et non sur un prefixe
   * de chaine : `<root>-autre/x` commence par `<root>` sans etre dedans.
   */
  private chemin(relatif: string): string {
    const abs = path.resolve(this.root, relatif);
    const rel = path.relative(this.root, abs);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('Chemin de stockage invalide');
    }
    return abs;
  }

  /** Ne conserve d'un nom televerse qu'un segment sans separateur ni `..`. */
  private static nomSur(nom: string): string {
    const base = path.basename(nom).replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '_').slice(0, 80);
    return base || 'piece';
  }

  async ecrirePieceChiffree(declarationId: string, nomFichier: string, data: Buffer) {
    const relatif = path.join('pieces', declarationId, `${Date.now()}-${StorageService.nomSur(nomFichier)}.enc`);
    const abs = this.chemin(relatif);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, this.crypto.chiffrerBuffer(data), { mode: 0o600 });
    return { relatif, sha256: this.crypto.sha256(data) };
  }

  async lirePieceChiffree(relatif: string): Promise<Buffer> {
    return this.crypto.dechiffrerBuffer(await fs.readFile(this.chemin(relatif)));
  }

  async ecrireActePdf(acteId: string, pdf: Buffer) {
    const relatif = path.join('actes', `${acteId}.pdf`);
    const abs = this.chemin(relatif);
    await fs.writeFile(abs, pdf, { mode: 0o640 });
    return { relatif, sha256: this.crypto.sha256(pdf) };
  }

  async lireFichier(relatif: string): Promise<Buffer> {
    return fs.readFile(this.chemin(relatif));
  }
}

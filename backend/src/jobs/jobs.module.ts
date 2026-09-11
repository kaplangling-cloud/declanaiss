import { Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { DeclarationsModule } from '../declarations/declarations.module';
import { DeclarationsService } from '../declarations/declarations.service';

/**
 * Verrouillage automatique des declarations dont la fenetre de modification
 * (7 jours calendaires apres soumission) est ecoulee.
 *
 * Expression cron lue depuis LOCK_CRON (defaut : toutes les heures). Chaque
 * dossier est verrouille dans sa propre transaction avec trace d'audit ; le
 * job est idempotent et peut etre relance sans effet de bord.
 */
@Injectable()
export class VerrouillageJob implements OnModuleInit {
  private readonly logger = new Logger(VerrouillageJob.name);
  private enCours = false;

  constructor(
    private readonly declarations: DeclarationsService,
    private readonly registry: SchedulerRegistry,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const expression = this.config.get<string>('metier.lockCron') || '0 * * * *';
    const job = new CronJob(expression, () => void this.executer(), null, true, process.env.TZ || 'Africa/Douala');
    this.registry.addCronJob('verrouillage-declarations', job);
    this.logger.log(`Job de verrouillage planifie (${expression})`);
    // Rattrapage au demarrage : les dossiers expires pendant une indisponibilite sont traites
    void this.executer();
  }

  async executer(): Promise<number> {
    if (this.enCours) return 0; // pas de chevauchement
    this.enCours = true;
    try {
      const n = await this.declarations.verrouillerExpirees();
      if (n > 0) this.logger.log(`${n} declaration(s) verrouillee(s)`);
      return n;
    } catch (e) {
      this.logger.error(`Echec du job de verrouillage : ${(e as Error).message}`);
      return 0;
    } finally {
      this.enCours = false;
    }
  }
}

@Module({
  imports: [DeclarationsModule],
  providers: [VerrouillageJob],
})
export class JobsModule {}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

/**
 * Envoi de courriels transactionnels (SMTP).
 *
 * Le service est facultatif : sans configuration SMTP complete il reste
 * inerte et `estConfigure` vaut false, ce qui permet a l'API de demarrer
 * normalement. Les appelants doivent tester `estConfigure` avant de proposer
 * une fonction qui en depend.
 *
 * Aucune donnee personnelle n'est journalisee : ni l'adresse du destinataire,
 * ni le contenu du message, ni le message d'erreur brut du serveur SMTP, qui
 * reprend souvent l'adresse rejetee. Seul le code d'erreur est conserve.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport?: Transporter;
  private readonly expediteur: string;
  readonly estConfigure: boolean;

  constructor(private readonly config: ConfigService) {
    const hote = config.get<string>('mail.host') ?? '';
    const utilisateur = config.get<string>('mail.user') ?? '';
    const motDePasse = config.get<string>('mail.password') ?? '';
    this.expediteur = config.get<string>('mail.from') || utilisateur;

    this.estConfigure = Boolean(hote && utilisateur && motDePasse && this.expediteur);
    if (!this.estConfigure) {
      this.logger.warn("SMTP non configure : l'envoi de courriels est desactive (cf. SMTP_HOST dans .env.example)");
      return;
    }

    // Un SMTP_PORT non numerique donnerait NaN, que nodemailer accepte sans
    // broncher pour echouer ensuite a la connexion : on retombe sur 465.
    const port = Number(config.get<number>('mail.port'));

    this.transport = createTransport({
      host: hote,
      port: Number.isInteger(port) && port > 0 ? port : 465,
      // Port 465 : TLS implicite. Port 587 : STARTTLS, donc `secure: false`.
      secure: config.get<boolean>('mail.secure') ?? true,
      auth: { user: utilisateur, pass: motDePasse },
    });
  }

  /**
   * Envoie un message. Rend `true` si le serveur SMTP l'a accepte.
   * N'emet jamais d'exception : un echec d'envoi ne doit pas faire remonter
   * d'erreur a l'appelant, qui repond de facon identique dans tous les cas
   * pour ne pas reveler l'existence d'un compte.
   */
  async envoyer(destinataire: string, sujet: string, texte: string, html: string): Promise<boolean> {
    if (!this.transport) return false;
    try {
      await this.transport.sendMail({ from: this.expediteur, to: destinataire, subject: sujet, text: texte, html });
      return true;
    } catch (erreur) {
      const code = (erreur as { code?: string; responseCode?: number }).code ?? (erreur as { responseCode?: number }).responseCode ?? 'inconnu';
      this.logger.error(`Echec de l'envoi d'un courriel (code ${code})`);
      return false;
    }
  }

  /** Message de reinitialisation de mot de passe. `lien` porte le jeton a usage unique. */
  async envoyerReinitialisation(destinataire: string, nomComplet: string, lien: string, dureeMinutes: number): Promise<boolean> {
    const application = this.config.get<string>('appName') ?? 'Declaration de naissance en ligne';
    const sujet = `${application} — réinitialisation de votre mot de passe`;

    const texte = [
      `Bonjour ${nomComplet},`,
      '',
      `Une réinitialisation du mot de passe de votre compte a été demandée.`,
      `Ouvrez ce lien pour choisir un nouveau mot de passe :`,
      lien,
      '',
      `Ce lien est valable ${dureeMinutes} minutes et ne peut servir qu'une seule fois.`,
      `Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.`,
      '',
      application,
    ].join('\n');

    // Courriel volontairement sobre : pas d'image ni de ressource externe, le
    // rendu doit tenir dans les clients de messagerie les plus pauvres.
    const html = `<!doctype html>
<html lang="fr"><body style="margin:0;padding:24px;background:#f5f7f5;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px">
    <h1 style="margin:0 0 16px;font-size:18px;color:#15803d">${echapper(application)}</h1>
    <p style="margin:0 0 12px">Bonjour ${echapper(nomComplet)},</p>
    <p style="margin:0 0 12px">Une réinitialisation du mot de passe de votre compte a été demandée.</p>
    <p style="margin:0 0 20px"><a href="${echapper(lien)}" style="display:inline-block;background:#15803d;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px">Choisir un nouveau mot de passe</a></p>
    <p style="margin:0 0 12px;font-size:13px;color:#4b5563">Ce lien est valable <strong>${dureeMinutes} minutes</strong> et ne peut servir qu'une seule fois.</p>
    <p style="margin:0 0 12px;font-size:13px;color:#4b5563">Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.</p>
    <p style="margin:16px 0 0;font-size:12px;color:#6b7280;word-break:break-all">Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br>${echapper(lien)}</p>
  </div>
</body></html>`;

    return this.envoyer(destinataire, sujet, texte, html);
  }
}

/** Le nom de l'utilisateur vient de la base : il est echappe avant insertion dans le HTML. */
function echapper(valeur: string): string {
  return valeur
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

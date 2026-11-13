/**
 * Configuration centralisee. Aucune valeur secrete en dur : tout vient de
 * l'environnement (cf. .env.example). L'application refuse de demarrer en
 * production si un secret est absent ou laisse a sa valeur d'exemple.
 */
const PLACEHOLDERS = ['change_me', 'changeme', ''];

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  const isPlaceholder =
    value === undefined || PLACEHOLDERS.some((p) => p !== '' && value.startsWith(p));

  if (process.env.NODE_ENV === 'production' && (!value || isPlaceholder)) {
    throw new Error(
      `Variable d'environnement manquante ou non renseignee : ${name}. Voir .env.example.`,
    );
  }
  return value ?? '';
}

export default () => ({
  env: process.env.NODE_ENV || 'development',
  appName: process.env.APP_NAME || 'Declaration de Naissance',
  publicUrl: process.env.APP_PUBLIC_URL || 'http://localhost:8080',
  api: {
    // PORT : impose par les hebergeurs (cf. main.ts)
    port: Number(process.env.API_PORT || process.env.PORT || 3000),
    prefix: process.env.API_PREFIX || 'api',
  },
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret'),
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
    refreshTtl: process.env.JWT_REFRESH_TTL || '7d',
  },
  crypto: {
    dataKey: required('DATA_ENCRYPTION_KEY', 'ZGV2LWRldi1kZXYtZGV2LWRldi1kZXYtZGV2LWRldi0xMg=='),
    blindIndexKey: required('BLIND_INDEX_KEY', 'YmxpbmQtaW5kZXgtZGV2LWtleS0zMi1ieXRlcy1vay0='),
  },
  metier: {
    modificationWindowDays: Number(process.env.MODIFICATION_WINDOW_DAYS || 7),
    lockCron: process.env.LOCK_CRON || '0 * * * *',
  },
  storage: {
    root: process.env.STORAGE_ROOT || './storage',
    maxUploadMb: Number(process.env.MAX_UPLOAD_SIZE_MB || 8),
  },
  // SMTP : facultatif. Sans configuration complete, la reinitialisation de mot
  // de passe par courriel est refusee proprement (cf. MailService), mais l'API
  // demarre normalement — d'ou l'absence de `required()` ici.
  mail: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 465),
    // Port 465 : TLS implicite (secure). Port 587 : STARTTLS, mettre SMTP_SECURE=false.
    secure: (process.env.SMTP_SECURE || 'true') !== 'false',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || '',
  },
});

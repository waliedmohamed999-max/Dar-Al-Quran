function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. See .env.example`);
  return v;
}

export const env = {
  get appEnv() { return process.env.APP_ENV ?? "development"; },
  get isProd() { return process.env.APP_ENV === "production"; },
  get appUrl() { return process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"; },
  get databaseUrl() { return required("DATABASE_URL"); },
  get appDatabaseUrl() { return required("APP_DATABASE_URL"); },
  get authSecret() { return required("BETTER_AUTH_SECRET"); },
  get fieldKey() { return required("FIELD_ENCRYPTION_KEY"); },
  get cacheDays() { return Number(process.env.CONTENT_CACHE_DAYS ?? 7); },
  get recordingRetentionDays() { return Number(process.env.RETENTION_RECORDING_DAYS ?? 180); },
  get auditRetentionDays() { return Number(process.env.RETENTION_AUDIT_DAYS ?? 730); },
};

export const integrations = {
  get storage() { return Boolean(process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY_ID && process.env.S3_BUCKET); },
  get email() { return Boolean(process.env.SMTP_HOST); },
  get whatsapp() { return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID); },
};

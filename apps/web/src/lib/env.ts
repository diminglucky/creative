const defaultServerBaseUrl = "http://localhost:3001";

export function getServerBaseUrl() {
  // Must access process.env.NEXT_PUBLIC_* directly — webpack DefinePlugin
  // only replaces direct references, not indirect access via a variable.
  const configuredUrl = process.env.NEXT_PUBLIC_SERVER_BASE_URL?.trim();
  return configuredUrl || defaultServerBaseUrl;
}

export type WebEnv = {
  serverBaseUrl: string;
  supabaseAnonKey: string;
  supabaseUrl: string;
};

export function loadWebEnv(
  overrides: Partial<WebEnv> = {},
  source: NodeJS.ProcessEnv = process.env,
): WebEnv {
  const sourceServerBaseUrl = source.NEXT_PUBLIC_SERVER_BASE_URL?.trim();
  return {
    serverBaseUrl:
      overrides.serverBaseUrl ?? sourceServerBaseUrl ?? defaultServerBaseUrl,
    supabaseUrl:
      overrides.supabaseUrl ??
      requireEnv("NEXT_PUBLIC_SUPABASE_URL", source.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey:
      overrides.supabaseAnonKey ??
      requireEnv(
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        source.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      ),
  };
}

function requireEnv(name: string, value: string | undefined) {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    throw new Error(`Missing required browser env: ${name}`);
  }

  return normalizedValue;
}

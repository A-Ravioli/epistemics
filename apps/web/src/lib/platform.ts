import { loadPlatform, type Platform } from '@epistemics/platform';

let platformPromise: Promise<Platform> | undefined;

/** Singleton: the platform (db executor, secrets, files, llm transport) for this tab. */
export function getPlatform(): Promise<Platform> {
  platformPromise ??= loadPlatform().catch((e: unknown) => {
    platformPromise = undefined;
    throw e;
  });
  return platformPromise;
}

#!/usr/bin/env node

import { DEFAULT_SEED_SOURCE, seedProfiles } from '../lib/seed-profiles.js';

const source = process.argv[2] ?? process.env.SEED_PROFILES_SOURCE ?? DEFAULT_SEED_SOURCE;

try {
  await seedProfiles({ source });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Seed failed');
  process.exitCode = 1;
}

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { uuidv7 } from 'uuidv7';
import { getCollection } from './db.js';
import { classifyAgeGroup } from './classify.js';
import { getCountryName, normalizeCountryId } from './countries.js';

const DEFAULT_SEED_SOURCE =
  'https://drive.google.com/uc?export=download&id=1Up06dcS9OfUEnDj_u6OV_xTRntupFhPH';
const REQUIRED_SEED_FIELDS = Object.freeze([
  'name',
  'gender',
  'gender_probability',
  'age',
  'age_group',
  'country_id',
  'country_name',
  'country_probability',
]);
const REQUIRED_TOP_LEVEL_FIELDS = Object.freeze(['profiles']);
const ALLOWED_GENDERS = new Set(['male', 'female']);

function formatSeedTimestamp(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSeedName(name) {
  if (typeof name !== 'string') {
    throw new Error('Seed profile name must be a string');
  }

  const normalizedName = name.trim().toLowerCase();

  if (normalizedName === '') {
    throw new Error('Seed profile name must not be empty');
  }

  return normalizedName;
}

function assertExactKeys(value, expectedKeys, label) {
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be an object`);
  }

  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();

  if (JSON.stringify(actualKeys) !== JSON.stringify(sortedExpectedKeys)) {
    throw new Error(`${label} must contain exactly: ${expectedKeys.join(', ')}`);
  }
}

function validateProbability(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }

  if (value < 0 || value > 1) {
    throw new Error(`${label} must be between 0 and 1`);
  }

  return value;
}

function validateAge(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('Seed profile age must be a non-negative integer');
  }

  return value;
}

function normalizeSeedRecord(record, index) {
  assertExactKeys(record, REQUIRED_SEED_FIELDS, `Seed profile at index ${index}`);

  if (typeof record.country_name !== 'string') {
    throw new Error(`Seed profile at index ${index} must include country_name`);
  }

  const name = normalizeSeedName(record.name);
  const gender =
    typeof record.gender === 'string' ? record.gender.trim().toLowerCase() : record.gender;

  if (!ALLOWED_GENDERS.has(gender)) {
    throw new Error(`Seed profile at index ${index} has an invalid gender`);
  }

  const age = validateAge(record.age);
  const age_group =
    typeof record.age_group === 'string'
      ? record.age_group.trim().toLowerCase()
      : record.age_group;
  const classifiedAgeGroup = classifyAgeGroup(age);

  if (age_group !== classifiedAgeGroup) {
    throw new Error(`Seed profile at index ${index} has a mismatched age_group`);
  }

  const country_id = normalizeCountryId(record.country_id);

  if (!country_id) {
    throw new Error(`Seed profile at index ${index} has an invalid country_id`);
  }

  const country_name = getCountryName(country_id);

  if (!country_name) {
    throw new Error(`Seed profile at index ${index} has an unmapped country_id`);
  }

  return {
    name,
    gender,
    gender_probability: validateProbability(
      record.gender_probability,
      `Seed profile at index ${index} gender_probability`
    ),
    age,
    age_group: classifiedAgeGroup,
    country_id,
    country_name,
    country_probability: validateProbability(
      record.country_probability,
      `Seed profile at index ${index} country_probability`
    ),
  };
}

function validateSeedDataset(payload) {
  assertExactKeys(payload, REQUIRED_TOP_LEVEL_FIELDS, 'Seed payload');

  if (!Array.isArray(payload.profiles)) {
    throw new Error('Seed payload profiles must be an array');
  }

  const seenNames = new Set();

  return payload.profiles.map((record, index) => {
    const normalizedRecord = normalizeSeedRecord(record, index);

    if (seenNames.has(normalizedRecord.name)) {
      throw new Error(`Seed payload contains a duplicate normalized name: ${normalizedRecord.name}`);
    }

    seenNames.add(normalizedRecord.name);
    return normalizedRecord;
  });
}

function buildSeedBulkOperations(
  profiles,
  { existingDocsByName = new Map(), createId = uuidv7, now = () => new Date() } = {}
) {
  return profiles.map((profile) => {
    const existingDoc = existingDocsByName.get(profile.name);
    const id = existingDoc?.id ?? createId();
    const created_at = existingDoc?.created_at ?? formatSeedTimestamp(now());

    return {
      updateOne: {
        filter: { name: profile.name },
        update: {
          $set: {
            ...profile,
            id,
            created_at,
          },
          $setOnInsert: {
            _id: id,
          },
        },
        upsert: true,
      },
    };
  });
}

async function readSeedSource(source, { fetchFn = globalThis.fetch, readFileFn = readFile } = {}) {
  if (typeof source !== 'string' || source.trim() === '') {
    throw new Error('Seed source must be a non-empty string');
  }

  const trimmedSource = source.trim();

  if (/^https?:\/\//i.test(trimmedSource)) {
    if (typeof fetchFn !== 'function') {
      throw new Error('Fetch is not available for remote seed sources');
    }

    const response = await fetchFn(trimmedSource);

    if (!response.ok) {
      throw new Error(`Failed to fetch seed source: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    return JSON.parse(text);
  }

  if (trimmedSource.startsWith('file://')) {
    return JSON.parse(await readFileFn(new URL(trimmedSource), 'utf8'));
  }

  return JSON.parse(await readFileFn(resolve(trimmedSource), 'utf8'));
}

async function seedProfiles({
  source = DEFAULT_SEED_SOURCE,
  getCollectionFn = getCollection,
  fetchFn = globalThis.fetch,
  readFileFn = readFile,
  createId = uuidv7,
  now = () => new Date(),
  log = console.log,
} = {}) {
  const payload = await readSeedSource(source, { fetchFn, readFileFn });
  const profiles = validateSeedDataset(payload);
  const collection = await getCollectionFn();
  const names = profiles.map((profile) => profile.name);
  const existingDocs =
    names.length === 0 ? [] : await collection.find({ name: { $in: names } }).toArray();
  const existingDocsByName = new Map(existingDocs.map((doc) => [doc.name, doc]));
  const operations = buildSeedBulkOperations(profiles, {
    existingDocsByName,
    createId,
    now,
  });

  const result =
    operations.length === 0
      ? { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }
      : await collection.bulkWrite(operations, { ordered: false });
  const summary = {
    source,
    profiles_processed: profiles.length,
    matched: result.matchedCount ?? 0,
    modified: result.modifiedCount ?? 0,
    upserted: result.upsertedCount ?? 0,
  };

  log(`Seeded ${summary.profiles_processed} profiles from ${source}`);
  log(
    `Matched: ${summary.matched}, Modified: ${summary.modified}, Upserted: ${summary.upserted}`
  );

  return summary;
}

export {
  buildSeedBulkOperations,
  DEFAULT_SEED_SOURCE,
  formatSeedTimestamp,
  normalizeSeedName,
  readSeedSource,
  REQUIRED_SEED_FIELDS,
  seedProfiles,
  validateSeedDataset,
};

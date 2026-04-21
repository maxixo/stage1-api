import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSeedBulkOperations,
  formatSeedTimestamp,
  normalizeSeedName,
  readSeedSource,
  validateSeedDataset,
  seedProfiles,
} from '../lib/seed-profiles.js';

test('normalizeSeedName lowercases and trims names', () => {
  assert.equal(normalizeSeedName('  Ella  '), 'ella');
});

test('validateSeedDataset normalizes records and derives country_name from country_id', () => {
  const profiles = validateSeedDataset({
    profiles: [
      {
        name: '  Ella ',
        gender: 'Female',
        gender_probability: 0.98,
        age: 28,
        age_group: 'adult',
        country_id: 'ng',
        country_name: 'Anything',
        country_probability: 0.64,
      },
    ],
  });

  assert.deepEqual(profiles, [
    {
      name: 'ella',
      gender: 'female',
      gender_probability: 0.98,
      age: 28,
      age_group: 'adult',
      country_id: 'NG',
      country_name: 'Nigeria',
      country_probability: 0.64,
    },
  ]);
});

test('validateSeedDataset rejects mismatched age groups', () => {
  assert.throws(
    () =>
      validateSeedDataset({
        profiles: [
          {
            name: 'Ella',
            gender: 'female',
            gender_probability: 0.98,
            age: 28,
            age_group: 'teenager',
            country_id: 'NG',
            country_name: 'Nigeria',
            country_probability: 0.64,
          },
        ],
      }),
    /mismatched age_group/
  );
});

test('validateSeedDataset rejects duplicate normalized names', () => {
  assert.throws(
    () =>
      validateSeedDataset({
        profiles: [
          {
            name: 'Ella',
            gender: 'female',
            gender_probability: 0.98,
            age: 28,
            age_group: 'adult',
            country_id: 'NG',
            country_name: 'Nigeria',
            country_probability: 0.64,
          },
          {
            name: ' ella ',
            gender: 'female',
            gender_probability: 0.97,
            age: 29,
            age_group: 'adult',
            country_id: 'NG',
            country_name: 'Nigeria',
            country_probability: 0.63,
          },
        ],
      }),
    /duplicate normalized name/
  );
});

test('buildSeedBulkOperations preserves existing ids and timestamps', () => {
  const operations = buildSeedBulkOperations(
    [
      {
        name: 'ella',
        gender: 'female',
        gender_probability: 0.98,
        age: 28,
        age_group: 'adult',
        country_id: 'NG',
        country_name: 'Nigeria',
        country_probability: 0.64,
      },
    ],
    {
      existingDocsByName: new Map([
        ['ella', { name: 'ella', id: 'existing-id', created_at: '2026-04-01T00:00:00Z' }],
      ]),
      createId: () => 'new-id',
      now: () => new Date('2026-04-15T08:00:00.000Z'),
    }
  );

  assert.deepEqual(operations, [
    {
      updateOne: {
        filter: { name: 'ella' },
        update: {
          $set: {
            name: 'ella',
            gender: 'female',
            gender_probability: 0.98,
            age: 28,
            age_group: 'adult',
            country_id: 'NG',
            country_name: 'Nigeria',
            country_probability: 0.64,
            id: 'existing-id',
            created_at: '2026-04-01T00:00:00Z',
          },
          $setOnInsert: {
            _id: 'existing-id',
          },
        },
        upsert: true,
      },
    },
  ]);
});

test('readSeedSource loads JSON from remote URLs', async () => {
  const payload = await readSeedSource('https://example.com/profiles.json', {
    fetchFn: async () => ({
      ok: true,
      text: async () => '{"profiles":[]}',
    }),
  });

  assert.deepEqual(payload, { profiles: [] });
});

test('seedProfiles validates, fetches existing docs, and bulk upserts idempotently', async () => {
  const findFilters = [];
  const bulkWrites = [];
  const collection = {
    find(filter) {
      findFilters.push(filter);
      return {
        toArray: async () => [
          {
            name: 'ella',
            id: 'existing-id',
            created_at: '2026-04-01T00:00:00Z',
          },
        ],
      };
    },
    bulkWrite: async (operations, options) => {
      bulkWrites.push({ operations, options });
      return { matchedCount: 1, modifiedCount: 1, upsertedCount: 1 };
    },
  };
  const logs = [];

  const summary = await seedProfiles({
    source: 'https://example.com/profiles.json',
    fetchFn: async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          profiles: [
            {
              name: ' Ella ',
              gender: 'female',
              gender_probability: 0.98,
              age: 28,
              age_group: 'adult',
              country_id: 'NG',
              country_name: 'Nigeria',
              country_probability: 0.64,
            },
            {
              name: 'Noah',
              gender: 'male',
              gender_probability: 0.99,
              age: 31,
              age_group: 'adult',
              country_id: 'US',
              country_name: 'United States',
              country_probability: 0.71,
            },
          ],
        }),
    }),
    getCollectionFn: async () => collection,
    createId: () => 'generated-id',
    now: () => new Date('2026-04-15T08:00:00.000Z'),
    log: (message) => logs.push(message),
  });

  assert.deepEqual(findFilters, [{ name: { $in: ['ella', 'noah'] } }]);
  assert.equal(bulkWrites.length, 1);
  assert.deepEqual(bulkWrites[0].options, { ordered: false });
  assert.deepEqual(
    bulkWrites[0].operations.map((operation) => operation.updateOne.filter),
    [{ name: 'ella' }, { name: 'noah' }]
  );
  assert.equal(
    bulkWrites[0].operations[0].updateOne.update.$set.created_at,
    '2026-04-01T00:00:00Z'
  );
  assert.equal(bulkWrites[0].operations[1].updateOne.update.$set.id, 'generated-id');
  assert.equal(
    bulkWrites[0].operations[1].updateOne.update.$set.created_at,
    formatSeedTimestamp(new Date('2026-04-15T08:00:00.000Z'))
  );
  assert.deepEqual(summary, {
    source: 'https://example.com/profiles.json',
    profiles_processed: 2,
    matched: 1,
    modified: 1,
    upserted: 1,
  });
  assert.equal(logs.length, 2);
});

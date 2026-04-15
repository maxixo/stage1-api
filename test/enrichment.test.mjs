import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGIFY_URL,
  buildEnrichmentUrls,
  enrichProfile,
  GENDERIZE_URL,
  NATIONALIZE_URL,
} from '../lib/enrichment.js';

test('buildEnrichmentUrls matches the required external providers', () => {
  assert.deepEqual(buildEnrichmentUrls('usman'), [
    `${GENDERIZE_URL}?name=usman`,
    `${AGIFY_URL}?name=usman`,
    `${NATIONALIZE_URL}?name=usman`,
  ]);
});

test('enrichProfile calls Genderize, Agify, and Nationalize with exact URLs', async () => {
  const calls = [];
  const fetchFn = async (url, options) => {
    calls.push({ url, options });

    if (url === `${GENDERIZE_URL}?name=usman`) {
      return {
        ok: true,
        json: async () => ({ gender: 'male', probability: 0.99, count: 1500 }),
      };
    }

    if (url === `${AGIFY_URL}?name=usman`) {
      return {
        ok: true,
        json: async () => ({ age: 31 }),
      };
    }

    if (url === `${NATIONALIZE_URL}?name=usman`) {
      return {
        ok: true,
        json: async () => ({
          country: [
            { country_id: 'PK', probability: 0.78 },
            { country_id: 'IN', probability: 0.14 },
          ],
        }),
      };
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  const profile = await enrichProfile('usman', { fetchFn });

  assert.deepEqual(calls, [
    {
      url: `${GENDERIZE_URL}?name=usman`,
      options: { cache: 'no-store' },
    },
    {
      url: `${AGIFY_URL}?name=usman`,
      options: { cache: 'no-store' },
    },
    {
      url: `${NATIONALIZE_URL}?name=usman`,
      options: { cache: 'no-store' },
    },
  ]);
  assert.deepEqual(profile, {
    gender: 'male',
    gender_probability: 0.99,
    sample_size: 1500,
    age: 31,
    country_id: 'PK',
    country_probability: 0.78,
  });
});

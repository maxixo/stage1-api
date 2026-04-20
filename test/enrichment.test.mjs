import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGIFY_URL,
  buildEnrichmentUrls,
  enrichProfile,
  GENDERIZE_URL,
  NATIONALIZE_URL,
} from '../lib/enrichment.js';

function createResponse(payload, ok = true) {
  return {
    ok,
    json: async () => payload,
  };
}

function createFetchFn({ genderize, agify, nationalize }) {
  return async (url) => {
    if (url === `${GENDERIZE_URL}?name=usman`) {
      return genderize;
    }

    if (url === `${AGIFY_URL}?name=usman`) {
      return agify;
    }

    if (url === `${NATIONALIZE_URL}?name=usman`) {
      return nationalize;
    }

    throw new Error(`Unexpected URL: ${url}`);
  };
}

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
      return createResponse({ gender: 'male', probability: 0.99, count: 1500 });
    }

    if (url === `${AGIFY_URL}?name=usman`) {
      return createResponse({ age: 31 });
    }

    if (url === `${NATIONALIZE_URL}?name=usman`) {
      return createResponse({
        country: [
          { country_id: 'PK', probability: 0.78 },
          { country_id: 'IN', probability: 0.14 },
        ],
      });
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
    age: 31,
    country_id: 'PK',
    country_name: 'Pakistan',
    country_probability: 0.78,
  });
});

test('enrichProfile rejects null gender from Genderize', async () => {
  const fetchFn = createFetchFn({
    genderize: createResponse({ gender: null, probability: 0.99, count: 1500 }),
    agify: createResponse({ age: 31 }),
    nationalize: createResponse({ country: [{ country_id: 'PK', probability: 0.78 }] }),
  });

  await assert.rejects(() => enrichProfile('usman', { fetchFn }), {
    message: 'Genderize returned an invalid response',
  });
});

test('enrichProfile rejects zero sample size from Genderize', async () => {
  const fetchFn = createFetchFn({
    genderize: createResponse({ gender: 'male', probability: 0.99, count: 0 }),
    agify: createResponse({ age: 31 }),
    nationalize: createResponse({ country: [{ country_id: 'PK', probability: 0.78 }] }),
  });

  await assert.rejects(() => enrichProfile('usman', { fetchFn }), {
    message: 'Genderize returned an invalid response',
  });
});

test('enrichProfile rejects null age from Agify', async () => {
  const fetchFn = createFetchFn({
    genderize: createResponse({ gender: 'male', probability: 0.99, count: 1500 }),
    agify: createResponse({ age: null }),
    nationalize: createResponse({ country: [{ country_id: 'PK', probability: 0.78 }] }),
  });

  await assert.rejects(() => enrichProfile('usman', { fetchFn }), {
    message: 'Agify returned an invalid response',
  });
});

test('enrichProfile rejects missing country data from Nationalize', async () => {
  const fetchFn = createFetchFn({
    genderize: createResponse({ gender: 'male', probability: 0.99, count: 1500 }),
    agify: createResponse({ age: 31 }),
    nationalize: createResponse({ country: [] }),
  });

  await assert.rejects(() => enrichProfile('usman', { fetchFn }), {
    message: 'Nationalize returned an invalid response',
  });
});

test('enrichProfile rejects non-ok external responses with service-specific errors', async () => {
  const fetchFn = createFetchFn({
    genderize: createResponse({ gender: 'male', probability: 0.99, count: 1500 }, false),
    agify: createResponse({ age: 31 }),
    nationalize: createResponse({ country: [{ country_id: 'PK', probability: 0.78 }] }),
  });

  await assert.rejects(() => enrichProfile('usman', { fetchFn }), {
    message: 'Genderize returned an invalid response',
  });
});

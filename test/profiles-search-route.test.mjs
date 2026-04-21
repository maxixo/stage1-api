import assert from 'node:assert/strict';
import test from 'node:test';
import { createProfilesSearchRouteHandlers } from '../app/api/profiles/search/route.js';
import {
  parseProfileSearchQuery,
  ProfileSearchInterpretationError,
  SEARCH_QUERY_ERROR_MESSAGE,
} from '../lib/profile-query.js';

function createCursor(docs, queryState = {}) {
  return {
    sort(sortSpec) {
      queryState.sort = sortSpec;
      return this;
    },
    skip(skip) {
      queryState.skip = skip;
      return this;
    },
    limit(limit) {
      queryState.limit = limit;
      return this;
    },
    toArray: async () => docs,
  };
}

function createCollection(overrides = {}) {
  return {
    countDocuments: async () => 0,
    find: () => createCursor([]),
    ...overrides,
  };
}

function createHandlers({ collection } = {}) {
  return createProfilesSearchRouteHandlers({
    getCollectionFn: async () => collection ?? createCollection(),
  });
}

test('OPTIONS returns CORS headers for GET search', async () => {
  const { OPTIONS } = createHandlers();

  const response = await OPTIONS();

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
});

test('parseProfileSearchQuery extracts young female filters and country from text', () => {
  const query = parseProfileSearchQuery(
    new URLSearchParams('q=young females from nigeria')
  );

  assert.deepEqual(query.filter, {
    gender: 'female',
    country_id: 'NG',
    age: { $gte: 16, $lte: 24 },
  });
});

test('parseProfileSearchQuery ignores contradictory genders and keeps other rules', () => {
  const query = parseProfileSearchQuery(
    new URLSearchParams('q=male and female teenagers above 17')
  );

  assert.deepEqual(query.filter, {
    age_group: 'teenager',
    age: { $gte: 17 },
  });
});

test('parseProfileSearchQuery resolves country aliases from from-country phrases', () => {
  const query = parseProfileSearchQuery(
    new URLSearchParams('q=adults from usa under 40')
  );

  assert.deepEqual(query.filter, {
    age_group: 'adult',
    country_id: 'US',
    age: { $lte: 40 },
  });
});

test('parseProfileSearchQuery rejects uninterpretable queries with the exact message', () => {
  assert.throws(
    () => parseProfileSearchQuery(new URLSearchParams('q=please help me')),
    (error) => {
      assert.ok(error instanceof ProfileSearchInterpretationError);
      assert.equal(error.status, 400);
      assert.equal(error.message, SEARCH_QUERY_ERROR_MESSAGE);
      return true;
    }
  );
});

test('GET returns search results with shared pagination metadata', async () => {
  let queriedFilter;
  let countedFilter;
  const queryState = {};
  const { GET } = createHandlers({
    collection: createCollection({
      countDocuments: async (filter) => {
        countedFilter = filter;
        return 12;
      },
      find: (filter) => {
        queriedFilter = filter;
        return createCursor(
          [
            {
              id: 'id-1',
              name: 'amara',
              gender: 'female',
              gender_probability: 0.98,
              age: 22,
              age_group: 'adult',
              country_id: 'NG',
              country_name: 'Nigeria',
              country_probability: 0.74,
              created_at: '2026-04-18T08:00:00Z',
            },
          ],
          queryState
        );
      },
    }),
  });

  const response = await GET(
    new Request(
      'http://localhost:3000/api/profiles/search?q=young%20females%20from%20nigeria&page=2&limit=5'
    )
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(queriedFilter, {
    gender: 'female',
    country_id: 'NG',
    age: { $gte: 16, $lte: 24 },
  });
  assert.deepEqual(countedFilter, queriedFilter);
  assert.deepEqual(queryState, {
    skip: 5,
    limit: 5,
  });
  assert.deepEqual(payload, {
    status: 'success',
    page: 2,
    limit: 5,
    total: 12,
    data: [
      {
        id: 'id-1',
        name: 'amara',
        gender: 'female',
        gender_probability: 0.98,
        age: 22,
        age_group: 'adult',
        country_id: 'NG',
        country_name: 'Nigeria',
        country_probability: 0.74,
        created_at: '2026-04-18T08:00:00Z',
      },
    ],
  });
});

test('GET returns exact uninterpretable-query error body and skips database calls', async () => {
  let findCalled = false;
  let countCalled = false;
  const { GET } = createHandlers({
    collection: createCollection({
      countDocuments: async () => {
        countCalled = true;
        return 0;
      },
      find: () => {
        findCalled = true;
        return createCursor([]);
      },
    }),
  });

  const response = await GET(
    new Request('http://localhost:3000/api/profiles/search?q=please%20help%20me')
  );
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(findCalled, false);
  assert.equal(countCalled, false);
  assert.deepEqual(payload, {
    status: 'error',
    message: 'Unable to interpret query',
  });
});

test('GET reuses shared query validation for invalid pagination params', async () => {
  const { GET } = createHandlers();

  const response = await GET(
    new Request('http://localhost:3000/api/profiles/search?q=young%20adults&limit=oops')
  );
  const payload = await response.json();

  assert.equal(response.status, 422);
  assert.deepEqual(payload, {
    status: 'error',
    message: 'Invalid query parameters',
  });
});

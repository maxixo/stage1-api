import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProfilesFilter,
  createProfilesRouteHandlers,
} from '../app/api/profiles/route.js';
import {
  QUERY_ERROR_MESSAGE,
  parseProfileQuery,
  ProfileQueryValidationError,
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
    find: () => createCursor([]),
    countDocuments: async () => 0,
    findOne: async () => null,
    insertOne: async () => ({ acknowledged: true }),
    ...overrides,
  };
}

function createHandlers({ collection, ...overrides } = {}) {
  return createProfilesRouteHandlers({
    getCollectionFn: async () => collection ?? createCollection(),
    enrichProfileFn: async () => ({
      gender: 'female',
      gender_probability: 0.98,
      age: 28,
      country_id: 'NG',
      country_name: 'Nigeria',
      country_probability: 0.64,
    }),
    classifyAgeGroupFn: (age) => (age >= 18 ? 'adult' : 'child'),
    createId: () => 'test-id',
    now: () => new Date('2026-04-15T08:00:00.000Z'),
    ...overrides,
  });
}

test('OPTIONS returns CORS headers for GET and POST', async () => {
  const { OPTIONS } = createHandlers();

  const response = await OPTIONS();

  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get('Access-Control-Allow-Methods'),
    'GET, POST, OPTIONS'
  );
});

test('buildProfilesFilter creates equality and range filters from normalized params', () => {
  const filter = buildProfilesFilter({
    gender: 'male',
    age_group: 'adult',
    country_id: 'NG',
    min_age: 18,
    max_age: 35,
    min_gender_probability: 0.8,
    min_country_probability: 0.5,
  });

  assert.deepEqual(filter, {
    gender: 'male',
    age_group: 'adult',
    country_id: 'NG',
    age: { $gte: 18, $lte: 35 },
    gender_probability: { $gte: 0.8 },
    country_probability: { $gte: 0.5 },
  });
});

test('parseProfileQuery normalizes filters and builds sort and pagination metadata', () => {
  const query = parseProfileQuery(
    new URLSearchParams(
      'Gender=MALE&country_id=ng&AGE_GROUP=adult&min_age=18&max_age=35&min_gender_probability=0.8&min_country_probability=.5&sort_by=gender_probability&order=DESC&page=2&limit=100'
    )
  );

  assert.deepEqual(query.filter, {
    gender: 'male',
    age_group: 'adult',
    country_id: 'NG',
    age: { $gte: 18, $lte: 35 },
    gender_probability: { $gte: 0.8 },
    country_probability: { $gte: 0.5 },
  });
  assert.deepEqual(query.sort, { gender_probability: -1 });
  assert.deepEqual(query.pagination, {
    page: 2,
    limit: 50,
    skip: 50,
  });
});

test('parseProfileQuery rejects unsupported enum values with the exact error message', () => {
  assert.throws(
    () => parseProfileQuery(new URLSearchParams('gender=robot')),
    (error) => {
      assert.ok(error instanceof ProfileQueryValidationError);
      assert.equal(error.status, 400);
      assert.equal(error.message, QUERY_ERROR_MESSAGE);
      return true;
    }
  );
});

test('parseProfileQuery rejects non-numeric numeric params with 422', () => {
  assert.throws(
    () => parseProfileQuery(new URLSearchParams('min_age=old')),
    (error) => {
      assert.ok(error instanceof ProfileQueryValidationError);
      assert.equal(error.status, 422);
      assert.equal(error.message, QUERY_ERROR_MESSAGE);
      return true;
    }
  );
});

test('parseProfileQuery rejects invalid query combinations', () => {
  assert.throws(
    () => parseProfileQuery(new URLSearchParams('min_age=40&max_age=30')),
    (error) => {
      assert.ok(error instanceof ProfileQueryValidationError);
      assert.equal(error.status, 400);
      assert.equal(error.message, QUERY_ERROR_MESSAGE);
      return true;
    }
  );
});

test('GET returns a filtered paginated profile list with total count', async () => {
  let queriedFilter;
  let countedFilter;
  const queryState = {};
  const { GET } = createHandlers({
    collection: createCollection({
      find: (filter) => {
        queriedFilter = filter;
        return createCursor(
          [
            {
              id: 'id-1',
              name: 'emmanuel',
              gender: 'male',
              gender_probability: 0.99,
              age: 25,
              age_group: 'adult',
              country_id: 'NG',
              country_name: 'Nigeria',
              country_probability: 0.8,
              created_at: '2026-04-15T08:00:00Z',
            },
          ],
          queryState
        );
      },
      countDocuments: async (filter) => {
        countedFilter = filter;
        return 7;
      },
    }),
  });

  const response = await GET(
    new Request(
      'http://localhost:3000/api/profiles?gender=MALE&country_id=ng&age_group=ADULT&min_age=20&max_age=30&min_gender_probability=0.75&min_country_probability=0.5&sort_by=age&order=desc&page=2&limit=25'
    )
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(queriedFilter, {
    gender: 'male',
    country_id: 'NG',
    age_group: 'adult',
    age: { $gte: 20, $lte: 30 },
    gender_probability: { $gte: 0.75 },
    country_probability: { $gte: 0.5 },
  });
  assert.deepEqual(countedFilter, queriedFilter);
  assert.deepEqual(queryState, {
    sort: { age: -1 },
    skip: 25,
    limit: 25,
  });
  assert.deepEqual(payload, {
    status: 'success',
    page: 2,
    limit: 25,
    total: 7,
    data: [
      {
        id: 'id-1',
        name: 'emmanuel',
        gender: 'male',
        gender_probability: 0.99,
        age: 25,
        age_group: 'adult',
        country_id: 'NG',
        country_name: 'Nigeria',
        country_probability: 0.8,
        created_at: '2026-04-15T08:00:00Z',
      },
    ],
  });
});

test('GET returns all profiles when no supported filters are supplied', async () => {
  let queriedFilter;
  let countedFilter;
  const queryState = {};
  const { GET } = createHandlers({
    collection: createCollection({
      find: (filter) => {
        queriedFilter = filter;
        return createCursor(
          [
            {
              id: 'id-1',
              name: 'emmanuel',
              gender: 'male',
              gender_probability: 0.99,
              age: 25,
              age_group: 'adult',
              country_id: 'NG',
              country_probability: 0.8,
              created_at: '2026-04-15T08:00:00Z',
            },
            {
              id: 'id-2',
              name: 'sarah',
              gender: 'female',
              gender_probability: 0.97,
              age: 28,
              age_group: 'adult',
              country_id: 'US',
              country_probability: 0.72,
              created_at: '2026-04-16T08:00:00Z',
            },
          ],
          queryState
        );
      },
      countDocuments: async (filter) => {
        countedFilter = filter;
        return 2;
      },
    }),
  });

  const response = await GET(new Request('http://localhost:3000/api/profiles'));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(queriedFilter, {});
  assert.deepEqual(countedFilter, {});
  assert.deepEqual(queryState, {
    skip: 0,
    limit: 10,
  });
  assert.deepEqual(payload, {
    status: 'success',
    page: 1,
    limit: 10,
    total: 2,
    data: [
      {
        id: 'id-1',
        name: 'emmanuel',
        gender: 'male',
        gender_probability: 0.99,
        age: 25,
        age_group: 'adult',
        country_id: 'NG',
        country_name: 'Nigeria',
        country_probability: 0.8,
        created_at: '2026-04-15T08:00:00Z',
      },
      {
        id: 'id-2',
        name: 'sarah',
        gender: 'female',
        gender_probability: 0.97,
        age: 28,
        age_group: 'adult',
        country_id: 'US',
        country_name: 'United States',
        country_probability: 0.72,
        created_at: '2026-04-16T08:00:00Z',
      },
    ],
  });
});

test('GET returns paginated metadata even when the page has fewer rows than the total', async () => {
  const { GET } = createHandlers({
    collection: createCollection({
      find: () => createCursor([]),
      countDocuments: async () => 12,
    }),
  });

  const response = await GET(
    new Request('http://localhost:3000/api/profiles?page=2&limit=10')
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    status: 'success',
    page: 2,
    limit: 10,
    total: 12,
    data: [],
  });
});

test('GET returns the exact invalid query error body for bad query params', async () => {
  let findCalled = false;
  let countCalled = false;
  const { GET } = createHandlers({
    collection: createCollection({
      find: () => {
        findCalled = true;
        return createCursor([]);
      },
      countDocuments: async () => {
        countCalled = true;
        return 0;
      },
    }),
  });

  const response = await GET(
    new Request('http://localhost:3000/api/profiles?gender=robot')
  );
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(findCalled, false);
  assert.equal(countCalled, false);
  assert.deepEqual(payload, {
    status: 'error',
    message: 'Invalid query parameters',
  });
});

test('GET returns a database error when counting documents fails', async () => {
  const { GET } = createHandlers({
    collection: createCollection({
      find: () => createCursor([]),
      countDocuments: async () => {
        throw new Error('count failed');
      },
    }),
  });

  const response = await GET(new Request('http://localhost:3000/api/profiles'));
  const payload = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(payload, {
    status: 'error',
    message: 'Database error',
  });
});

test('POST creates a new enriched profile', async () => {
  const inserted = [];
  const collection = createCollection({
    findOne: async () => null,
    insertOne: async (doc) => {
      inserted.push(doc);
      return { acknowledged: true };
    },
  });
  const { POST } = createHandlers({ collection });

  const response = await POST(
    new Request('http://localhost:3000/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: ' Ella ' }),
    })
  );
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.equal(inserted.length, 1);
  assert.deepEqual(inserted[0], {
    _id: 'test-id',
    id: 'test-id',
    name: 'ella',
    gender: 'female',
    gender_probability: 0.98,
    age: 28,
    age_group: 'adult',
    country_id: 'NG',
    country_name: 'Nigeria',
    country_probability: 0.64,
    created_at: '2026-04-15T08:00:00Z',
  });
  assert.deepEqual(payload, {
    status: 'success',
    data: {
      id: 'test-id',
      name: 'ella',
      gender: 'female',
      gender_probability: 0.98,
      age: 28,
      age_group: 'adult',
      country_id: 'NG',
      country_name: 'Nigeria',
      country_probability: 0.64,
      created_at: '2026-04-15T08:00:00Z',
    },
  });
});

test('POST returns an existing profile without reinserting duplicates', async () => {
  let insertCount = 0;
  const existing = {
    id: 'profile-1',
    name: 'ella',
    gender: 'female',
    gender_probability: 0.98,
    age: 28,
    age_group: 'adult',
    country_id: 'NG',
    country_probability: 0.64,
    created_at: '2026-04-15T08:00:00Z',
  };
  const collection = createCollection({
    findOne: async () => existing,
    insertOne: async () => {
      insertCount += 1;
      return { acknowledged: true };
    },
  });
  const { POST } = createHandlers({ collection });

  const response = await POST(
    new Request('http://localhost:3000/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ella' }),
    })
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(insertCount, 0);
  assert.equal(payload.message, 'Profile already exists');
  assert.deepEqual(payload.data, {
    id: 'profile-1',
    name: 'ella',
    gender: 'female',
    gender_probability: 0.98,
    age: 28,
    age_group: 'adult',
    country_id: 'NG',
    country_name: 'Nigeria',
    country_probability: 0.64,
    created_at: '2026-04-15T08:00:00Z',
  });
});

test('POST surfaces exact 502 errors from invalid upstream data', async () => {
  const { POST } = createHandlers({
    enrichProfileFn: async () => {
      throw new Error('Genderize returned an invalid response');
    },
  });

  const response = await POST(
    new Request('http://localhost:3000/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ella' }),
    })
  );
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.deepEqual(payload, {
    status: 'error',
    message: 'Genderize returned an invalid response',
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProfilesFilter,
  createProfilesRouteHandlers,
} from '../app/api/profiles/route.js';

function createCollection(overrides = {}) {
  return {
    find: () => ({
      toArray: async () => [],
    }),
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

function assertExactCaseInsensitiveMatch(actual, expected) {
  assert.ok(actual instanceof RegExp);
  assert.equal(actual.source, `^${expected}$`);
  assert.equal(actual.flags, 'i');
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

test('buildProfilesFilter creates case-insensitive filters for supported params', () => {
  const filter = buildProfilesFilter(
    new URLSearchParams('Gender=MALE&country_id=ng&AGE_GROUP=adult&ignored=x')
  );

  assert.deepEqual(Object.keys(filter).sort(), ['age_group', 'country_id', 'gender']);
  assertExactCaseInsensitiveMatch(filter.gender, 'MALE');
  assertExactCaseInsensitiveMatch(filter.country_id, 'ng');
  assertExactCaseInsensitiveMatch(filter.age_group, 'adult');
});

test('GET returns a filtered profile list with count', async () => {
  let queriedFilter;
  const { GET } = createHandlers({
    collection: createCollection({
      find: (filter) => {
        queriedFilter = filter;
        return {
          toArray: async () => [
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
        };
      },
    }),
  });

  const response = await GET(
    new Request(
      'http://localhost:3000/api/profiles?gender=MALE&country_id=ng&age_group=ADULT'
    )
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assertExactCaseInsensitiveMatch(queriedFilter.gender, 'MALE');
  assertExactCaseInsensitiveMatch(queriedFilter.country_id, 'ng');
  assertExactCaseInsensitiveMatch(queriedFilter.age_group, 'ADULT');
  assert.deepEqual(payload, {
    status: 'success',
    count: 1,
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
  const { GET } = createHandlers({
    collection: createCollection({
      find: (filter) => {
        queriedFilter = filter;
        return {
          toArray: async () => [
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
        };
      },
    }),
  });

  const response = await GET(new Request('http://localhost:3000/api/profiles'));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(queriedFilter, {});
  assert.equal(payload.count, 2);
  assert.deepEqual(payload.data, [
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
  ]);
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

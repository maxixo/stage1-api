import assert from 'node:assert/strict';
import test from 'node:test';
import { createProfilesRouteHandlers } from '../app/api/profiles/route.js';

function createCollection(overrides = {}) {
  return {
    findOne: async () => null,
    insertOne: async () => ({ acknowledged: true }),
    ...overrides,
  };
}

function createHandlers({ collection, ...overrides } = {}) {
  return createProfilesRouteHandlers({
    getCollectionFn: async () => collection ?? createCollection(),
    enrichProfileFn: async (name) => ({
      gender: 'female',
      gender_probability: 0.98,
      sample_size: 1234,
      age: 28,
      country_id: 'NG',
      country_probability: 0.64,
      name,
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

test('GET requires the name query parameter', async () => {
  const { GET } = createHandlers();

  const response = await GET(new Request('http://localhost:3000/api/profiles'));
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(payload, {
    status: 'error',
    message: 'Name query parameter is required',
  });
});

test('GET returns a stored profile by normalized name', async () => {
  let enrichCalls = 0;
  let queriedFilter;
  const collection = createCollection({
    findOne: async (filter) => {
      queriedFilter = filter;
      return {
        id: 'profile-1',
        name: 'ella',
        gender: 'female',
        gender_probability: 0.98,
        sample_size: 1234,
        age: 28,
        age_group: 'adult',
        country_id: 'NG',
        country_probability: 0.64,
        created_at: '2026-04-15T08:00:00Z',
      };
    },
  });
  const { GET } = createHandlers({
    collection,
    enrichProfileFn: async () => {
      enrichCalls += 1;
      return {};
    },
  });

  const response = await GET(
    new Request('http://localhost:3000/api/profiles?name=%20Ella%20')
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(queriedFilter, { name: 'ella' });
  assert.equal(enrichCalls, 0);
  assert.equal(payload.status, 'success');
  assert.equal(payload.data.name, 'ella');
});

test('GET creates and stores a profile when it is missing', async () => {
  const inserted = [];
  let enrichName;
  const { GET } = createHandlers({
    collection: createCollection({
      findOne: async () => null,
      insertOne: async (doc) => {
        inserted.push(doc);
        return { acknowledged: true };
      },
    }),
    enrichProfileFn: async (name) => {
      enrichName = name;
      return {
        gender: 'male',
        gender_probability: 0.97,
        sample_size: 1400,
        age: 31,
        country_id: 'PK',
        country_probability: 0.73,
      };
    },
  });

  const response = await GET(
    new Request('http://localhost:3000/api/profiles?name=%20Usman%20')
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(enrichName, 'usman');
  assert.equal(inserted.length, 1);
  assert.deepEqual(inserted[0], {
    _id: 'test-id',
    id: 'test-id',
    name: 'usman',
    gender: 'male',
    gender_probability: 0.97,
    sample_size: 1400,
    age: 31,
    age_group: 'adult',
    country_id: 'PK',
    country_probability: 0.73,
    created_at: '2026-04-15T08:00:00Z',
  });
  assert.equal(payload.status, 'success');
  assert.equal(payload.message, 'Profile created');
  assert.equal(payload.data.name, 'usman');
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
    sample_size: 1234,
    age: 28,
    age_group: 'adult',
    country_id: 'NG',
    country_probability: 0.64,
    created_at: '2026-04-15T08:00:00Z',
  });
  assert.equal(payload.status, 'success');
  assert.equal(payload.data.name, 'ella');
});

test('POST returns an existing profile without reinserting duplicates', async () => {
  let insertCount = 0;
  const existing = {
    id: 'profile-1',
    name: 'ella',
    gender: 'female',
    gender_probability: 0.98,
    sample_size: 1234,
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
  assert.equal(payload.data.id, 'profile-1');
});

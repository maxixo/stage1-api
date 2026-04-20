import assert from 'node:assert/strict';
import test from 'node:test';
import { createProfileByIdRouteHandlers } from '../app/api/profiles/[id]/route.js';

function createCollection(overrides = {}) {
  return {
    findOne: async () => null,
    deleteOne: async () => ({ deletedCount: 1 }),
    ...overrides,
  };
}

function createHandlers({ collection } = {}) {
  return createProfileByIdRouteHandlers({
    getCollectionFn: async () => collection ?? createCollection(),
  });
}

test('OPTIONS returns CORS headers for GET and DELETE', async () => {
  const { OPTIONS } = createHandlers();

  const response = await OPTIONS();

  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get('Access-Control-Allow-Methods'),
    'GET, DELETE, OPTIONS'
  );
});

test('GET returns a profile by id', async () => {
  let queriedFilter;
  const { GET } = createHandlers({
    collection: createCollection({
      findOne: async (filter) => {
        queriedFilter = filter;
        return {
          id: 'profile-1',
          name: 'emmanuel',
          gender: 'male',
          gender_probability: 0.99,
          age: 25,
          age_group: 'adult',
          country_id: 'NG',
          country_probability: 0.85,
          created_at: '2026-04-01T12:00:00Z',
        };
      },
    }),
  });

  const response = await GET(new Request('http://localhost:3000/api/profiles/profile-1'), {
    params: Promise.resolve({ id: ' profile-1 ' }),
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(queriedFilter, { id: 'profile-1' });
  assert.deepEqual(payload, {
    status: 'success',
    data: {
      id: 'profile-1',
      name: 'emmanuel',
      gender: 'male',
      gender_probability: 0.99,
      age: 25,
      age_group: 'adult',
      country_id: 'NG',
      country_name: 'Nigeria',
      country_probability: 0.85,
      created_at: '2026-04-01T12:00:00Z',
    },
  });
});

test('GET returns 404 when the profile does not exist', async () => {
  const { GET } = createHandlers({
    collection: createCollection({
      findOne: async () => null,
    }),
  });

  const response = await GET(new Request('http://localhost:3000/api/profiles/profile-1'), {
    params: Promise.resolve({ id: 'profile-1' }),
  });
  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.deepEqual(payload, {
    status: 'error',
    message: 'Profile not found',
  });
});

test('DELETE removes a profile by id and returns 204', async () => {
  let deletedFilter;
  const { DELETE } = createHandlers({
    collection: createCollection({
      deleteOne: async (filter) => {
        deletedFilter = filter;
        return { deletedCount: 1 };
      },
    }),
  });

  const response = await DELETE(
    new Request('http://localhost:3000/api/profiles/profile-1'),
    {
      params: Promise.resolve({ id: ' profile-1 ' }),
    }
  );

  assert.equal(response.status, 204);
  assert.deepEqual(deletedFilter, { id: 'profile-1' });
  assert.equal(await response.text(), '');
});

test('DELETE returns 404 when the profile does not exist', async () => {
  const { DELETE } = createHandlers({
    collection: createCollection({
      deleteOne: async () => ({ deletedCount: 0 }),
    }),
  });

  const response = await DELETE(
    new Request('http://localhost:3000/api/profiles/profile-1'),
    {
      params: Promise.resolve({ id: 'profile-1' }),
    }
  );
  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.deepEqual(payload, {
    status: 'error',
    message: 'Profile not found',
  });
});

test('DELETE returns 400 when the profile id is missing', async () => {
  const { DELETE } = createHandlers();

  const response = await DELETE(new Request('http://localhost:3000/api/profiles/'), {
    params: Promise.resolve({ id: '   ' }),
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(payload, {
    status: 'error',
    message: 'Profile id is required',
  });
});

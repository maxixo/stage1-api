import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseProfileListControls,
  parseProfileQuery,
  parseProfileSearchQuery,
  ProfileQueryValidationError,
  ProfileSearchInterpretationError,
  QUERY_ERROR_MESSAGE,
  SEARCH_QUERY_ERROR_MESSAGE,
} from '../lib/profile-query.js';

test('parseProfileListControls applies default pagination without sort', () => {
  const controls = parseProfileListControls(new URLSearchParams());

  assert.deepEqual(controls, {
    pagination: {
      page: 1,
      limit: 10,
      skip: 0,
    },
    params: {
      order: null,
      sort_by: null,
    },
    sort: null,
  });
});

test('parseProfileListControls caps limit and builds descending sort objects', () => {
  const controls = parseProfileListControls(
    new URLSearchParams('sort_by=created_at&order=desc&page=3&limit=200')
  );

  assert.deepEqual(controls, {
    pagination: {
      page: 3,
      limit: 50,
      skip: 100,
    },
    params: {
      order: 'desc',
      sort_by: 'created_at',
    },
    sort: {
      created_at: -1,
    },
  });
});

test('parseProfileListControls rejects order without sort_by', () => {
  assert.throws(
    () => parseProfileListControls(new URLSearchParams('order=desc')),
    (error) => {
      assert.ok(error instanceof ProfileQueryValidationError);
      assert.equal(error.status, 400);
      assert.equal(error.message, QUERY_ERROR_MESSAGE);
      return true;
    }
  );
});

test('parseProfileQuery rejects empty enum values with the exact validation message', () => {
  assert.throws(
    () => parseProfileQuery(new URLSearchParams('gender=')),
    (error) => {
      assert.ok(error instanceof ProfileQueryValidationError);
      assert.equal(error.status, 400);
      assert.equal(error.message, QUERY_ERROR_MESSAGE);
      return true;
    }
  );
});

test('parseProfileSearchQuery supports spaced country names and older-than phrases', () => {
  const query = parseProfileSearchQuery(
    new URLSearchParams('q=female adults older than 30 from united kingdom')
  );

  assert.deepEqual(query.filter, {
    gender: 'female',
    age_group: 'adult',
    country_id: 'GB',
    age: { $gte: 30 },
  });
});

test('parseProfileSearchQuery supports under comparators without extra rules', () => {
  const query = parseProfileSearchQuery(new URLSearchParams('q=children under 10'));

  assert.deepEqual(query.filter, {
    age_group: 'child',
    age: { $lte: 10 },
  });
});

test('parseProfileSearchQuery rejects missing or blank q with the exact message', () => {
  for (const searchParams of [new URLSearchParams(), new URLSearchParams('q=   ')]) {
    assert.throws(
      () => parseProfileSearchQuery(searchParams),
      (error) => {
        assert.ok(error instanceof ProfileSearchInterpretationError);
        assert.equal(error.status, 400);
        assert.equal(error.message, SEARCH_QUERY_ERROR_MESSAGE);
        return true;
      }
    );
  }
});

test('parseProfileSearchQuery rejects contradictory extracted age rules', () => {
  assert.throws(
    () => parseProfileSearchQuery(new URLSearchParams('q=young adults older than 30')),
    (error) => {
      assert.ok(error instanceof ProfileSearchInterpretationError);
      assert.equal(error.status, 400);
      assert.equal(error.message, SEARCH_QUERY_ERROR_MESSAGE);
      return true;
    }
  );
});

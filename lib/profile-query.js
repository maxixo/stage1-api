import { findCountryIdInText, normalizeCountryId } from './countries.js';

const QUERY_ERROR_MESSAGE = 'Invalid query parameters';
const SEARCH_QUERY_ERROR_MESSAGE = 'Unable to interpret query';
const GENDER_VALUES = new Set(['male', 'female']);
const AGE_GROUP_VALUES = new Set(['child', 'teenager', 'adult', 'senior']);
const SORT_FIELDS = new Set(['age', 'created_at', 'gender_probability']);
const SORT_ORDERS = new Set(['asc', 'desc']);
const SEARCH_GENDER_TOKENS = new Map([
  ['male', 'male'],
  ['males', 'male'],
  ['female', 'female'],
  ['females', 'female'],
]);
const SEARCH_AGE_GROUP_TOKENS = new Map([
  ['adult', 'adult'],
  ['adults', 'adult'],
  ['child', 'child'],
  ['children', 'child'],
  ['senior', 'senior'],
  ['seniors', 'senior'],
  ['teenager', 'teenager'],
  ['teenagers', 'teenager'],
]);

class ProfileQueryValidationError extends Error {
  constructor(status) {
    super(QUERY_ERROR_MESSAGE);
    this.name = 'ProfileQueryValidationError';
    this.status = status;
  }
}

class ProfileSearchInterpretationError extends Error {
  constructor(status = 400) {
    super(SEARCH_QUERY_ERROR_MESSAGE);
    this.name = 'ProfileSearchInterpretationError';
    this.status = status;
  }
}

function getSearchParam(searchParams, key) {
  for (const [entryKey, value] of searchParams.entries()) {
    if (entryKey.toLowerCase() === key) {
      return value;
    }
  }

  return null;
}

function normalizeQueryValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = value.trim();

  if (normalizedValue === '') {
    throw new ProfileQueryValidationError(400);
  }

  return normalizedValue;
}

function parseEnumParam(searchParams, key, allowedValues, normalizeValue = (value) => value) {
  const rawValue = normalizeQueryValue(getSearchParam(searchParams, key));

  if (rawValue === null) {
    return null;
  }

  const normalizedValue = normalizeValue(rawValue);

  if (!allowedValues.has(normalizedValue)) {
    throw new ProfileQueryValidationError(400);
  }

  return normalizedValue;
}

function isIntegerString(value) {
  return /^\d+$/.test(value);
}

function isNumberString(value) {
  return /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value);
}

function parseIntegerParam(searchParams, key, { defaultValue = null, min, max, clampMax = false } = {}) {
  const rawValue = normalizeQueryValue(getSearchParam(searchParams, key));

  if (rawValue === null) {
    return defaultValue;
  }

  if (!isIntegerString(rawValue)) {
    throw new ProfileQueryValidationError(422);
  }

  const parsedValue = Number(rawValue);

  if (min !== undefined && parsedValue < min) {
    throw new ProfileQueryValidationError(400);
  }

  if (max !== undefined && parsedValue > max) {
    if (clampMax) {
      return max;
    }

    throw new ProfileQueryValidationError(400);
  }

  return parsedValue;
}

function parseNumberParam(searchParams, key, { min, max } = {}) {
  const rawValue = normalizeQueryValue(getSearchParam(searchParams, key));

  if (rawValue === null) {
    return null;
  }

  if (!isNumberString(rawValue)) {
    throw new ProfileQueryValidationError(422);
  }

  const parsedValue = Number(rawValue);

  if (min !== undefined && parsedValue < min) {
    throw new ProfileQueryValidationError(400);
  }

  if (max !== undefined && parsedValue > max) {
    throw new ProfileQueryValidationError(400);
  }

  return parsedValue;
}

function parseCountryId(searchParams) {
  const rawValue = normalizeQueryValue(getSearchParam(searchParams, 'country_id'));

  if (rawValue === null) {
    return null;
  }

  const countryId = normalizeCountryId(rawValue);

  if (!countryId) {
    throw new ProfileQueryValidationError(400);
  }

  return countryId;
}

function buildProfilesFilter({
  gender = null,
  age_group = null,
  country_id = null,
  min_age = null,
  max_age = null,
  min_gender_probability = null,
  min_country_probability = null,
} = {}) {
  const filter = {};

  if (gender !== null) {
    filter.gender = gender;
  }

  if (age_group !== null) {
    filter.age_group = age_group;
  }

  if (country_id !== null) {
    filter.country_id = country_id;
  }

  if (min_age !== null || max_age !== null) {
    filter.age = {};

    if (min_age !== null) {
      filter.age.$gte = min_age;
    }

    if (max_age !== null) {
      filter.age.$lte = max_age;
    }
  }

  if (min_gender_probability !== null) {
    filter.gender_probability = { $gte: min_gender_probability };
  }

  if (min_country_probability !== null) {
    filter.country_probability = { $gte: min_country_probability };
  }

  return filter;
}

function parseProfileFilterParams(searchParams) {
  const gender = parseEnumParam(searchParams, 'gender', GENDER_VALUES, (value) =>
    value.toLowerCase()
  );
  const age_group = parseEnumParam(searchParams, 'age_group', AGE_GROUP_VALUES, (value) =>
    value.toLowerCase()
  );
  const country_id = parseCountryId(searchParams);
  const min_age = parseIntegerParam(searchParams, 'min_age', { min: 0 });
  const max_age = parseIntegerParam(searchParams, 'max_age', { min: 0 });
  const min_gender_probability = parseNumberParam(searchParams, 'min_gender_probability', {
    min: 0,
    max: 1,
  });
  const min_country_probability = parseNumberParam(searchParams, 'min_country_probability', {
    min: 0,
    max: 1,
  });

  if (min_age !== null && max_age !== null && min_age > max_age) {
    throw new ProfileQueryValidationError(400);
  }

  return {
    age_group,
    country_id,
    gender,
    max_age,
    min_age,
    min_country_probability,
    min_gender_probability,
  };
}

function parseProfileListControls(searchParams) {
  const sort_by = parseEnumParam(searchParams, 'sort_by', SORT_FIELDS);
  const rawOrder = getSearchParam(searchParams, 'order');

  if (sort_by === null && rawOrder !== null) {
    normalizeQueryValue(rawOrder);
    throw new ProfileQueryValidationError(400);
  }

  const order =
    sort_by === null
      ? null
      : parseEnumParam(searchParams, 'order', SORT_ORDERS, (value) => value.toLowerCase()) ??
        'asc';
  const page = parseIntegerParam(searchParams, 'page', { defaultValue: 1, min: 1 });
  const limit = parseIntegerParam(searchParams, 'limit', {
    defaultValue: 10,
    min: 1,
    max: 50,
    clampMax: true,
  });

  return {
    pagination: {
      page,
      limit,
      skip: (page - 1) * limit,
    },
    params: {
      order,
      sort_by,
    },
    sort: sort_by ? { [sort_by]: order === 'desc' ? -1 : 1 } : null,
  };
}

function normalizeSearchText(value) {
  const normalizedValue = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  return normalizedValue;
}

function extractUniqueValues(text, tokenMap) {
  const values = new Set();

  for (const [token, normalizedValue] of tokenMap.entries()) {
    if (new RegExp(`\\b${token}\\b`).test(text)) {
      values.add(normalizedValue);
    }
  }

  return values;
}

function extractMinAge(text) {
  let minAge = null;

  for (const match of text.matchAll(/\b(?:above|over|older than)\s+(\d+)\b/g)) {
    const value = Number(match[1]);
    minAge = minAge === null ? value : Math.max(minAge, value);
  }

  return minAge;
}

function extractMaxAge(text) {
  let maxAge = null;

  for (const match of text.matchAll(/\b(?:below|under|younger than)\s+(\d+)\b/g)) {
    const value = Number(match[1]);
    maxAge = maxAge === null ? value : Math.min(maxAge, value);
  }

  return maxAge;
}

function parseProfileSearchQuery(searchParams) {
  const rawQuery = getSearchParam(searchParams, 'q');

  if (rawQuery === null || rawQuery.trim() === '') {
    throw new ProfileSearchInterpretationError(400);
  }

  const normalizedQuery = normalizeSearchText(rawQuery);

  if (normalizedQuery === '') {
    throw new ProfileSearchInterpretationError(400);
  }

  const genderMatches = extractUniqueValues(normalizedQuery, SEARCH_GENDER_TOKENS);
  const ageGroupMatches = extractUniqueValues(normalizedQuery, SEARCH_AGE_GROUP_TOKENS);
  const gender = genderMatches.size === 1 ? [...genderMatches][0] : null;
  const age_group = ageGroupMatches.size === 1 ? [...ageGroupMatches][0] : null;
  let min_age = extractMinAge(normalizedQuery);
  let max_age = extractMaxAge(normalizedQuery);

  if (/\byoung\b/.test(normalizedQuery)) {
    min_age = min_age === null ? 16 : Math.max(min_age, 16);
    max_age = max_age === null ? 24 : Math.min(max_age, 24);
  }

  const country_id = findCountryIdInText(normalizedQuery);
  const hasRecognizedRule = [
    gender !== null,
    age_group !== null,
    min_age !== null,
    max_age !== null,
    country_id !== null,
  ].some(Boolean);

  if (!hasRecognizedRule || (min_age !== null && max_age !== null && min_age > max_age)) {
    throw new ProfileSearchInterpretationError(400);
  }

  return {
    filter: buildProfilesFilter({
      gender,
      age_group,
      country_id,
      min_age,
      max_age,
    }),
    params: {
      age_group,
      country_id,
      gender,
      max_age,
      min_age,
      q: rawQuery,
    },
  };
}

function parseProfileQuery(searchParams) {
  const filterParams = parseProfileFilterParams(searchParams);
  const controls = parseProfileListControls(searchParams);

  return {
    filter: buildProfilesFilter(filterParams),
    pagination: controls.pagination,
    params: {
      ...filterParams,
      ...controls.params,
    },
    sort: controls.sort,
  };
}

export {
  buildProfilesFilter,
  parseProfileListControls,
  parseProfileQuery,
  parseProfileSearchQuery,
  ProfileSearchInterpretationError,
  ProfileQueryValidationError,
  QUERY_ERROR_MESSAGE,
  SEARCH_QUERY_ERROR_MESSAGE,
};

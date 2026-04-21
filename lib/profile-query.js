import { normalizeCountryId } from './countries.js';

const QUERY_ERROR_MESSAGE = 'Invalid query parameters';
const GENDER_VALUES = new Set(['male', 'female']);
const AGE_GROUP_VALUES = new Set(['child', 'teenager', 'adult', 'senior']);
const SORT_FIELDS = new Set(['age', 'created_at', 'gender_probability']);
const SORT_ORDERS = new Set(['asc', 'desc']);

class ProfileQueryValidationError extends Error {
  constructor(status) {
    super(QUERY_ERROR_MESSAGE);
    this.name = 'ProfileQueryValidationError';
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

function parseProfileQuery(searchParams) {
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
  const sort_by = parseEnumParam(searchParams, 'sort_by', SORT_FIELDS);
  const rawOrder = getSearchParam(searchParams, 'order');

  if (min_age !== null && max_age !== null && min_age > max_age) {
    throw new ProfileQueryValidationError(400);
  }

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
  const skip = (page - 1) * limit;

  return {
    filter: buildProfilesFilter({
      gender,
      age_group,
      country_id,
      min_age,
      max_age,
      min_gender_probability,
      min_country_probability,
    }),
    sort: sort_by ? { [sort_by]: order === 'desc' ? -1 : 1 } : null,
    pagination: {
      page,
      limit,
      skip,
    },
    params: {
      gender,
      age_group,
      country_id,
      min_age,
      max_age,
      min_gender_probability,
      min_country_probability,
      sort_by,
      order,
    },
  };
}

export {
  buildProfilesFilter,
  parseProfileQuery,
  ProfileQueryValidationError,
  QUERY_ERROR_MESSAGE,
};

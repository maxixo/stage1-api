const GENDERIZE_URL = 'https://api.genderize.io';
const AGIFY_URL = 'https://api.agify.io';
const NATIONALIZE_URL = 'https://api.nationalize.io';

function buildEnrichmentUrls(name) {
  const encodedName = encodeURIComponent(name);

  return [
    `${GENDERIZE_URL}?name=${encodedName}`,
    `${AGIFY_URL}?name=${encodedName}`,
    `${NATIONALIZE_URL}?name=${encodedName}`,
  ];
}

function createInvalidServiceResponseError(serviceName) {
  return new Error(`${serviceName} returned an invalid response`);
}

async function parseServicePayload(response, serviceName) {
  if (!response?.ok) {
    throw createInvalidServiceResponseError(serviceName);
  }

  try {
    return await response.json();
  } catch {
    throw createInvalidServiceResponseError(serviceName);
  }
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export async function enrichProfile(name, { fetchFn = fetch } = {}) {
  let responses;
  const [genderizeUrl, agifyUrl, nationalizeUrl] = buildEnrichmentUrls(name);

  try {
    responses = await Promise.all([
      fetchFn(genderizeUrl, {
        cache: 'no-store',
      }),
      fetchFn(agifyUrl, {
        cache: 'no-store',
      }),
      fetchFn(nationalizeUrl, {
        cache: 'no-store',
      }),
    ]);
  } catch {
    throw new Error('Failed to reach enrichment services');
  }

  const [genderRes, agifyRes, nationalizeRes] = responses;

  const payloads = await Promise.all([
    parseServicePayload(genderRes, 'Genderize'),
    parseServicePayload(agifyRes, 'Agify'),
    parseServicePayload(nationalizeRes, 'Nationalize'),
  ]);

  const [genderData, agifyData, nationalizeData] = payloads;

  if (
    genderData.gender === null ||
    !isFiniteNumber(genderData.probability) ||
    !isFiniteNumber(genderData.count) ||
    genderData.count === 0
  ) {
    throw createInvalidServiceResponseError('Genderize');
  }

  if (!isFiniteNumber(agifyData.age)) {
    throw createInvalidServiceResponseError('Agify');
  }

  const countries = nationalizeData.countries ?? nationalizeData.country;

  if (!Array.isArray(countries) || countries.length === 0) {
    throw createInvalidServiceResponseError('Nationalize');
  }

  const topCountry = [...countries].sort(
    (a, b) => b.probability - a.probability
  )[0];

  if (!topCountry?.country_id || !isFiniteNumber(topCountry.probability)) {
    throw createInvalidServiceResponseError('Nationalize');
  }

  return {
    gender: genderData.gender,
    gender_probability: genderData.probability,
    sample_size: genderData.count,
    age: agifyData.age,
    country_id: topCountry.country_id,
    country_probability: topCountry.probability,
  };
}

export {
  AGIFY_URL,
  buildEnrichmentUrls,
  createInvalidServiceResponseError,
  GENDERIZE_URL,
  NATIONALIZE_URL,
  parseServicePayload,
};

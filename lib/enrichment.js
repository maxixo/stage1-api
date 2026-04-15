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

  if (!genderRes.ok || !agifyRes.ok || !nationalizeRes.ok) {
    throw new Error('One or more external APIs returned an error');
  }

  let payloads;

  try {
    payloads = await Promise.all([
      genderRes.json(),
      agifyRes.json(),
      nationalizeRes.json(),
    ]);
  } catch {
    throw new Error('Invalid response received from enrichment services');
  }

  const [genderData, agifyData, nationalizeData] = payloads;

  if (genderData.gender === null) {
    throw new Error('Gender data unavailable for the given name');
  }

  if (genderData.count === 0) {
    throw new Error('Insufficient sample size for gender prediction');
  }

  if (agifyData.age === null) {
    throw new Error('Age data unavailable for the given name');
  }

  const countries = nationalizeData.countries ?? nationalizeData.country;

  if (!Array.isArray(countries) || countries.length === 0) {
    throw new Error('Nationality data unavailable for the given name');
  }

  const topCountry = [...countries].sort(
    (a, b) => b.probability - a.probability
  )[0];

  return {
    gender: genderData.gender,
    gender_probability: genderData.probability,
    sample_size: genderData.count,
    age: agifyData.age,
    country_id: topCountry.country_id,
    country_probability: topCountry.probability,
  };
}

export { AGIFY_URL, buildEnrichmentUrls, GENDERIZE_URL, NATIONALIZE_URL };

import { getCountryName } from './countries.js';

function formatProfileDocument(doc) {
  return {
    id: doc.id,
    name: doc.name,
    gender: doc.gender,
    gender_probability: doc.gender_probability,
    age: doc.age,
    age_group: doc.age_group,
    country_id: doc.country_id,
    country_name: doc.country_name ?? getCountryName(doc.country_id),
    country_probability: doc.country_probability,
    created_at: doc.created_at,
  };
}

export { formatProfileDocument };

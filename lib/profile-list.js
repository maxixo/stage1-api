import { formatProfileDocument } from './profile-shape.js';

async function executeProfileListQuery(collection, querySpec) {
  let cursor = collection.find(querySpec.filter);
  const totalPromise = collection.countDocuments(querySpec.filter);

  if (querySpec.sort) {
    cursor = cursor.sort(querySpec.sort);
  }

  const [total, docs] = await Promise.all([
    totalPromise,
    cursor.skip(querySpec.pagination.skip).limit(querySpec.pagination.limit).toArray(),
  ]);

  return {
    status: 'success',
    page: querySpec.pagination.page,
    limit: querySpec.pagination.limit,
    total,
    data: docs.map(formatProfileDocument),
  };
}

export { executeProfileListQuery };

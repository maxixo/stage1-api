import { NextResponse } from 'next/server.js';
import { uuidv7 } from 'uuidv7';
import { getCollection } from '../../../lib/db.js';
import { enrichProfile } from '../../../lib/enrichment.js';
import { classifyAgeGroup } from '../../../lib/classify.js';

export const runtime = 'nodejs';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const FILTER_KEYS = ['gender', 'country_id', 'age_group'];

function formatDocument(doc) {
  return {
    id: doc.id,
    name: doc.name,
    gender: doc.gender,
    gender_probability: doc.gender_probability,
    sample_size: doc.sample_size,
    age: doc.age,
    age_group: doc.age_group,
    country_id: doc.country_id,
    country_probability: doc.country_probability,
    created_at: doc.created_at,
  };
}

function successPayload(doc, message) {
  const payload = {
    status: 'success',
    data: formatDocument(doc),
  };

  if (message) {
    payload.message = message;
  }

  return payload;
}

function formatListDocument(doc) {
  return {
    id: doc.id,
    name: doc.name,
    gender: doc.gender,
    age: doc.age,
    age_group: doc.age_group,
    country_id: doc.country_id,
  };
}

function normalizeName(name, requiredMessage = 'Name is required') {
  if (name === undefined || name === null || name === '') {
    return { error: { status: 400, message: requiredMessage } };
  }

  if (typeof name !== 'string') {
    return { error: { status: 422, message: 'Name must be a string' } };
  }

  const normalizedName = name.trim().toLowerCase();

  if (normalizedName === '') {
    return { error: { status: 400, message: requiredMessage } };
  }

  return { normalizedName };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getSearchParam(searchParams, key) {
  for (const [entryKey, value] of searchParams.entries()) {
    if (entryKey.toLowerCase() === key) {
      return value;
    }
  }

  return null;
}

function normalizeFilterValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue === '' ? null : normalizedValue;
}

function buildProfilesFilter(searchParams) {
  const filter = {};

  for (const key of FILTER_KEYS) {
    const rawValue = getSearchParam(searchParams, key);
    const normalizedValue = normalizeFilterValue(rawValue);

    if (!normalizedValue) {
      continue;
    }

    filter[key] = new RegExp(`^${escapeRegex(normalizedValue)}$`, 'i');
  }

  return filter;
}

function createResponseHelpers(NextResponseClass) {
  return {
    errorResponse(status, message) {
      return NextResponseClass.json(
        { status: 'error', message },
        { status, headers: CORS_HEADERS }
      );
    },
    successResponse(payload, status) {
      return NextResponseClass.json(payload, { status, headers: CORS_HEADERS });
    },
    optionsResponse() {
      return new NextResponseClass(null, { status: 204, headers: CORS_HEADERS });
    },
  };
}

function createProfilesRouteHandlers({
  getCollectionFn = getCollection,
  enrichProfileFn = enrichProfile,
  classifyAgeGroupFn = classifyAgeGroup,
  createId = uuidv7,
  now = () => new Date(),
  NextResponseClass = NextResponse,
} = {}) {
  const { errorResponse, successResponse, optionsResponse } =
    createResponseHelpers(NextResponseClass);

  async function getConnectedCollection() {
    try {
      return await getCollectionFn();
    } catch {
      return null;
    }
  }

  async function GET(request) {
    const collection = await getConnectedCollection();

    if (!collection) {
      return errorResponse(500, 'Database error');
    }

    const filter = buildProfilesFilter(new URL(request.url).searchParams);

    try {
      const docs = await collection.find(filter).toArray();

      return successResponse(
        {
          status: 'success',
          count: docs.length,
          data: docs.map(formatListDocument),
        },
        200
      );
    } catch {
      return errorResponse(500, 'Database error');
    }
  }

  async function POST(request) {
    let body;

    try {
      body = await request.json();
    } catch {
      return errorResponse(400, 'Invalid JSON body');
    }

    const { normalizedName, error } = normalizeName(body?.name);

    if (error) {
      return errorResponse(error.status, error.message);
    }

    const collection = await getConnectedCollection();

    if (!collection) {
      return errorResponse(500, 'Database error');
    }

    return createProfile({ collection, normalizedName });
  }

  async function createProfile({ collection, normalizedName }) {
    try {
      const existing = await collection.findOne({ name: normalizedName });

      if (existing) {
        return successResponse(successPayload(existing, 'Profile already exists'), 200);
      }
    } catch {
      return errorResponse(500, 'Database error');
    }

    let enriched;

    try {
      enriched = await enrichProfileFn(normalizedName);
    } catch (error) {
      return errorResponse(
        502,
        error instanceof Error
          ? error.message
          : 'Failed to enrich profile data'
      );
    }

    let age_group;

    try {
      age_group = classifyAgeGroupFn(enriched.age);
    } catch (error) {
      return errorResponse(
        500,
        error instanceof Error ? error.message : 'Invalid age value'
      );
    }

    const id = createId();
    const created_at = now().toISOString().replace(/\.\d{3}Z$/, 'Z');

    const doc = {
      _id: id,
      id,
      name: normalizedName,
      gender: enriched.gender,
      gender_probability: enriched.gender_probability,
      sample_size: enriched.sample_size,
      age: enriched.age,
      age_group,
      country_id: enriched.country_id,
      country_probability: enriched.country_probability,
      created_at,
    };

    try {
      await collection.insertOne(doc);
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 11000) {
        try {
          const existing = await collection.findOne({ name: normalizedName });

          if (!existing) {
            return errorResponse(500, 'Database error');
          }

          return successResponse(successPayload(existing, 'Profile already exists'), 200);
        } catch {
          return errorResponse(500, 'Database error');
        }
      }

      return errorResponse(500, 'Database error');
    }

    return successResponse(successPayload(doc), 201);
  }

  return {
    GET,
    OPTIONS: optionsResponse,
    POST,
  };
}

const handlers = createProfilesRouteHandlers();

export const GET = handlers.GET;
export const OPTIONS = handlers.OPTIONS;
export const POST = handlers.POST;

export {
  buildProfilesFilter,
  createProfilesRouteHandlers,
  formatDocument,
  formatListDocument,
  normalizeName,
  successPayload,
};

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
    const nameParam = new URL(request.url).searchParams.get('name');
    const { normalizedName, error } = normalizeName(
      nameParam,
      'Name query parameter is required'
    );

    if (error) {
      return errorResponse(error.status, error.message);
    }

    const collection = await getConnectedCollection();

    if (!collection) {
      return errorResponse(500, 'Database error');
    }

    return resolveProfileRequest({
      collection,
      normalizedName,
      createWhenMissing: true,
      createdMessage: 'Profile created',
      createdStatus: 200,
      existingMessage: undefined,
      raceMessage: 'Profile already exists',
    });
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

    return resolveProfileRequest({
      collection,
      normalizedName,
      createWhenMissing: true,
      createdStatus: 201,
      existingMessage: 'Profile already exists',
      raceMessage: 'Profile already exists',
    });
  }

  async function resolveProfileRequest({
    collection,
    normalizedName,
    createWhenMissing,
    createdMessage,
    createdStatus,
    existingMessage,
    raceMessage,
  }) {
    try {
      const existing = await collection.findOne({ name: normalizedName });

      if (existing) {
        return successResponse(successPayload(existing, existingMessage), 200);
      }
    } catch {
      return errorResponse(500, 'Database error');
    }

    if (!createWhenMissing) {
      return errorResponse(404, 'Profile not found');
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

          return successResponse(successPayload(existing, raceMessage), 200);
        } catch {
          return errorResponse(500, 'Database error');
        }
      }

      return errorResponse(500, 'Database error');
    }

    return successResponse(successPayload(doc, createdMessage), createdStatus);
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

export { createProfilesRouteHandlers, formatDocument, normalizeName, successPayload };

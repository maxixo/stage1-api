import { NextResponse } from 'next/server.js';
import { getCollection } from '../../../../lib/db.js';
import { formatProfileDocument } from '../../../../lib/profile-shape.js';

export const runtime = 'nodejs';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const formatDocument = formatProfileDocument;

function normalizeId(id) {
  if (id === undefined || id === null || id === '') {
    return { error: { status: 400, message: 'Profile id is required' } };
  }

  if (typeof id !== 'string') {
    return { error: { status: 422, message: 'Profile id must be a string' } };
  }

  const normalizedId = id.trim();

  if (normalizedId === '') {
    return { error: { status: 400, message: 'Profile id is required' } };
  }

  return { normalizedId };
}

function createResponseHelpers(NextResponseClass) {
  return {
    errorResponse(status, message) {
      return NextResponseClass.json(
        { status: 'error', message },
        { status, headers: CORS_HEADERS }
      );
    },
    successResponse(payload, status = 200) {
      return NextResponseClass.json(payload, { status, headers: CORS_HEADERS });
    },
    noContentResponse() {
      return new NextResponseClass(null, { status: 204, headers: CORS_HEADERS });
    },
    optionsResponse() {
      return new NextResponseClass(null, { status: 204, headers: CORS_HEADERS });
    },
  };
}

function createProfileByIdRouteHandlers({
  getCollectionFn = getCollection,
  NextResponseClass = NextResponse,
} = {}) {
  const { errorResponse, noContentResponse, optionsResponse, successResponse } =
    createResponseHelpers(NextResponseClass);

  async function getConnectedCollection() {
    try {
      return await getCollectionFn();
    } catch {
      return null;
    }
  }

  async function DELETE(_request, context) {
    const params = await context?.params;
    const { normalizedId, error } = normalizeId(params?.id);

    if (error) {
      return errorResponse(error.status, error.message);
    }

    const collection = await getConnectedCollection();

    if (!collection) {
      return errorResponse(500, 'Database error');
    }

    try {
      const result = await collection.deleteOne({ id: normalizedId });

      if (!result?.deletedCount) {
        return errorResponse(404, 'Profile not found');
      }
    } catch {
      return errorResponse(500, 'Database error');
    }

    return noContentResponse();
  }

  async function GET(_request, context) {
    const params = await context?.params;
    const { normalizedId, error } = normalizeId(params?.id);

    if (error) {
      return errorResponse(error.status, error.message);
    }

    const collection = await getConnectedCollection();

    if (!collection) {
      return errorResponse(500, 'Database error');
    }

    try {
      const doc = await collection.findOne({ id: normalizedId });

      if (!doc) {
        return errorResponse(404, 'Profile not found');
      }

      return successResponse({ status: 'success', data: formatDocument(doc) });
    } catch {
      return errorResponse(500, 'Database error');
    }
  }

  return {
    GET,
    DELETE,
    OPTIONS: optionsResponse,
  };
}

const handlers = createProfileByIdRouteHandlers();

export const GET = handlers.GET;
export const DELETE = handlers.DELETE;
export const OPTIONS = handlers.OPTIONS;

export { createProfileByIdRouteHandlers, formatDocument, normalizeId };

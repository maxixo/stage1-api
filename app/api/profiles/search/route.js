import { NextResponse } from 'next/server.js';
import { getCollection } from '../../../../lib/db.js';
import { executeProfileListQuery } from '../../../../lib/profile-list.js';
import {
  parseProfileListControls,
  parseProfileSearchQuery,
  ProfileSearchInterpretationError,
  ProfileQueryValidationError,
} from '../../../../lib/profile-query.js';

export const runtime = 'nodejs';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function createResponseHelpers(NextResponseClass) {
  return {
    errorResponse(status, message) {
      return NextResponseClass.json(
        { status: 'error', message },
        { status, headers: CORS_HEADERS }
      );
    },
    optionsResponse() {
      return new NextResponseClass(null, { status: 204, headers: CORS_HEADERS });
    },
    successResponse(payload, status = 200) {
      return NextResponseClass.json(payload, { status, headers: CORS_HEADERS });
    },
  };
}

function createProfilesSearchRouteHandlers({
  getCollectionFn = getCollection,
  NextResponseClass = NextResponse,
} = {}) {
  const { errorResponse, optionsResponse, successResponse } =
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

    const searchParams = new URL(request.url).searchParams;
    let querySpec;

    try {
      const searchQuery = parseProfileSearchQuery(searchParams);
      const controls = parseProfileListControls(searchParams);

      querySpec = {
        filter: searchQuery.filter,
        pagination: controls.pagination,
        sort: controls.sort,
      };
    } catch (error) {
      if (
        error instanceof ProfileSearchInterpretationError ||
        error instanceof ProfileQueryValidationError
      ) {
        return errorResponse(error.status, error.message);
      }

      return errorResponse(500, 'Database error');
    }

    try {
      return successResponse(await executeProfileListQuery(collection, querySpec));
    } catch {
      return errorResponse(500, 'Database error');
    }
  }

  return {
    GET,
    OPTIONS: optionsResponse,
  };
}

const handlers = createProfilesSearchRouteHandlers();

export const GET = handlers.GET;
export const OPTIONS = handlers.OPTIONS;

export { createProfilesSearchRouteHandlers };

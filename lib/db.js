import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MongoClient } from 'mongodb';

const DEFAULT_DB_NAME = 'profile_db';
const DEFAULT_COLLECTION_NAME = 'profiles';
const CLIENT_KEY = '_mongoClient';
const CLIENT_PROMISE_KEY = '_mongoClientPromise';
const execFileAsync = promisify(execFile);

function parseSrvHosts(output) {
  return [...output.matchAll(/svr hostname\s*=\s*([^\s]+)/gi)].map(
    (match) => match[1]
  );
}

function parseTxtOptions(output) {
  return [...output.matchAll(/"([^"]+)"/g)].map((match) => match[1]).join('&');
}

async function lookupDnsRecord(recordType, hostname, execFileFn) {
  const { stdout } = await execFileFn('nslookup', [`-type=${recordType}`, hostname]);
  return stdout ?? '';
}

function shouldUseSrvFallback(mongoUri, error) {
  if (!mongoUri?.startsWith('mongodb+srv://')) {
    return false;
  }

  const details = `${error?.code ?? ''} ${error?.message ?? ''}`;
  return /queryTxt|querySrv|ESERVFAIL|ENOTFOUND|ENODATA/i.test(details);
}

async function normalizeMongoUri(mongoUri, execFileFn = execFileAsync) {
  if (!mongoUri?.startsWith('mongodb+srv://')) {
    return mongoUri;
  }

  const parsed = new URL(mongoUri);
  const srvOutput = await lookupDnsRecord(
    'SRV',
    `_mongodb._tcp.${parsed.hostname}`,
    execFileFn
  );

  let txtOutput = '';

  try {
    txtOutput = await lookupDnsRecord('TXT', parsed.hostname, execFileFn);
  } catch {
    txtOutput = '';
  }

  const hosts = parseSrvHosts(srvOutput);

  if (hosts.length === 0) {
    throw new Error(`Could not resolve SRV hosts for ${parsed.hostname}`);
  }

  const params = new URLSearchParams();
  const txtOptions = parseTxtOptions(txtOutput);

  if (txtOptions) {
    for (const [key, value] of new URLSearchParams(txtOptions)) {
      params.set(key, value);
    }
  }

  for (const [key, value] of parsed.searchParams) {
    params.set(key, value);
  }

  if (!params.has('tls')) {
    params.set('tls', 'true');
  }

  const auth = parsed.username
    ? `${encodeURIComponent(decodeURIComponent(parsed.username))}:${encodeURIComponent(decodeURIComponent(parsed.password))}@`
    : '';
  const pathname = parsed.pathname === '/' ? '' : parsed.pathname;

  return `mongodb://${auth}${hosts.join(',')}${pathname}?${params.toString()}`;
}

function createDbClientManager({
  mongoUri = process.env.MONGO_URI,
  dbName = DEFAULT_DB_NAME,
  collectionName = DEFAULT_COLLECTION_NAME,
  globalStore = globalThis,
  MongoClientClass = MongoClient,
  resolveMongoUri = normalizeMongoUri,
  log = console.log,
} = {}) {
  let client = globalStore[CLIENT_KEY] ?? null;
  let clientPromise = globalStore[CLIENT_PROMISE_KEY] ?? null;

  function resetCache() {
    client = null;
    clientPromise = null;
    globalStore[CLIENT_KEY] = null;
    globalStore[CLIENT_PROMISE_KEY] = null;
  }

  async function ensureIndexes(connectedClient) {
    await connectedClient
      .db(dbName)
      .collection(collectionName)
      .createIndex({ name: 1 }, { unique: true });
  }

  async function createConnectedClient(uri) {
    const connectWithUri = async (resolvedUri) => {
      client = new MongoClientClass(resolvedUri);
      globalStore[CLIENT_KEY] = client;

      const connectedClient = await client.connect();
      await ensureIndexes(connectedClient);
      log('MongoDB connected and index ensured');
      return connectedClient;
    };

    try {
      return await connectWithUri(uri);
    } catch (error) {
      if (!shouldUseSrvFallback(uri, error)) {
        throw error;
      }

      const fallbackUri = await resolveMongoUri(uri);

      if (!fallbackUri || fallbackUri === uri) {
        throw error;
      }

      return connectWithUri(fallbackUri);
    }
  }

  async function connectDB() {
    if (client && !clientPromise) {
      clientPromise = Promise.resolve(client);
      globalStore[CLIENT_PROMISE_KEY] = clientPromise;
    }

    if (!clientPromise) {
      if (!mongoUri) {
        throw new Error('MONGO_URI is not defined in environment variables');
      }

      clientPromise = createConnectedClient(mongoUri).catch((error) => {
        resetCache();
        throw error;
      });
      globalStore[CLIENT_PROMISE_KEY] = clientPromise;
    }

    client = await clientPromise;
    return client;
  }

  async function getCollection() {
    const connectedClient = await connectDB();
    return connectedClient.db(dbName).collection(collectionName);
  }

  return { connectDB, getCollection };
}

const { connectDB, getCollection } = createDbClientManager();

export {
  connectDB,
  createDbClientManager,
  getCollection,
  normalizeMongoUri,
  parseSrvHosts,
  parseTxtOptions,
};

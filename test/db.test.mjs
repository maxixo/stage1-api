import assert from 'node:assert/strict';
import test from 'node:test';
import { MongoClient } from 'mongodb';
import {
  createDbClientManager,
  normalizeMongoUri,
  parseSrvHosts,
  parseTxtOptions,
} from '../lib/db.js';

function createFakeMongoClientClass({ failConnect } = {}) {
  const instances = [];

  class FakeMongoClient {
    constructor(uri) {
      this.uri = uri;
      this.indexCalls = [];
      instances.push(this);
    }

    async connect() {
      if (failConnect) {
        await failConnect(this);
      }

      return this;
    }

    db(dbName) {
      return {
        collection: (collectionName) => ({
          dbName,
          collectionName,
          createIndex: async (keys, options) => {
            this.indexCalls.push({ dbName, collectionName, keys, options });
            return 'name_1';
          },
        }),
      };
    }
  }

  FakeMongoClient.instances = instances;
  return FakeMongoClient;
}

test('parse helpers extract SRV hosts and TXT options', () => {
  const srvOutput = `
_mongodb._tcp.cluster0.example.mongodb.net SRV service location:
      svr hostname   = ac-1.example.mongodb.net
      svr hostname   = ac-2.example.mongodb.net
      svr hostname   = ac-3.example.mongodb.net
`;
  const txtOutput = `
cluster0.example.mongodb.net\ttext =
        "authSource=admin&replicaSet=atlas-shard-0"
`;

  assert.deepEqual(parseSrvHosts(srvOutput), [
    'ac-1.example.mongodb.net',
    'ac-2.example.mongodb.net',
    'ac-3.example.mongodb.net',
  ]);
  assert.equal(parseTxtOptions(txtOutput), 'authSource=admin&replicaSet=atlas-shard-0');
});

test('normalizeMongoUri converts mongodb+srv URIs into standard URIs', async () => {
  const execFileFn = async (_command, args) => {
    if (args[0] === '-type=SRV') {
      return {
        stdout: `
_mongodb._tcp.cluster0.example.mongodb.net SRV service location:
      svr hostname   = ac-1.example.mongodb.net
      svr hostname   = ac-2.example.mongodb.net
      svr hostname   = ac-3.example.mongodb.net
`,
      };
    }

    return {
      stdout: `
cluster0.example.mongodb.net\ttext =
        "authSource=admin&replicaSet=atlas-shard-0"
`,
    };
  };

  const normalized = await normalizeMongoUri(
    'mongodb+srv://user:pass@cluster0.example.mongodb.net/sample_db?retryWrites=true&w=majority',
    execFileFn
  );

  assert.equal(
    normalized,
    'mongodb://user:pass@ac-1.example.mongodb.net,ac-2.example.mongodb.net,ac-3.example.mongodb.net/sample_db?authSource=admin&replicaSet=atlas-shard-0&retryWrites=true&w=majority&tls=true'
  );
});

test('connectDB reuses a cached client and ensures indexes once', async () => {
  const FakeMongoClient = createFakeMongoClientClass();
  const manager = createDbClientManager({
    mongoUri: 'mongodb://localhost:27017',
    globalStore: {},
    MongoClientClass: FakeMongoClient,
    log: () => {},
  });

  const [firstClient, secondClient] = await Promise.all([
    manager.connectDB(),
    manager.connectDB(),
  ]);

  assert.strictEqual(firstClient, secondClient);
  assert.equal(FakeMongoClient.instances.length, 1);
  assert.deepEqual(FakeMongoClient.instances[0].indexCalls, [
    {
      dbName: 'profile_db',
      collectionName: 'profiles',
      keys: { name: 1 },
      options: { unique: true },
    },
  ]);
});

test('getCollection returns the configured collection', async () => {
  const FakeMongoClient = createFakeMongoClientClass();
  const manager = createDbClientManager({
    mongoUri: 'mongodb://localhost:27017',
    globalStore: {},
    MongoClientClass: FakeMongoClient,
    log: () => {},
  });

  const collection = await manager.getCollection();

  assert.equal(collection.dbName, 'profile_db');
  assert.equal(collection.collectionName, 'profiles');
});

test('connectDB falls back to a normalized URI when SRV DNS lookup fails', async () => {
  const originalUri = 'mongodb+srv://cluster0.example.mongodb.net/sample_db';
  const fallbackUri =
    'mongodb://ac-1.example.mongodb.net,ac-2.example.mongodb.net/sample_db?tls=true';
  const FakeMongoClient = createFakeMongoClientClass({
    failConnect: async (client) => {
      if (client.uri === originalUri) {
        const error = new Error('queryTxt ESERVFAIL cluster0.example.mongodb.net');
        error.code = 'ESERVFAIL';
        throw error;
      }
    },
  });
  const manager = createDbClientManager({
    mongoUri: originalUri,
    globalStore: {},
    MongoClientClass: FakeMongoClient,
    resolveMongoUri: async () => fallbackUri,
    log: () => {},
  });

  const client = await manager.connectDB();

  assert.equal(client.uri, fallbackUri);
  assert.deepEqual(
    FakeMongoClient.instances.map((instance) => instance.uri),
    [originalUri, fallbackUri]
  );
});

test('connectDB resets the cache after a failed attempt', async () => {
  let shouldFail = true;
  const FakeMongoClient = createFakeMongoClientClass({
    failConnect: async () => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error('Temporary network error');
      }
    },
  });
  const manager = createDbClientManager({
    mongoUri: 'mongodb://localhost:27017',
    globalStore: {},
    MongoClientClass: FakeMongoClient,
    log: () => {},
  });

  await assert.rejects(manager.connectDB(), /Temporary network error/);

  const client = await manager.connectDB();

  assert.equal(client.uri, 'mongodb://localhost:27017');
  assert.equal(FakeMongoClient.instances.length, 2);
});

test(
  'connects to the live database when MONGO_URI is configured',
  { skip: !process.env.MONGO_URI || process.env.RUN_LIVE_DB_TEST !== '1' },
  async () => {
    const manager = createDbClientManager({
      mongoUri: process.env.MONGO_URI,
      globalStore: {},
      MongoClientClass: MongoClient,
      log: () => {},
    });

    const client = await manager.connectDB();
    const result = await client.db('admin').command({ ping: 1 });

    assert.equal(result.ok, 1);
    await client.close();
  }
);

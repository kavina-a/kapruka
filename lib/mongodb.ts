import { MongoClient, type MongoClientOptions } from "mongodb";

const uri = process.env.MONGODB_URI ?? "";
const options: MongoClientOptions = {
  maxPoolSize: 5,
  serverSelectionTimeoutMS: 5000,
};

// In development, preserve the connection across HMR reloads.
// In production, the module-level promise is reused across warm invocations.
declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {
  if (!global._mongoClientPromise) {
    const client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  const client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export default clientPromise;

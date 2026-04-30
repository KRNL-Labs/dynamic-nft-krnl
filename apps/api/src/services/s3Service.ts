import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { Readable } from "stream";

const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
const S3_SECRET_KEY = process.env.S3_SECRET_KEY;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_PUBLIC_BASE_URL = process.env.S3_PUBLIC_BASE_URL;

const s3Client = new S3Client({
  region: "us-east-1",
  endpoint: S3_ENDPOINT,
  forcePathStyle: true,
  credentials: S3_ACCESS_KEY && S3_SECRET_KEY
    ? { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY }
    : undefined
});

let bucketReady = false;
let bucketEnsurePromise: Promise<void> | null = null;
let bucketPolicyReady = false;
let bucketPolicyPromise: Promise<void> | null = null;

const ensureBucketPublicReadPolicy = async (): Promise<void> => {
  if (bucketPolicyReady) return;
  if (bucketPolicyPromise) {
    await bucketPolicyPromise;
    return;
  }

  bucketPolicyPromise = (async () => {
    if (!S3_BUCKET) {
      throw new Error("S3_BUCKET must be set");
    }
    const policy = {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "PublicReadGetObject",
          Effect: "Allow",
          Principal: "*",
          Action: ["s3:GetObject"],
          Resource: [`arn:aws:s3:::${S3_BUCKET}/*`]
        }
      ]
    };

    await s3Client.send(
      new PutBucketPolicyCommand({
        Bucket: S3_BUCKET,
        Policy: JSON.stringify(policy)
      })
    );
    bucketPolicyReady = true;
  })();

  await bucketPolicyPromise;
};

const ensureBucket = async (): Promise<void> => {
  if (bucketReady) return;
  if (bucketEnsurePromise) {
    await bucketEnsurePromise;
    return;
  }

  bucketEnsurePromise = (async () => {
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
      bucketReady = true;
    } catch (error: any) {
      const status = error?.$metadata?.httpStatusCode;
      const code = error?.Code || error?.code || error?.name;
      if (status === 404 || code === "NotFound" || code === "NoSuchBucket") {
        await s3Client.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
        bucketReady = true;
      } else {
        throw error;
      }
    }

    await ensureBucketPublicReadPolicy();
  })();

  await bucketEnsurePromise;
};

export const uploadObject = async (args: {
  key: string;
  body: Buffer;
  contentType?: string;
}): Promise<void> => {
  if (!S3_BUCKET) {
    throw new Error("S3_BUCKET must be set");
  }
  if (!S3_ENDPOINT) {
    throw new Error("S3_ENDPOINT must be set");
  }
  if (!S3_ACCESS_KEY || !S3_SECRET_KEY) {
    throw new Error("S3_ACCESS_KEY and S3_SECRET_KEY must be set");
  }

  await ensureBucket();
  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: args.key,
      Body: args.body,
      ContentType: args.contentType
    })
  );
};

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

export const objectExists = async (key: string): Promise<boolean> => {
  if (!S3_BUCKET) {
    throw new Error("S3_BUCKET must be set");
  }
  await ensureBucket();
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: S3_BUCKET,
        Key: key
      })
    );
    return true;
  } catch (error: any) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 404 || error?.name === "NotFound") {
      return false;
    }
    throw error;
  }
};

export const getObjectBuffer = async (key: string): Promise<Buffer> => {
  if (!S3_BUCKET) {
    throw new Error("S3_BUCKET must be set");
  }
  await ensureBucket();
  const result = await s3Client.send(
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key
    })
  );
  const body = result.Body;
  if (!body || !(body instanceof Readable)) {
    throw new Error("S3 object body is not readable");
  }
  return streamToBuffer(body);
};

export const getPublicUrl = (key: string): string => {
  if (!S3_PUBLIC_BASE_URL) {
    throw new Error("S3_PUBLIC_BASE_URL must be set");
  }
  const base = S3_PUBLIC_BASE_URL.replace(/\/+$/, "");
  const cleanKey = key.replace(/^\/+/, "");
  return `${base}/${cleanKey}`;
};

// Applies the runtime password to the restricted app role and creates the private bucket.
import "dotenv/config";
import { Client } from "pg";
import { CreateBucketCommand, PutPublicAccessBlockCommand, S3Client } from "@aws-sdk/client-s3";

async function main() {
  const appUrl = new URL(process.env.APP_DATABASE_URL!);
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  const password = decodeURIComponent(appUrl.password).replace(/'/g, "''");
  await pg.query(`ALTER ROLE dar_app PASSWORD '${password}'`);
  await pg.end();
  console.log("dar_app password applied");

  if (process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY_ID) {
    const s3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
    });
    const Bucket = process.env.S3_BUCKET!;
    try {
      await s3.send(new CreateBucketCommand({ Bucket }));
      console.log(`bucket ${Bucket} created (private by default)`);
    } catch (e: unknown) {
      if ((e as { name?: string }).name !== "BucketAlreadyOwnedByYou") throw e;
    }
    await s3
      .send(new PutPublicAccessBlockCommand({ Bucket, PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true } }))
      .catch(() => console.log("public access block not supported by this provider; bucket has no public policy"));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

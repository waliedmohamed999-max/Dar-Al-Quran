import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AppError } from "./errors";
import { integrations } from "./env";

let client: S3Client | undefined;
function s3() {
  if (!integrations.storage) throw new AppError(503, "storage_not_configured");
  return (client ??= new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
  }));
}
const Bucket = () => process.env.S3_BUCKET!;

export const putObject = (key: string, body: Buffer, mime: string) =>
  s3().send(new PutObjectCommand({ Bucket: Bucket(), Key: key, Body: body, ContentType: mime }));

/** Callers must authorize first. URLs live for five minutes and are never stored. */
export const signedGetUrl = (key: string) => getSignedUrl(s3(), new GetObjectCommand({ Bucket: Bucket(), Key: key }), { expiresIn: 300 });

export const deleteObject = (key: string) => s3().send(new DeleteObjectCommand({ Bucket: Bucket(), Key: key }));

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/** Detects the real type from magic bytes. The client's declared MIME type is not trusted. */
export function sniffAudio(b: Buffer): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "audio/webm";
  if (b.toString("ascii", 0, 4) === "OggS") return "audio/ogg";
  if (b.toString("ascii", 0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  if (b.toString("ascii", 4, 8) === "ftyp") return "audio/mp4";
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WAVE") return "audio/wav";
  return null;
}

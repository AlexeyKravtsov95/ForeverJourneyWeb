// Uploads the production build (dist/) to a VK Cloud Object Storage bucket.
// Invoked by .github/workflows/deploy.yml; can also run locally for a manual
// rollback — see docs/DEPLOYMENT.md.
//
// Environment:
//   S3_ENDPOINT          required, e.g. https://hb.ru-msk.vkcloud-storage.ru
//   S3_BUCKET            required, e.g. foreverjourney-web
//   S3_ACCESS_KEY_ID     required for a real run (GitHub secret VK_S3_ACCESS_KEY_ID)
//   S3_SECRET_ACCESS_KEY required for a real run (GitHub secret VK_S3_SECRET_ACCESS_KEY)
//   S3_REGION            optional, default ru-msk (signature region, any value works for VK Cloud)
//   DIST_DIR             optional, default dist
//   DRY_RUN              optional, "true" prints the upload plan and exits without uploading
//   S3_PUBLIC_READ       optional, default true — publishes objects with the public-read ACL
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  isValidBucketName,
  planUploads,
  validateEndpoint,
} from './deploy-s3-lib.mjs'

const {
  S3_ENDPOINT,
  S3_BUCKET,
  S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY,
  S3_REGION = 'ru-msk',
  DIST_DIR = 'dist',
  DRY_RUN,
  S3_PUBLIC_READ = 'true',
} = process.env

function fail(message) {
  console.error(`deploy-s3: ${message}`)
  process.exit(1)
}

if (!S3_ENDPOINT) fail('S3_ENDPOINT is not set')
if (!S3_BUCKET) fail('S3_BUCKET is not set')

const dryRun = DRY_RUN === 'true'
const endpoint = validateEndpoint(S3_ENDPOINT, { network: !dryRun })
if (!endpoint.ok) fail(endpoint.error)
if (!isValidBucketName(S3_BUCKET)) fail(`S3_BUCKET is not a valid bucket name: ${S3_BUCKET}`)

let plan
try {
  plan = planUploads(DIST_DIR)
} catch (error) {
  fail(error.message)
}
if (plan.length === 0) fail(`no files found in ${DIST_DIR}`)

console.log(`bucket:   s3://${S3_BUCKET}`)
console.log(`endpoint: ${endpoint.url.origin}`)
console.log(`source:   ${DIST_DIR}/ (${plan.length} files)`)
for (const item of plan) {
  console.log(
    `  ${item.key}  [${item.contentType}]  ${item.cacheControl}  (${item.size} bytes)`,
  )
}

if (dryRun) {
  console.log('\ndry run: nothing was uploaded.')
  process.exit(0)
}

if (!S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
  fail(
    'S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are not set ' +
      '(GitHub secrets VK_S3_ACCESS_KEY_ID / VK_S3_SECRET_ACCESS_KEY)',
  )
}

const { S3Client, PutObjectCommand, ListObjectsV2Command } = await import(
  '@aws-sdk/client-s3'
)

const client = new S3Client({
  region: S3_REGION,
  endpoint: endpoint.url.origin,
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
})

const acl = S3_PUBLIC_READ === 'false' ? undefined : 'public-read'

for (const item of plan) {
  const body = await readFile(join(DIST_DIR, item.key))
  await client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: item.key,
      Body: body,
      ContentType: item.contentType,
      CacheControl: item.cacheControl,
      ACL: acl,
    }),
  )
  console.log(`uploaded: ${item.key}`)
}

// Verification: every planned key must now exist in the bucket. Uploads to a
// wrong bucket or a silently failing provider fail the deploy here.
const remoteKeys = new Set()
let continuationToken
do {
  const listing = await client.send(
    new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      ContinuationToken: continuationToken,
    }),
  )
  for (const object of listing.Contents ?? []) remoteKeys.add(object.Key)
  continuationToken = listing.IsTruncated ? listing.NextContinuationToken : undefined
} while (continuationToken)

const missing = plan.filter((item) => !remoteKeys.has(item.key))
if (missing.length > 0) {
  fail(`verification failed, missing keys: ${missing.map((m) => m.key).join(', ')}`)
}

const host = endpoint.url.hostname
console.log(`\ndone: ${plan.length} objects verified in s3://${S3_BUCKET}.`)
console.log(`object endpoint:   https://${S3_BUCKET}.${host}/index.html`)
console.log(`website endpoint:  https://${S3_BUCKET}.hb-website.${host}/`)
console.log(
  'note: publish the CDN domain over HTTPS as the site URL, not a bare endpoint above.',
)

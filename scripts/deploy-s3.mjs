// Uploads the production build (dist/) to the production VK Cloud Object
// Storage bucket. Invoked by .github/workflows/deploy.yml; can also run
// locally for a manual rollback — see docs/DEPLOYMENT.md.
//
// The publish target is fixed in deploy-s3-lib.mjs (PRODUCTION_TARGET) and
// validated before anything else: signed S3 requests never go to another
// endpoint or bucket, whatever the environment says. Public reading is
// granted by the bucket policy — objects are uploaded without any ACL.
//
// Environment:
//   S3_ENDPOINT          required, must equal PRODUCTION_TARGET.endpoint
//   S3_BUCKET            required, must equal PRODUCTION_TARGET.bucket
//   S3_ACCESS_KEY_ID     required for a real run (GitHub secret VK_S3_ACCESS_KEY_ID)
//   S3_SECRET_ACCESS_KEY required for a real run (GitHub secret VK_S3_SECRET_ACCESS_KEY)
//   S3_REGION            optional, default ru-msk (signature region)
//   DIST_DIR             optional, default dist
//   DRY_RUN              optional, "true" prints the upload plan and exits without uploading
import {
  PRODUCTION_TARGET,
  buildPutObjectInput,
  isAllowedTarget,
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
if (!isAllowedTarget(S3_BUCKET, S3_ENDPOINT)) {
  fail(
    `refusing to deploy outside the production target: ` +
      `allowed bucket "${PRODUCTION_TARGET.bucket}" and endpoint "${PRODUCTION_TARGET.endpoint}", ` +
      `got bucket "${S3_BUCKET}" and endpoint "${S3_ENDPOINT}"`,
  )
}

let plan
try {
  plan = planUploads(DIST_DIR)
} catch (error) {
  fail(error.message)
}
if (plan.length === 0) fail(`no files found in ${DIST_DIR}`)

console.log(`bucket:          s3://${S3_BUCKET}`)
console.log(`S3 endpoint:     ${endpoint.url.origin}`)
console.log(`public URL:      ${PRODUCTION_TARGET.publicUrl}`)
console.log(`source:          ${DIST_DIR}/ (${plan.length} files)`)
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

for (const item of plan) {
  await client.send(
    new PutObjectCommand(await buildPutObjectInput(S3_BUCKET, DIST_DIR, item)),
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

console.log(`\ndone: ${plan.length} objects uploaded and verified in s3://${S3_BUCKET}.`)
console.log(`S3 endpoint:         ${endpoint.url.origin}`)
console.log(`expected public URL: ${PRODUCTION_TARGET.publicUrl}`)
console.log(
  'the public URL works only once the CDN and HTTPS are configured and verified — see docs/DEPLOYMENT.md, section 5.',
)

'use strict'

/*
|--------------------------------------------------------------------------
| File Storage
|--------------------------------------------------------------------------
|
| Cloudflare R2, reached through its S3 API. Buckets are private: the app
| uploads and views files through short-lived signed links from this server.
| Each environment has its own bucket and its own access key.
|
*/

module.exports = {
  endpoint        : process.env.R2_ENDPOINT,
  accessKeyId     : process.env.R2_ACCESS_KEY_ID,
  secretAccessKey : process.env.R2_SECRET_ACCESS_KEY,
  bucket          : process.env.R2_BUCKET,
};

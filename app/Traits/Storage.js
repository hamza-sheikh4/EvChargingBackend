'use strict'

const crypto = require('crypto');
const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const storage = require('../../config/storage');

const UPLOAD_SECONDS = 300;
const VIEW_SECONDS = 3600;
const CONTENT_TYPE = 'image/jpeg';

const client = new S3Client({
  region: 'auto',
  endpoint: storage.endpoint,
  credentials: { accessKeyId: storage.accessKeyId, secretAccessKey: storage.secretAccessKey },
});

let o = {}

/** Where a user's file of one kind lives. Random names, never personal details (vision rule 9). */
o.keyFor = (kind, userId) => `${kind}/${userId}/${crypto.randomUUID()}.jpg`;

/** True when the key is one this user was given for this kind, so nobody can claim another user's file. */
o.ownsKey = (key, kind, userId) => typeof key === 'string' && key.startsWith(`${kind}/${userId}/`);

/** A link that allows one JPEG upload to this key for a few minutes. */
o.uploadUrl = (key) =>
  getSignedUrl(client, new PutObjectCommand({ Bucket: storage.bucket, Key: key, ContentType: CONTENT_TYPE }), {
    expiresIn: UPLOAD_SECONDS,
  });

/** A link to view a private file for an hour, for the app to show it. */
o.viewUrl = (key) => getSignedUrl(client, new GetObjectCommand({ Bucket: storage.bucket, Key: key }), { expiresIn: VIEW_SECONDS });

/** True once the file has actually been uploaded. */
o.exists = async (key) => {
  try {
    await client.send(new HeadObjectCommand({ Bucket: storage.bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
};

module.exports = o;

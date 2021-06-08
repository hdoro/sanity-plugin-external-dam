const AWS = require("aws-sdk");

// === CONFIG ===
// 🚨 Don't forget to configure CORS in AWS' API Gateway configuration
const SECRET = "SECRET_CODE";
const BUCKET = "YOUR_BUCKET";
const REGION = "YOUR_REGION";

const s3 = new AWS.S3({
  region: REGION,
});

function getRandomKey() {
  return Math.random().toFixed(10).replace("0.", "");
}

const SHARED_HEADERS = {
  "Content-Type": "application/json",
};

exports.handler = async (event, _context, callback) => {

  const method = event.httpMethod || event?.requestContext?.httpMethod || event?.requestContext?.http?.method
  if (method?.toUpperCase() === "OPTIONS") {
    return callback(null, {
      statusCode: 200,
      body: JSON.stringify(event),
      headers: SHARED_HEADERS,
    });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch (error) {
    return callback(null, {
      statusCode: 400,
      body: JSON.stringify({
        message: "Missing body",
        ...event
      }),
      headers: SHARED_HEADERS,
    });
  }

  const { contentType, fileName, secret } = body || {};

  // REMOVE IF NOT USING SECRETS
  if (secret !== SECRET) {
    return callback(null, {
      statusCode: 401,
      body: JSON.stringify({
        message: "Unauthorized",
        ...event
      }),
      headers: SHARED_HEADERS,
    });
  }
  s3.createPresignedPost(
    {
      Fields: {
        key:
          fileName ||
          `${getRandomKey()}-${getRandomKey()}-${
            contentType || "unknown-type"
          }`,
        acl: 'public-read',
      },
      Conditions: contentType
        ? [["eq", "$Content-Type", contentType]]
        : [],
      Expires: 30,
      Bucket: BUCKET,
      ContentType: contentType
    },
    (error, signed) => {
      if (!!error) {
        return callback(error, {
          statusCode: 500,
          body: JSON.stringify(error),
          headers: SHARED_HEADERS,
        });
      }
      return callback(null, {
        statusCode: 200,
        body: JSON.stringify(signed),
        headers: SHARED_HEADERS,
      });
    }
  );
};

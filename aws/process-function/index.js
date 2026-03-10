const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { randomUUID } = require("crypto");

// Config LocalStack
const clientConfig = {
  region: "eu-west-1",
  endpoint: "http://host.docker.internal:4566",
  forcePathStyle: true,
  credentials: {
    accessKeyId: "test",
    secretAccessKey: "test",
  },
};

const s3Client = new S3Client(clientConfig);
const dynamoClient = new DynamoDBClient(clientConfig);

const TABLE_NAME = "tp-results";

// Helper pour lire un stream en string
const streamToString = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    stream.on("error", reject);
  });

exports.handler = async (event) => {
  console.log("📦 Lambda process déclenchée par S3");
  console.log("Event S3 :", JSON.stringify(event, null, 2));

  // Récupérer les infos du fichier depuis l'event S3
  const record = event.Records?.[0];
  if (!record) {
    console.error("❌ Aucun record S3 dans l'event");
    return { statusCode: 400, body: "No S3 record found" };
  }

  const bucket = record.s3.bucket.name;
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
  const sizeBytes = record.s3.object.size;

  console.log(`   Bucket : ${bucket}`);
  console.log(`   Clé    : ${key}`);
  console.log(`   Taille : ${sizeBytes} octets`);

  try {
    // Lire le contenu de l'objet S3
    const getCommand = new GetObjectCommand({ Bucket: bucket, Key: key });
    const s3Response = await s3Client.send(getCommand);
    const content = await streamToString(s3Response.Body);
    const excerpt = content.substring(0, 100);

    // Écrire dans DynamoDB
    const putCommand = new PutItemCommand({
      TableName: TABLE_NAME,
      Item: {
        id: { S: randomUUID() },
        fileName: { S: key },
        bucket: { S: bucket },
        processedAt: { S: new Date().toISOString() },
        sizeBytes: { N: String(sizeBytes) },
        excerpt: { S: excerpt },
      },
    });

    await dynamoClient.send(putCommand);
    console.log(`✅ Enregistrement DynamoDB créé pour : ${key}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Fichier '${key}' traité et enregistré dans DynamoDB.` }),
    };
  } catch (err) {
    console.error("❌ Erreur processing :", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

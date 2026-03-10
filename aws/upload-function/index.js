const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

// Configuration pour LocalStack
const s3Client = new S3Client({
  region: "eu-west-1",
  endpoint: "http://localhost:4566",
  forcePathStyle: true, // Requis pour LocalStack
  credentials: {
    accessKeyId: "test",
    secretAccessKey: "test",
  },
});

const BUCKET_NAME = "mon-bucket-tp";

exports.handler = async (event) => {
  console.log("📥 Lambda upload déclenchée");
  console.log("Event reçu :", JSON.stringify(event, null, 2));

  const name = event.name || `file-${Date.now()}.txt`;
  const content = event.content || "Contenu par défaut";

  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: name,
      Body: content,
      ContentType: "text/plain",
    });

    await s3Client.send(command);
    console.log(`✅ Fichier '${name}' uploadé dans S3 (LocalStack)`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Fichier '${name}' uploadé avec succès dans S3.`,
        bucket: BUCKET_NAME,
        key: name,
        size: Buffer.byteLength(content),
      }),
    };
  } catch (err) {
    console.error("❌ Erreur upload S3 :", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

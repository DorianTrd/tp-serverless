const { BlobServiceClient } = require("@azure/storage-blob");

const AZURITE_CONNECTION_STRING =
  "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OPxqDhKDOWMNd9aZ1MroKgMbFhCQRABEhChVIeIvS5rMj17b2eqzaA==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;";
const CONTAINER_NAME = "tp-container";

module.exports = async function (context, req) {
  context.log("📥 HTTP Trigger déclenché");

  const name = req.body?.name || `file-${Date.now()}.txt`;
  const content = req.body?.content || "Contenu par défaut";

  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      AZURITE_CONNECTION_STRING
    );

    // Créer le container s'il n'existe pas
    const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
    await containerClient.createIfNotExists();

    // Upload du blob
    const blockBlobClient = containerClient.getBlockBlobClient(name);
    const buffer = Buffer.from(content, "utf-8");
    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: { blobContentType: "text/plain" },
    });

    context.log(`✅ Blob créé : ${name}`);

    context.res = {
      status: 200,
      body: {
        message: `Fichier '${name}' uploadé avec succès dans Blob Storage.`,
        blobName: name,
        size: buffer.length,
      },
    };
  } catch (err) {
    context.log.error("❌ Erreur upload blob :", err.message);
    context.res = {
      status: 500,
      body: { error: err.message },
    };
  }
};

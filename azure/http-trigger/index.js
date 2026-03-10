const { BlobServiceClient } = require("@azure/storage-blob");

const AZURITE_CONNECTION_STRING = "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KwVeQ/2mfAQ==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1";

module.exports = async function (context, req) {
  context.log("HTTP Trigger declenche");
  const name = req.body && req.body.name;
  const content = req.body && req.body.content;

  if (!name || !content) {
    context.res = { status: 400, body: { error: "name et content requis" } };
    return;
  }

  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(
            "UseDevelopmentStorage=true"
        ); const containerClient = blobServiceClient.getContainerClient("uploads");
    await containerClient.createIfNotExists();
    const blobName = Date.now() + "-" + name;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const data = Buffer.from(content, "utf-8");
    await blockBlobClient.upload(data, data.length);
    context.log("Blob uploade : " + blobName);
    context.res = { status: 200, body: { message: "OK", blobName } };
  } catch (err) {
    context.log.error("Erreur : " + err.message);
    context.res = { status: 500, body: { error: err.message } };
  }
};
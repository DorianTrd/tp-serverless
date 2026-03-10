const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");

const ACCOUNT_NAME = "devstoreaccount1";
const ACCOUNT_KEY =
  "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OPxqDhKDOWMNd9aZ1MroKgMbFhCQRABEhChVIeIvS5rMj17b2eqzaA==";
const TABLE_NAME = "tpresults";
const TABLE_URL = `http://127.0.0.1:10002/${ACCOUNT_NAME}`;

module.exports = async function (context, myBlob) {
  context.log("📦 Blob Trigger déclenché");
  context.log(`   Nom du blob : ${context.bindingData.name}`);
  context.log(`   Taille      : ${myBlob.length} octets`);

  const blobName = context.bindingData.name;
  const blobContent = myBlob.toString("utf-8");
  const processedAt = new Date().toISOString();
  const excerpt = blobContent.substring(0, 100);

  try {
    const credential = new AzureNamedKeyCredential(ACCOUNT_NAME, ACCOUNT_KEY);
    const tableClient = new TableClient(TABLE_URL, TABLE_NAME, credential);

    // Créer la table si elle n'existe pas
    try {
      await tableClient.createTable();
    } catch (e) {
      if (!e.message.includes("TableAlreadyExists")) throw e;
    }

    // Écrire l'enregistrement
    const entity = {
      partitionKey: "blobs",
      rowKey: `${Date.now()}-${blobName.replace(/[^a-zA-Z0-9]/g, "_")}`,
      fileName: blobName,
      processedAt,
      sizeBytes: myBlob.length,
      excerpt,
    };

    await tableClient.createEntity(entity);
    context.log(`✅ Enregistrement écrit dans Table Storage pour : ${blobName}`);
  } catch (err) {
    context.log.error("❌ Erreur Table Storage :", err.message);
    throw err;
  }
};

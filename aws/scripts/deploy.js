const { S3Client, CreateBucketCommand, PutBucketNotificationConfigurationCommand } = require("@aws-sdk/client-s3");
const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = require("@aws-sdk/client-dynamodb");
const { LambdaClient, CreateFunctionCommand, GetFunctionCommand, DeleteFunctionCommand, AddPermissionCommand } = require("@aws-sdk/client-lambda");
const AdmZip = require("adm-zip");
const fs = require("fs");
const path = require("path");

const ENDPOINT = "http://host.docker.internal:4566";
const REGION = "eu-west-1";
const ACCOUNT_ID = "000000000000";
const BUCKET_NAME = "mon-bucket-tp";
const TABLE_NAME = "tp-results";

const config = {
  region: REGION,
  endpoint: ENDPOINT,
  forcePathStyle: true,
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
};

const s3 = new S3Client(config);
const dynamo = new DynamoDBClient(config);
const lambda = new LambdaClient(config);

function log(msg) { console.log("\n" + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function info(msg) { console.log("  ℹ️  " + msg); }

function zipFolder(folderPath) {
  const zip = new AdmZip();
  const files = fs.readdirSync(folderPath);
  files.forEach((file) => {
    const full = path.join(folderPath, file);
    if (fs.statSync(full).isFile()) zip.addLocalFile(full);
  });
  return zip.toBuffer();
}

async function createBucket() {
  log("📦 Création du bucket S3...");
  try {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
    ok("Bucket '" + BUCKET_NAME + "' créé");
  } catch (e) {
    if (e.name === "BucketAlreadyOwnedByYou" || e.name === "BucketAlreadyExists") {
      info("Bucket existe déjà");
    } else throw e;
  }
}

async function createDynamoTable() {
  log("🗄️  Création de la table DynamoDB...");
  try {
    await dynamo.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    info("Table existe déjà");
  } catch {
    await dynamo.send(new CreateTableCommand({
      TableName: TABLE_NAME,
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    }));
    ok("Table '" + TABLE_NAME + "' créée");
  }
}

async function deployLambda(functionName, functionDir) {
  log("🚀 Déploiement de '" + functionName + "'...");

  // Copier node_modules dans le dossier fonction pour le zip
  const rootNodeModules = path.join(__dirname, "..", "node_modules");
  const fnNodeModules = path.join(functionDir, "node_modules");
  if (!fs.existsSync(fnNodeModules)) {
    fs.symlinkSync(rootNodeModules, fnNodeModules, "junction");
  }

  const zipBuffer = zipFolder(functionDir);

  try {
    await lambda.send(new GetFunctionCommand({ FunctionName: functionName }));
    await lambda.send(new DeleteFunctionCommand({ FunctionName: functionName }));
    info("Ancienne version supprimée");
  } catch {}

  await lambda.send(new CreateFunctionCommand({
    FunctionName: functionName,
    Runtime: "nodejs18.x",
    Role: "arn:aws:iam::" + ACCOUNT_ID + ":role/lambda-role",
    Handler: "index.handler",
    Code: { ZipFile: zipBuffer },
    Environment: {
      Variables: { BUCKET_NAME, TABLE_NAME },
    },
    Timeout: 30,
  }));

  ok("Lambda '" + functionName + "' déployée");
  return "arn:aws:lambda:" + REGION + ":" + ACCOUNT_ID + ":function:" + functionName;
}

async function setupS3Trigger(lambdaArn) {
  log("🔗 Configuration du trigger S3...");
  try {
    await lambda.send(new AddPermissionCommand({
      FunctionName: "process-function",
      StatementId: "s3-trigger-" + Date.now(),
      Action: "lambda:InvokeFunction",
      Principal: "s3.amazonaws.com",
      SourceArn: "arn:aws:s3:::" + BUCKET_NAME,
    }));
    ok("Permission accordée");
  } catch (e) {
    info("Permission : " + e.message);
  }

  await s3.send(new PutBucketNotificationConfigurationCommand({
    Bucket: BUCKET_NAME,
    NotificationConfiguration: {
      LambdaFunctionConfigurations: [{
        LambdaFunctionArn: lambdaArn,
        Events: ["s3:ObjectCreated:*"],
      }],
    },
  }));
  ok("Trigger S3 → process-function configuré");
}

async function main() {
  console.log("=".repeat(50));
  console.log("  🛠️  Déploiement LocalStack - TP Serverless AWS");
  console.log("=".repeat(50));

  try {
    await createBucket();
    await createDynamoTable();

    const functionsDir = path.join(__dirname, "..");
    await deployLambda("upload-function", path.join(functionsDir, "upload-function"));
    const processArn = await deployLambda("process-function", path.join(functionsDir, "process-function"));
    await setupS3Trigger(processArn);

    console.log("\n" + "=".repeat(50));
    console.log("  ✅ Déploiement terminé !");
    console.log("=".repeat(50));
    console.log("\n🧪 Pour tester :");
    console.log('  aws --endpoint-url=http://localhost:4566 lambda invoke --function-name upload-function --payload \'{"name":"test.txt","content":"Hello serverless"}\' output.json');
  } catch (error) {
    console.error("\n❌ Erreur :", error.message);
    process.exit(1);
  }
}

main();
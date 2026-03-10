#!/bin/bash

# ============================================================
# Script de setup AWS LocalStack - TP Serverless
# ============================================================

ENDPOINT="http://host.docker.internal:4566"
REGION="eu-west-1"
ACCOUNT_ID="000000000000"
BUCKET_NAME="mon-bucket-tp"
TABLE_NAME="tp-results"

echo "🚀 Démarrage du setup LocalStack..."

# Vérifier que LocalStack est up
echo "⏳ Attente de LocalStack..."
until aws --endpoint-url=$ENDPOINT s3 ls > /dev/null 2>&1; do
  sleep 2
  echo "   ... en attente"
done
echo "✅ LocalStack opérationnel"

# ---- S3 ----
echo ""
echo "📦 Création du bucket S3..."
aws --endpoint-url=$ENDPOINT s3 mb s3://$BUCKET_NAME --region $REGION
echo "✅ Bucket '$BUCKET_NAME' créé"

# ---- DynamoDB ----
echo ""
echo "🗃️  Création de la table DynamoDB..."
aws --endpoint-url=$ENDPOINT dynamodb create-table \
  --table-name $TABLE_NAME \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region $REGION
echo "✅ Table '$TABLE_NAME' créée"

# ---- Lambda upload-function ----
echo ""
echo "📦 Packaging upload-function..."
cd upload-function
npm install --silent
zip -r ../upload-function.zip . > /dev/null
cd ..

echo "🚀 Déploiement de upload-function..."
aws --endpoint-url=$ENDPOINT lambda create-function \
  --function-name upload-function \
  --runtime nodejs18.x \
  --handler index.handler \
  --role arn:aws:iam::$ACCOUNT_ID:role/lambda-role \
  --zip-file fileb://upload-function.zip \
  --region $REGION
echo "✅ upload-function déployée"

# ---- Lambda process-function ----
echo ""
echo "📦 Packaging process-function..."
cd process-function
npm install --silent
zip -r ../process-function.zip . > /dev/null
cd ..

echo "🚀 Déploiement de process-function..."
aws --endpoint-url=$ENDPOINT lambda create-function \
  --function-name process-function \
  --runtime nodejs18.x \
  --handler index.handler \
  --role arn:aws:iam::$ACCOUNT_ID:role/lambda-role \
  --zip-file fileb://process-function.zip \
  --region $REGION
echo "✅ process-function déployée"

# ---- Permissions Lambda ----
echo ""
echo "🔐 Ajout des permissions S3 → Lambda..."
aws --endpoint-url=$ENDPOINT lambda add-permission \
  --function-name process-function \
  --statement-id s3-trigger \
  --action lambda:InvokeFunction \
  --principal s3.amazonaws.com \
  --source-arn arn:aws:s3:::$BUCKET_NAME \
  --region $REGION

# ---- S3 Notification → Lambda ----
echo ""
echo "🔔 Configuration du trigger S3 → process-function..."
aws --endpoint-url=$ENDPOINT s3api put-bucket-notification-configuration \
  --bucket $BUCKET_NAME \
  --notification-configuration '{
    "LambdaFunctionConfigurations": [{
      "LambdaFunctionArn": "arn:aws:lambda:eu-west-1:000000000000:function:process-function",
      "Events": ["s3:ObjectCreated:*"]
    }]
  }'
echo "✅ Trigger S3 configuré"

echo ""
echo "=============================================="
echo "✅ Setup terminé ! Tu peux maintenant tester :"
echo ""
echo "  1. Invoquer upload-function :"
echo "     aws --endpoint-url=$ENDPOINT lambda invoke \\"
echo "       --function-name upload-function \\"
echo "       --payload '{\"name\": \"test.txt\", \"content\": \"Hello serverless\"}' \\"
echo "       output.json && cat output.json"
echo ""
echo "  2. Vérifier le bucket S3 :"
echo "     aws --endpoint-url=$ENDPOINT s3 ls s3://$BUCKET_NAME/"
echo ""
echo "  3. Vérifier DynamoDB :"
echo "     aws --endpoint-url=$ENDPOINT dynamodb scan --table-name $TABLE_NAME"
echo "=============================================="

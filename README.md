# TP1 – Serverless & Object Storage : Azure Functions vs AWS Lambda

## Architecture mise en place

```
┌─────────────────────────────────────────────────────────────────┐
│                         PARTIE AZURE                            │
│                                                                 │
│  curl POST /api/http-trigger                                    │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────┐    écrit blob    ┌──────────────────┐     │
│  │  HTTP Trigger   │ ──────────────► │  Blob Storage    │     │
│  │  (Azure Fn)     │                 │  (Azurite)       │     │
│  └─────────────────┘                 └────────┬─────────┘     │
│                                               │ blob créé      │
│                                               ▼                │
│                                      ┌──────────────────┐     │
│                                      │  Blob Trigger    │     │
│                                      │  (Azure Fn)      │     │
│                                      └────────┬─────────┘     │
│                                               │ écrit          │
│                                               ▼                │
│                                      ┌──────────────────┐     │
│                                      │  Table Storage   │     │
│                                      │  (Azurite)       │     │
│                                      └──────────────────┘     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                          PARTIE AWS                             │
│                                                                 │
│  aws lambda invoke --function-name upload-function              │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────┐    écrit objet   ┌──────────────────┐      │
│  │ upload-function │ ──────────────► │  S3 Bucket       │       │
│  │  (Lambda)       │                 │  (LocalStack)    │       │
│  └─────────────────┘                 └────────┬─────────┘       │
│                                               │ ObjectCreated   │
│                                               ▼                 │
│                                      ┌──────────────────┐       │
│                                      │ process-function │       │
│                                      │  (Lambda)        │       │
│                                      └────────┬─────────┘       │
│                                               │ écrit           │
│                                               ▼                 │
│                                      ┌──────────────────┐       │
│                                      │    DynamoDB      │       │
│                                      │  (LocalStack)    │       │
│                                      └──────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Rôle de chaque fonction

### Azure

| Fonction | Trigger | Rôle |
|---|---|---|
| `http-trigger` | HTTP POST | Reçoit un JSON `{name, content}` et écrit un blob dans Azurite |
| `blob-trigger` | Blob Storage | Détecte tout nouveau blob dans `tp-container`, lit son contenu, écrit un enregistrement dans Table Storage |

### AWS

| Fonction | Trigger | Rôle |
|---|---|---|
| `upload-function` | Invocation CLI | Reçoit un event JSON `{name, content}` et écrit un objet dans le bucket S3 LocalStack |
| `process-function` | S3 Event (`ObjectCreated`) | Détectée automatiquement à l'upload S3, lit l'objet, écrit un enregistrement dans DynamoDB |

---

## Lancer les deux parties en local

### Prérequis

```bash
# Node.js (v18+)
node --version

# Azure Functions Core Tools
npm install -g azure-functions-core-tools@4 --unsafe-perm true

# AWS CLI
pip install awscli

# Docker (pour LocalStack)
docker --version
```

---

### Partie Azure

**1. Démarrer Azurite**

Dans VS Code : `Ctrl+Shift+P` → `Azurite: Start`  
Ou en ligne de commande :
```bash
npx azurite --silent --location ./azurite-data --debug ./azurite-debug.log
```

**2. Installer les dépendances et lancer Azure Functions**

```bash
cd azure/
npm install
func start
```

**3. Tester le flux complet**

```bash
# Déclencher l'HTTP Trigger (crée un blob dans Azurite)
curl -X POST http://localhost:7071/api/http-trigger \
  -H "Content-Type: application/json" \
  -d '{"name": "test.txt", "content": "Hello Azure Serverless!"}'
```

Résultat attendu dans les logs `func start` :
- `📥 HTTP Trigger déclenché`
- `✅ Blob créé : test.txt`
- `📦 Blob Trigger déclenché` (quelques secondes après)
- `✅ Enregistrement écrit dans Table Storage`

---

### Partie AWS

**1. Démarrer LocalStack**

```bash
cd aws/
docker-compose up -d
```

**2. Configurer AWS CLI pour LocalStack**

```bash
aws configure set aws_access_key_id test
aws configure set aws_secret_access_key test
aws configure set region eu-west-1
```

**3. Initialiser l'infrastructure et déployer les Lambdas**

```bash
cd aws/scripts/
chmod +x setup.sh
./setup.sh
```

**4. Tester le flux complet**

```bash
# Déclencher upload-function
aws --endpoint-url=http://localhost:4566 lambda invoke \
  --function-name upload-function \
  --payload '{"name": "test.txt", "content": "Hello AWS Serverless!"}' \
  output.json

cat output.json

# Vérifier l'objet dans S3
aws --endpoint-url=http://localhost:4566 s3 ls s3://mon-bucket-tp/

# Vérifier l'enregistrement DynamoDB
aws --endpoint-url=http://localhost:4566 dynamodb scan --table-name tp-results
```

---

## Structure du dépôt

```
tp-serverless/
├── azure/
│   ├── http-trigger/
│   │   ├── index.js          # Logique HTTP → Blob Storage
│   │   └── function.json     # Binding HTTP
│   ├── blob-trigger/
│   │   ├── index.js          # Logique Blob → Table Storage
│   │   └── function.json     # Binding Blob Trigger
│   ├── host.json
│   ├── local.settings.json   # Config Azurite
│   └── package.json
│
├── aws/
│   ├── upload-function/
│   │   ├── index.js          # Logique upload → S3
│   │   └── package.json
│   ├── process-function/
│   │   ├── index.js          # Logique S3 Trigger → DynamoDB
│   │   └── package.json
│   ├── scripts/
│   │   └── setup.sh          # Setup complet LocalStack
│   └── docker-compose.yml    # LocalStack
│
└── README.md
```

---

## Analyse comparative

### 1. Modèle de triggers

**Azure** utilise un système de **bindings déclaratifs** : le trigger est défini dans `function.json` avec quelques lignes JSON. Azure gère lui-même l'écoute des événements Blob Storage de façon transparente, le développeur n'a rien d'autre à configurer.

```json
{
  "type": "blobTrigger",
  "path": "tp-container/{name}",
  "connection": "AzureWebJobsStorage"
}
```

**AWS** requiert une **configuration explicite en plusieurs étapes** : création du bucket, création de la fonction Lambda, ajout des permissions IAM, puis configuration de la notification S3 via un appel API séparé. L'event S3 est un objet JSON structuré que la Lambda reçoit et doit parser manuellement.

👉 **Azure est plus simple** pour les triggers : tout est centralisé dans un fichier de configuration. AWS offre plus de contrôle mais demande davantage de boilerplate.

---

### 2. Developer Experience (DX)

| Critère | Azure | AWS |
|---|---|---|
| Temps de mise en place | ~15 min (extension VS Code + `func start`) | ~30 min (Docker, LocalStack, CLI, scripts) |
| Outillage local | Excellent (Azurite intégré VS Code, logs live) | Correct (LocalStack via Docker, logs moins visibles) |
| Debug | `func start` affiche tout en temps réel | Logs via `docker logs localstack` ou CloudWatch local |
| Clarté des erreurs | Messages clairs et contextuels | Parfois cryptiques (erreurs Lambda emballées) |

**Azure gagne en DX** : l'extension VS Code, Azurite et Azure Functions Core Tools forment un écosystème très cohérent. Le feedback est immédiat.  
**AWS demande plus de configuration initiale** mais est plus représentatif d'un vrai environnement cloud.

---

### 3. Configuration

**Azure** privilégie une approche **déclarative** : les bindings dans `function.json` éliminent presque tout le code de plomberie (connexion au storage, écoute des événements). Le code fonctionnel se résume à la logique métier.

**AWS** est plus **impératif** : il faut instancier explicitement les clients SDK (S3Client, DynamoDBClient), gérer les configurations d'endpoint, parser l'event S3 manuellement. La quantité de boilerplate est sensiblement plus élevée.

👉 Pour une application simple, Azure réduit le code de 30 à 40% par rapport à AWS.

---

### 4. Émulateurs locaux

| Critère | Azurite (Azure) | LocalStack (AWS) |
|---|---|---|
| Installation | Extension VS Code (1 clic) | Docker Compose requis |
| Fidélité | Très haute pour Blob/Table/Queue | Haute pour S3/DynamoDB, partielle pour Lambda |
| Limitations | Aucune notable pour ce TP | Triggers S3→Lambda parfois instables en version gratuite |
| Stabilité | Très stable | Dépend de la version et du plan |

**Azurite est plus simple à utiliser** mais LocalStack est plus complet (émule une vraie région AWS avec ses nombreux services).

---

### 5. Portabilité du code

**Azure** : le code est fortement couplé aux SDK Azure (`@azure/storage-blob`, `@azure/data-tables`) et au système de bindings propre à Azure Functions. Migrer vers AWS nécessiterait une réécriture quasi-complète.

**AWS** : la logique métier est dans le handler, mais les appels SDK (`@aws-sdk/client-s3`, `@aws-sdk/client-dynamodb`) et la structure de l'event S3 sont spécifiques à AWS. Migrer vers Azure nécessiterait également une réécriture.

👉 Dans les deux cas, **le code est fortement lié au provider**. Pour gagner en portabilité, il faudrait adopter un framework d'abstraction comme **Serverless Framework** ou **Terraform**, ou isoler la logique métier dans des modules indépendants du cloud.

---

### Synthèse

| Axe | Vainqueur | Raison |
|---|---|---|
| Facilité de configuration des triggers | ✅ Azure | Bindings déclaratifs, zéro boilerplate |
| Developer Experience locale | ✅ Azure | Azurite + VS Code = setup en 2 min |
| Contrôle et flexibilité | ✅ AWS | Configuration explicite, plus de granularité |
| Richesse de l'émulateur | ✅ AWS (LocalStack) | Émule toute une région AWS |
| Quantité de code à écrire | ✅ Azure | Moins de boilerplate grâce aux bindings |
| Représentativité du cloud réel | ✅ AWS | LocalStack = quasi-identique à la prod |

**Conclusion** : Azure Functions offre une meilleure expérience développeur pour des architectures événementielles simples. AWS Lambda offre plus de flexibilité et correspond mieux à une infrastructure cloud complexe en production. Le choix dépend du contexte : rapidité de développement vs contrôle fin de l'infrastructure.

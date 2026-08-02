#!/bin/bash

# Meilisearch Setup Script for Insight-Hub
# This script sets up Meilisearch with the opportunities index

set -e

echo "🚀 Setting up Meilisearch for Insight-Hub..."

# Configuration
MEILISEARCH_HOST="${MEILISEARCH_HOST:-localhost:7700}"
MEILISEARCH_MASTER_KEY="${MEILISEARCH_MASTER_KEY:-insight-hub-master-key-change-in-production}"
INDEX_NAME="opportunities"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ docker-compose is not installed. Please install docker-compose first."
    exit 1
fi

# Use docker compose or docker-compose
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# Start Meilisearch using docker-compose
echo "📦 Starting Meilisearch using Docker Compose..."
cd "$(dirname "$0")/.."
$DOCKER_COMPOSE up -d meilisearch

# Wait for Meilisearch to be ready
echo "⏳ Waiting for Meilisearch to be ready..."
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -s http://$MEILISEARCH_HOST/health > /dev/null 2>&1; then
        echo "✅ Meilisearch is ready"
        break
    fi
    ATTEMPT=$((ATTEMPT + 1))
    echo "  Attempt $ATTEMPT/$MAX_ATTEMPTS..."
    sleep 2
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo "❌ Meilisearch failed to start. Please check the logs:"
    $DOCKER_COMPOSE logs meilisearch
    exit 1
fi

# Create the opportunities index
echo "📝 Creating opportunities index..."
CREATE_RESPONSE=$(curl -s -X POST http://$MEILISEARCH_HOST/indexes \
  -H "Authorization: Bearer $MEILISEARCH_MASTER_KEY" \
  -H "Content-Type: application/json" \
  --data-binary "{
    \"uid\": \"$INDEX_NAME\",
    \"primaryKey\": \"externalId\"
  }" 2>&1)

if echo "$CREATE_RESPONSE" | grep -q "index_already_exists"; then
    echo "✅ Index already exists"
elif echo "$CREATE_RESPONSE" | grep -q "taskUid"; then
    echo "✅ Index created successfully"
else
    echo "⚠️  Index creation response: $CREATE_RESPONSE"
fi

# Configure index settings for optimal search
echo "⚙️  Configuring index settings..."

# Configure searchable attributes
curl -s -X PATCH http://$MEILISEARCH_HOST/indexes/$INDEX_NAME/settings/searchable-attributes \
  -H "Authorization: Bearer $MEILISEARCH_MASTER_KEY" \
  -H "Content-Type: application/json" \
  --data-binary '["title", "description", "agency", "solicitationNumber"]' > /dev/null

# Configure filterable attributes
curl -s -X PATCH http://$MEILISEARCH_HOST/indexes/$INDEX_NAME/settings/filterable-attributes \
  -H "Authorization: Bearer $MEILISEARCH_MASTER_KEY" \
  -H "Content-Type: application/json" \
  --data-binary '["agency", "status", "state", "postedDate", "responseDeadline", "type"]' > /dev/null

# Configure sortable attributes
curl -s -X PATCH http://$MEILISEARCH_HOST/indexes/$INDEX_NAME/settings/sortable-attributes \
  -H "Authorization: Bearer $MEILISEARCH_MASTER_KEY" \
  -H "Content-Type: application/json" \
  --data-binary '["postedDate", "responseDeadline"]' > /dev/null

# Configure ranking rules (prioritize recent opportunities)
curl -s -X PATCH http://$MEILISEARCH_HOST/indexes/$INDEX_NAME/settings/ranking-rules \
  -H "Authorization: Bearer $MEILISEARCH_MASTER_KEY" \
  -H "Content-Type: application/json" \
  --data-binary '[
    "words",
    "typo",
    "proximity",
    "attribute",
    "sort",
    "exactness",
    "postedDate:desc"
  ]' > /dev/null

echo "✅ Index settings configured"

# Add to shell profile for persistence
echo "📝 Adding Meilisearch configuration to shell profile..."

SHELL_PROFILE=""
if [[ "$SHELL" == "/bin/zsh" ]]; then
    SHELL_PROFILE="$HOME/.zshrc"
elif [[ "$SHELL" == "/bin/bash" ]]; then
    SHELL_PROFILE="$HOME/.bashrc"
fi

if [[ -n "$SHELL_PROFILE" ]]; then
    if ! grep -q "SELF_HOSTED_SEARCH" "$SHELL_PROFILE" 2>/dev/null; then
        echo "" >> "$SHELL_PROFILE"
        echo "# Insight-Hub Meilisearch Configuration" >> "$SHELL_PROFILE"
        echo "export SELF_HOSTED_SEARCH_ENDPOINT=http://$MEILISEARCH_HOST" >> "$SHELL_PROFILE"
        echo "export SELF_HOSTED_SEARCH_API_KEY=$MEILISEARCH_MASTER_KEY" >> "$SHELL_PROFILE"
        echo "export SELF_HOSTED_SEARCH_INDEX=$INDEX_NAME" >> "$SHELL_PROFILE"
        echo "✅ Configuration added to $SHELL_PROFILE"
    else
        echo "✅ Configuration already exists in $SHELL_PROFILE"
    fi
fi

# Test the index
echo "🧪 Testing Meilisearch index..."
TEST_RESPONSE=$(curl -s http://$MEILISEARCH_HOST/indexes/$INDEX_NAME \
  -H "Authorization: Bearer $MEILISEARCH_MASTER_KEY")

if echo "$TEST_RESPONSE" | grep -q "uid"; then
    echo "✅ Index is accessible"
else
    echo "⚠️  Index test failed, but setup completed"
fi

echo ""
echo "✨ Meilisearch setup complete!"
echo ""
echo "📋 Next steps:"
echo "  1. Set environment variable: export SELF_HOSTED_SEARCH_ENDPOINT=http://$MEILISEARCH_HOST"
echo "  2. Set environment variable: export SELF_HOSTED_SEARCH_API_KEY=$MEILISEARCH_MASTER_KEY"
echo "  3. Set environment variable: export SELF_HOSTED_SEARCH_INDEX=$INDEX_NAME"
echo "  4. Restart the Insight-Hub API server"
echo ""
echo "💡 Useful commands:"
echo "  - View logs: $DOCKER_COMPOSE logs -f meilisearch"
echo "  - Stop service: $DOCKER_COMPOSE stop meilisearch"
echo "  - Start service: $DOCKER_COMPOSE start meilisearch"
echo "  - Check health: curl http://$MEILISEARCH_HOST/health"
echo "  - View index: curl http://$MEILISEARCH_HOST/indexes/$INDEX_NAME -H \"Authorization: Bearer $MEILISEARCH_MASTER_KEY\""

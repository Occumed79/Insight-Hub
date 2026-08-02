# Insight-Hub Stability Architecture

## Overview

This document describes the stability improvements implemented to reduce dependency on external API keys and rate-limited services. The architecture prioritizes self-hosted solutions and direct government sources over third-party APIs.

## Problem Statement

The original architecture relied heavily on external APIs (Serper, Exa, Firecrawl, Olostep, Jina, You.com, DeepSeek, Cloudflare Workers AI, etc.) which caused several issues:

- **Invalid API Keys**: Multiple providers had missing or invalid API keys
- **Rate Limits**: SAM.gov quota exceeded, Groq TPM limits
- **Timeout Issues**: Firecrawl and Olostep timeouts
- **Cost**: Per-token and per-call costs for external services
- **Reliability**: External service outages and deprecations

## Solution Architecture

### Provider Tier Strategy

Providers are organized into three tiers based on stability and reliability:

#### Tier 1: Most Stable (No API Keys Required)
- **Direct Government Sources**: SAM.gov, Texas ESBD, NY SCR, Grants.gov
- **Self-Hosted Services**: Local LLM, Self-Hosted Crawler, Self-Hosted Search
- **RSS Feeds**: RSS Aggregator for government portals
- **Public Portals**: Direct integration with public government portals

#### Tier 2: Moderately Stable (External APIs with Good Reliability)
- **Neural Search**: Exa, Parallel, Linkup
- **AI Inference**: Groq, Gemini, OpenRouter, Cerebras, Cohere
- **Vector Services**: Pinecone, Voyage

#### Tier 3: Fallback (External APIs with Rate Limits or Issues)
- **Search APIs**: Serper, You.com, LangSearch
- **Scraping APIs**: Firecrawl, Olostep, Jina
- **AI APIs**: DeepSeek, Cloudflare Workers AI

#### Disabled: Not Recommended for Production
- **Deprecated**: BrowseAI, BrowserUse
- **Limited Coverage**: BidNet, EUNA Bonfire, International Portals
- **Experimental**: CLōD, Fal AI

## New Components

### 1. Self-Hosted Crawler (`selfHostedCrawler.ts`)

**Purpose**: Replace external scraping APIs (Firecrawl, Olostep, Jina) with a self-hosted crawler.

**Features**:
- Playwright-based web scraping
- Full-page content extraction
- Markdown conversion
- Screenshot and PDF generation
- Configurable timeouts and retries
- No API keys required

**Configuration**:
```bash
SELF_HOSTED_CRAWLER_URL=http://localhost:3000
```

**Usage**:
```typescript
import { selfHostedCrawlerProvider } from "./providers/selfHostedCrawler";

const content = await selfHostedCrawlerProvider.getText(url);
const markdown = await selfHostedCrawlerProvider.extractMarkdown(url);
```

### 2. RSS Feed Aggregator (`rssAggregator.ts`)

**Purpose**: Aggregate RSS feeds from government portals for stable, real-time discovery.

**Features**:
- No API keys required
- Real-time updates
- Official government sources
- Low bandwidth
- Stable and reliable

**Supported Feeds**:
- SAM.gov RSS
- Grants.gov RSS
- California RSS
- Florida RSS
- Texas RSS
- New York RSS

**Usage**:
```typescript
import { rssAggregatorProvider } from "./providers/rssAggregator";

const result = await rssAggregatorProvider.fetch({ limit: 50 });
```

### 3. Local LLM Provider (`localLlm.ts`)

**Purpose**: Provide AI extraction and scoring using locally-hosted LLMs instead of external APIs.

**Features**:
- Supports Ollama, LocalAI, or any OpenAI-compatible server
- No API keys required
- No rate limits
- Privacy (data stays local)
- Cost-effective

**Configuration**:
```bash
LOCAL_LLM_ENDPOINT=http://localhost:11434
LOCAL_LLM_MODEL=llama3.2
```

**Usage**:
```typescript
import { localLlmProvider } from "./providers/localLlm";

const extraction = await localLlmProvider.extractOpportunityFromWebResult(title, url, content);
const score = await localLlmProvider.scoreRelevance(title, description, orgContext);
const queries = await localLlmProvider.generateSearchQueries(keywords);
```

### 4. Self-Hosted Search (`selfHostedSearch.ts`)

**Purpose**: Provide search capabilities using a self-hosted search engine.

**Features**:
- Supports Meilisearch, Typesense, or OpenSearch/Elasticsearch
- No API keys required
- Full control over search behavior
- Scalable
- Works offline

**Configuration**:
```bash
SELF_HOSTED_SEARCH_ENDPOINT=http://localhost:7700
SELF_HOSTED_SEARCH_API_KEY=your-api-key
SELF_HOSTED_SEARCH_INDEX=opportunities
```

**Usage**:
```typescript
import { selfHostedSearchProvider } from "./providers/selfHostedSearch";

const results = await selfHostedSearchProvider.search({
  query: "occupational health services",
  limit: 100,
});
```

### 5. Scheduled Crawler (`scheduledCrawler.ts`)

**Purpose**: Periodically crawl known government portal URLs with change detection.

**Features**:
- Scheduled crawling with configurable intervals
- Change detection using content hashing
- Opportunity caching
- New/changed opportunity detection
- No API keys required

**Default Targets**:
- SAM.gov RSS
- Grants.gov RSS
- Texas ESBD
- New York SCR

**Usage**:
```typescript
import { scheduledCrawler } from "./crawler/scheduledCrawler";

// Run scheduled crawl
const results = await scheduledCrawler.runScheduledCrawl();

// Add custom target
scheduledCrawler.addTarget({
  url: "https://example.gov/rss",
  name: "Custom Portal",
  crawlIntervalMs: 60 * 60 * 1000, // 1 hour
  enabled: true,
});

// Get schedule status
const status = scheduledCrawler.getScheduleStatus();
```

### 6. Enhanced Heuristic Extraction (`heuristicExtract.ts`)

**Purpose**: Improve fallback extraction when AI is unavailable.

**Enhancements**:
- More date format patterns (international, ordinal dates)
- Enhanced value extraction (estimated value, budget)
- Expanded agency patterns (schools, universities)
- Location extraction (city, state)
- Contact extraction (email, phone)
- Solicitation number extraction

**Usage**:
```typescript
import { extractMetadataFromText } from "./search/heuristicExtract";

const metadata = extractMetadataFromText(content, title);
// Returns: deadline, estimatedValue, agencyHint, location, contact, solicitationNumber
```

### 7. Provider Tier Configuration (`providerTiers.ts`)

**Purpose**: Define stability hierarchy and provider priorities.

**Features**:
- Tier-based provider organization
- Stability scoring
- Use case recommendations
- Self-hosted requirement tracking
- API key requirement tracking

**Usage**:
```typescript
import { 
  getProvidersByTier, 
  getRecommendedProviders, 
  isStableProvider 
} from "./config/providerTiers";

// Get Tier 1 providers
const tier1 = getProvidersByTier("tier1");

// Get recommended providers for discovery
const discoveryProviders = getRecommendedProviders("discovery");

// Check if provider is stable
const stable = isStableProvider("samGov"); // true
```

## Provider Pool Configuration Updates

The `limitedProviderPool.ts` has been updated to prioritize stable sources:

### Web Discovery Pool
- **Budget**: 45s (increased from 30s)
- **Timeout**: 10s (increased from 7s)
- **Attempts**: 6 (increased from 4)
- **Priority**: RSS feeds → Direct portals → Self-hosted crawler → External APIs

### Page Enrichment Pool
- **Budget**: 20s (increased from 15s)
- **Timeout**: 15s (increased from 12s)
- **Attempts**: 10 (increased from 8)
- **Priority**: Self-hosted crawler → Direct portal parsers → External scraping APIs

### AI Extraction Pool
- **Budget**: 35s (increased from 25s)
- **Timeout**: 12s (increased from 8s)
- **Attempts**: 8 (increased from 5)
- **Priority**: Local LLM → Gemini → Groq → Other AI APIs

### Structured Review Pool
- **Budget**: 30s (increased from 25s)
- **Timeout**: 15s (increased from 10s)
- **Attempts**: 5 (increased from 3)
- **Priority**: Direct federal sources → External APIs

## Deployment Recommendations

### Option 1: Self-Hosted Everything (Most Stable)

**Infrastructure**:
- Ollama for local LLM (run on GPU server)
- Meilisearch for search index
- Playwright-based crawler service
- PostgreSQL for database
- Qdrant for vector database

**Benefits**:
- No external API dependencies
- No rate limits
- Maximum control
- Privacy
- Cost-effective (no per-token costs)

**Requirements**:
- GPU server for Ollama (recommended: NVIDIA GPU with 8GB+ VRAM)
- CPU server for Meilisearch and crawler
- 16GB+ RAM for LLM inference
- Storage for search index and cached content

### Option 2: Hybrid (Balanced)

**Use Self-Hosted For**:
- RSS feed aggregation
- Direct government portal scraping
- Heuristic extraction
- Scheduled crawling

**Use External APIs For**:
- AI extraction (when local LLM unavailable)
- Search (when self-hosted search unavailable)
- Vector embeddings (when local unavailable)

**Benefits**:
- Reduced API dependency
- Fallback to external services when needed
- Lower infrastructure requirements

### Option 3: Cloud-Native (Minimal Infrastructure)

**Use Self-Hosted For**:
- RSS feed aggregation
- Heuristic extraction
- Direct government portal scraping

**Use External APIs For**:
- AI extraction
- Search
- Vector embeddings

**Benefits**:
- Minimal infrastructure
- Still reduces API dependency significantly
- Good balance of stability and convenience

## Environment Variables

### Self-Hosted Crawler
```bash
SELF_HOSTED_CRAWLER_URL=http://localhost:3000
```

### Local LLM
```bash
LOCAL_LLM_ENDPOINT=http://localhost:11434
LOCAL_LLM_MODEL=llama3.2
```

### Self-Hosted Search
```bash
SELF_HOSTED_SEARCH_ENDPOINT=http://localhost:7700
SELF_HOSTED_SEARCH_API_KEY=your-api-key
SELF_HOSTED_SEARCH_INDEX=opportunities
```

### Existing Providers (Optional - for fallback)
```bash
# External APIs (Tier 2/3 - optional)
GEMINI_API_KEY=your-key
GROQ_API_KEY=your-key
EXA_API_KEY=your-key
SERPER_API_KEY=your-key
FIRECRAWL_API_KEY=your-key
OLOSTEP_API_KEY=your-key
```

## Migration Guide

### Step 1: Deploy Self-Hosted Services

**Ollama**:
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull model
ollama pull llama3.2

# Start server
ollama serve
```

**Meilisearch**:
```bash
# Using Docker
docker run -d -p 7700:7700 \
  -v $(pwd)/meili_data:/meili_data \
  getmeili/meilisearch

# Create index
curl -X POST http://localhost:7700/indexes \
  -H 'Content-Type: application/json' \
  --data-binary '{
    "uid": "opportunities",
    "primaryKey": "id"
  }'
```

**Self-Hosted Crawler**:
```bash
# Deploy crawler service (implementation required)
# See selfHostedCrawler.ts for API specification
```

### Step 2: Update Environment Variables

Add self-hosted service URLs to your environment:

```bash
# Render dashboard or .env file
LOCAL_LLM_ENDPOINT=http://your-ollama-server:11434
SELF_HOSTED_SEARCH_ENDPOINT=http://your-meilisearch-server:7700
SELF_HOSTED_CRAWLER_URL=http://your-crawler-server:3000
```

### Step 3: Test New Providers

```bash
# Test local LLM
curl http://localhost:11434/api/generate -d '{
  "model": "llama3.2",
  "prompt": "Test"
}'

# Test Meilisearch
curl http://localhost:7700/health

# Test crawler (if deployed)
curl http://localhost:3000/health
```

### Step 4: Update Application Configuration

The provider pool will automatically prioritize stable sources. No code changes required for basic usage.

### Step 5: Monitor and Adjust

- Monitor logs for provider usage
- Adjust timeouts and budgets as needed
- Add custom RSS feeds to scheduled crawler
- Fine-tune heuristic extraction patterns

## Monitoring

### Provider Usage Logs

The system logs provider usage and fallback behavior:

```json
{
  "event": "limited_provider_pool_recovered",
  "poolId": "opportunity-web-discovery",
  "successfulProvider": "rssAggregator",
  "attempted": ["rssAggregator", "samGov"],
  "recoveredErrors": []
}
```

### Health Checks

Each provider includes a health check:

```typescript
const status = await localLlmProvider.getStatus();
// Returns: { name: "localLlm", configured: true, healthy: true }
```

### Scheduled Crawler Status

```typescript
const status = scheduledCrawler.getScheduleStatus();
// Returns: { targets: [...], lastRun, nextRun, isRunning }
```

## Troubleshooting

### Local LLM Not Responding

**Check**: Ollama service is running
```bash
curl http://localhost:11434/api/tags
```

**Solution**: Start Ollama service
```bash
ollama serve
```

### Self-Hosted Search Not Working

**Check**: Meilisearch health
```bash
curl http://localhost:7700/health
```

**Solution**: Restart Meilisearch container
```bash
docker restart meilisearch
```

### RSS Feeds Not Updating

**Check**: Scheduled crawler status
```typescript
const status = scheduledCrawler.getScheduleStatus();
console.log(status);
```

**Solution**: Manually trigger crawl
```typescript
await scheduledCrawler.runScheduledCrawl();
```

### Heuristic Extraction Not Working

**Check**: Pattern matching in logs
**Solution**: Add custom patterns to `heuristicExtract.ts`

## Performance Considerations

### Local LLM Performance

- **GPU**: 10-50 tokens/second
- **CPU**: 1-5 tokens/second
- **RAM**: 8GB+ recommended for 7B models
- **Model Size**: 7B models recommended for balance of speed and quality

### Self-Hosted Search Performance

- **Index Size**: Depends on document count
- **Query Speed**: 10-100ms for typical queries
- **RAM**: 2GB+ recommended for production
- **CPU**: Multi-core beneficial

### Scheduled Crawler Performance

- **Crawl Interval**: 1 hour default
- **Change Detection**: Hash-based, fast
- **Cache Size**: Depends on opportunity count
- **Network**: Bandwidth for RSS feeds only

## Cost Comparison

### External API Approach (Previous)
- Monthly API costs: $500-2000+
- Rate limits affecting reliability
- API key management overhead
- Vendor lock-in

### Self-Hosted Approach (New)
- Infrastructure: $50-200/month (servers)
- No per-token costs
- No rate limits
- Full control
- Vendor-independent

### Hybrid Approach (Balanced)
- Infrastructure: $20-100/month
- Reduced API costs: $50-500/month
- Fallback to external APIs
- Balanced reliability and cost

## Future Enhancements

1. **Additional State Portals**: Expand direct portal integrations
2. **Custom Parsers**: Build parsers for specific portal formats
3. **ML-Based Extraction**: Train custom models for extraction
4. **Distributed Crawling**: Scale crawler horizontally
5. **Real-time Updates**: WebSocket-based updates from RSS feeds
6. **Advanced Change Detection**: Diff-based change detection
7. **Caching Layer**: Redis-based caching for frequently accessed content
8. **Monitoring Dashboard**: UI for monitoring provider health and usage

## Conclusion

The new stability architecture significantly reduces dependency on external APIs while maintaining or improving functionality. By prioritizing self-hosted solutions and direct government sources, the system becomes more reliable, cost-effective, and maintainable.

The tier-based provider strategy ensures graceful degradation - if self-hosted services are unavailable, the system falls back to external APIs, and if those fail, heuristic extraction provides a final fallback layer.

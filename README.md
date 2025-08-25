# 🎭 Production-Ready Web Scraping System

A modern, scalable web scraping system built with **Playwright**, **BullMQ**, **Hono**, and **Bun**. This system demonstrates production-ready architecture for automated web scraping with queue management, RESTful API, and process monitoring.

## 🏗️ Architecture Overview

```mermaid
graph TD
    A[Client] --> B[Hono API Server]
    B --> C[BullMQ Queue]
    C --> D[Redis]
    E[Worker Process] --> C
    E --> F[Playwright Scrapers]
    F --> G[Database]
    F --> H[Markdown Files]
    I[PM2 Process Manager] --> B
    I --> E
```

## 🚀 What We Built

### **Core Components:**

1. **🎭 Playwright Scrapers**
   - Automated browser control for dynamic content
   - Support for quotes, Reddit, TikTok (extensible)
   - Converts scraped data to clean Markdown format

2. **🐂 BullMQ Queue System**
   - Reliable job queue with Redis backend
   - Automatic retries for failed jobs
   - Job progress tracking and monitoring

3. **🔥 Hono REST API**
   - Lightning-fast API server built on Bun
   - Endpoints for triggering scrapes, monitoring jobs, retrieving data
   - Health checks and system statistics

4. **💾 SQLite Database**
   - Persistent storage for scraped content
   - Job tracking and status management
   - Full-text search capabilities

5. **🚀 PM2 Process Management**
   - Automatic process restarts on crashes
   - Log management and monitoring
   - Production-ready deployment

## 📁 Project Structure

```
Scraper Script/
├── src/
│   ├── scrapers/         # 🎭 Playwright scrapers
│   │   └── quotes-scraper.ts
│   ├── workers/          # 🐂 BullMQ job processors  
│   │   └── scraper-worker.ts
│   ├── api/              # 🔥 Hono REST API
│   │   └── server.ts
│   ├── database/         # 💾 SQLite database setup
│   │   └── database.ts
│   └── config/           # ⚙️ Configuration files
│       ├── redis.ts
│       └── bullmq.ts
├── data/                 # 📊 Scraped results & database
├── logs/                 # 📝 Application logs  
├── server.ts             # 🔥 API server entry point
├── worker.ts             # 🐂 Worker entry point
├── ecosystem.config.cjs  # 🚀 PM2 configuration
└── package.json          # 📦 Dependencies & scripts
```

## 🔧 Quick Start

### **Prerequisites**
- Bun installed (`curl -fsSL https://bun.sh/install | bash`)
- Redis running (`brew install redis && brew services start redis`)
- PM2 for production (`bun add -g pm2`)

### **Installation & Setup**
```bash
# Clone and setup
cd "Scraper Script"
bun install

# Create directories
mkdir -p data logs

# Test the basic scraper
bun run src/scrapers/quotes-scraper.ts
```

### **Development Mode**
```bash
# Terminal 1: Start API Server
bun run dev:server

# Terminal 2: Start Worker
bun run dev:worker

# Test the API
curl http://localhost:3000/health
```

### **Production Deployment**
```bash
# Start with PM2
bun run pm2:start

# Monitor processes
bun run pm2:status
bun run pm2:logs

# Stop all processes
bun run pm2:stop
```

## 🎯 API Endpoints

### **Core Endpoints**
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Welcome & API documentation |
| `GET` | `/health` | System health check |
| `POST` | `/scrape` | Trigger scraping job |
| `GET` | `/jobs/:id` | Get job status |
| `GET` | `/jobs` | List all jobs |
| `GET` | `/results` | Get scraped content |
| `GET` | `/stats` | System statistics |

### **Quick Test Endpoints**
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/quick/quotes` | Start quotes scraping |

### **Example API Usage**

**Trigger a scraping job:**
```bash
curl -X POST http://localhost:3000/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "type": "scrape-quotes",
    "url": "http://quotes.toscrape.com",
    "pages": 3
  }'
```

**Check job status:**
```bash
curl http://localhost:3000/jobs/YOUR_JOB_ID
```

**Get scraped results:**
```bash
curl "http://localhost:3000/results?source=quotes&limit=10"
```

## 🎭 Available Scrapers

### **1. Quotes Scraper** ✅ (Complete)
- **Target:** `http://quotes.toscrape.com`
- **Data:** Quote text, authors, tags
- **Format:** Beautiful Markdown output
- **Features:** Multi-page scraping, rate limiting

### **2. Reddit Scraper** 🚧 (Planned)
- **Target:** `https://reddit.com`
- **Data:** Posts, comments, metadata
- **Features:** Subreddit filtering, comment threading

### **3. TikTok Scraper** 🚧 (Bonus Feature)
- **Target:** `https://tiktok.com`
- **Data:** Video metadata, descriptions, hashtags
- **Features:** Anti-bot evasion, rate limiting

## 📊 Data Output Examples

### **Markdown Format**
```markdown
# 📚 Scraped Quotes Collection

*Scraped 20 quotes on 2025-08-24*

---

## Quote 1

> "The world as we have created it is a process of our thinking..."

**Author:** Albert Einstein
**Tags:** `change`, `deep-thoughts`, `thinking`, `world`
```

### **JSON API Response**
```json
{
  "success": true,
  "results": [
    {
      "id": 1,
      "source": "quotes",
      "url": "http://quotes.toscrape.com",
      "title": null,
      "content": "> \"The world as we have created it...\"",
      "scrapedAt": "2025-08-24T12:00:00.000Z",
      "metadata": {
        "author": "Albert Einstein",
        "tags": ["change", "deep-thoughts"]
      }
    }
  ]
}
```

## ⚙️ Configuration

### **Environment Variables**
```bash
# Server Configuration
PORT=3000
NODE_ENV=production

# Redis Configuration  
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# Worker Configuration
WORKER_CONCURRENCY=2
```

### **BullMQ Settings**
- **Default Retries:** 3 attempts
- **Retry Delay:** Exponential backoff (2s, 4s, 8s)
- **Job Retention:** 50 completed, 20 failed jobs
- **Concurrency:** 2 simultaneous jobs

## 🔍 Monitoring & Logs

### **PM2 Monitoring**
```bash
# Real-time monitoring dashboard
pm2 monit

# Process status
pm2 status

# View logs
pm2 logs

# Restart all processes
pm2 restart all
```

### **Log Files**
- `logs/api-out.log` - API server output
- `logs/api-error.log` - API server errors
- `logs/worker-out.log` - Worker output
- `logs/worker-error.log` - Worker errors

### **Health Monitoring**
```bash
# Check system health
curl http://localhost:3000/health

# Get system statistics
curl http://localhost:3000/stats
```

## 🧹 Maintenance Commands

```bash
# Clean up data and logs
bun run clean

# Restart PM2 processes
bun run pm2:restart

# Update dependencies
bun update

# View queue statistics
curl http://localhost:3000/stats
```

---

*Built with ❤️ using Bun, Playwright, Hono, BullMQ, and modern JavaScript*
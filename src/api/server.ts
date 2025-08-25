import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { HTTPException } from 'hono/http-exception';

import { addScrapeJob, getQueueStats, JobType } from '../config/bullmq.js';
import { scraperDB, initDatabase } from '../database/database.js';
import { testRedisConnection } from '../config/redis.js';

/**
 * 🔥 HONO API SERVER - REST API for Scraping Operations
 * 
 * This server provides HTTP endpoints to:
 * - Trigger scraping jobs
 * - Check job status and progress  
 * - Retrieve scraped data
 * - Monitor system health
 * - Get statistics and analytics
 */

// Create Hono app
const app = new Hono();

// Middleware
app.use('*', logger());              // Request logging
app.use('*', cors());               // Enable CORS
app.use('*', prettyJSON());         // Pretty print JSON responses

/**
 * 🏠 HOME & HEALTH ENDPOINTS
 */

// Welcome endpoint
app.get('/', (c) => {
  return c.json({
    message: '🎭 Welcome to the Scraper API!',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      scrape: '/scrape',
      results: '/results',
      jobs: '/jobs',
      stats: '/stats',
      quickQuotes: 'POST /quick/quotes',
      quickReddit: 'POST /quick/reddit',
    },
    documentation: 'https://github.com/JezreelBuenconsejo/web-scraper/README.md',
    examples: {
      quickStart: 'POST /quick/quotes or POST /quick/reddit',
      customQuotes: 'POST /scrape with {"type": "scrape-quotes", "url": "http://quotes.toscrape.com", "pages": 3}',
      customReddit: 'POST /scrape with {"type": "scrape-reddit", "url": "https://old.reddit.com/r/programming", "pages": 5}',
    },
  });
});

// Health check endpoint
app.get('/health', async (c) => {
  try {
    // Test Redis connection
    const redisHealthy = await testRedisConnection();
    
    // Test Database
    const dbStats = scraperDB.getStats();
    
    // Get queue stats
    const queueStats = await getQueueStats();

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        redis: redisHealthy ? 'healthy' : 'unhealthy',
        database: 'healthy',
        queue: 'healthy',
      },
      stats: {
        database: dbStats,
        queue: queueStats,
      },
    };

    return c.json(health);
  } catch (error) {
    return c.json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * 🎯 SCRAPING ENDPOINTS
 */

// Trigger scraping job
app.post('/scrape', async (c) => {
  try {
    let body;
    try {
      body = await c.req.json();
    } catch (error) {
      throw new HTTPException(400, {
        message: 'Invalid JSON in request body. Expected: {"type": "scrape-quotes", "url": "http://quotes.toscrape.com", "pages": 3}',
      });
    }
    
    // Validate request body exists
    if (!body || typeof body !== 'object') {
      throw new HTTPException(400, {
        message: 'Request body is required. Expected: {"type": "scrape-quotes", "url": "http://quotes.toscrape.com", "pages": 3}',
      });
    }
    
    // Validate request body
    const { type, url, pages = 3, priority = 0 } = body;
    
    if (!type || !Object.values(JobType).includes(type as JobType)) {
      throw new HTTPException(400, {
        message: `Invalid job type. Supported types: ${Object.values(JobType).join(', ')}`,
      });
    }

    // Add job to queue
    const jobId = await addScrapeJob(
      type as JobType,
      { url, pages },
      priority
    );

    // Create job record in database
    scraperDB.createScrapeJob({
      job_id: jobId,
      job_type: type,
      status: 'pending',
      started_at: new Date().toISOString(),
    });

    return c.json({
      success: true,
      jobId,
      message: `${type} job queued successfully`,
      estimatedWaitTime: '1-5 minutes',
    });

  } catch (error) {
    console.error('❌ Error creating scrape job:', error);
    
    if (error instanceof HTTPException) {
      throw error;
    }

    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create scrape job',
    }, 500);
  }
});

// Get scraping job status
app.get('/jobs/:jobId', async (c) => {
  try {
    const jobId = c.req.param('jobId');
    
    // Get job from database
    const job = scraperDB.getScrapeJob(jobId);
    
    if (!job) {
      throw new HTTPException(404, {
        message: 'Job not found',
      });
    }

    return c.json({
      success: true,
      job: {
        id: job.job_id,
        type: job.job_type,
        status: job.status,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        errorMessage: job.error_message,
        result: job.result_data ? JSON.parse(job.result_data) : null,
      },
    });

  } catch (error) {
    console.error('❌ Error getting job status:', error);
    
    if (error instanceof HTTPException) {
      throw error;
    }

    return c.json({
      success: false,
      error: 'Failed to get job status',
    }, 500);
  }
});

// List all jobs with optional filtering
app.get('/jobs', async (c) => {
  try {
    const status = c.req.query('status');
    const limit = parseInt(c.req.query('limit') || '20');
    
    let jobs;
    
    if (status) {
      jobs = scraperDB.getJobsByStatus(status);
    } else {
      // Get recent jobs (we'd need to add this method)
      jobs = scraperDB.getJobsByStatus('completed')
        .concat(scraperDB.getJobsByStatus('failed'))
        .concat(scraperDB.getJobsByStatus('pending'))
        .slice(0, limit);
    }

    return c.json({
      success: true,
      jobs: jobs.map(job => ({
        id: job.job_id,
        type: job.job_type,
        status: job.status,
        startedAt: job.started_at,
        completedAt: job.completed_at,
      })),
      total: jobs.length,
    });

  } catch (error) {
    console.error('❌ Error listing jobs:', error);
    return c.json({
      success: false,
      error: 'Failed to list jobs',
    }, 500);
  }
});

/**
 * 📊 RESULTS & DATA ENDPOINTS  
 */

// Get scraped content
app.get('/results', async (c) => {
  try {
    const source = c.req.query('source');
    const limit = parseInt(c.req.query('limit') || '20');
    const search = c.req.query('search');

    let results;

    if (search) {
      results = scraperDB.searchContent(search).slice(0, limit);
    } else if (source) {
      results = scraperDB.getContentBySource(source).slice(0, limit);
    } else {
      results = scraperDB.getRecentContent(limit);
    }

    return c.json({
      success: true,
      results: results.map(result => ({
        id: result.id,
        source: result.source,
        url: result.url,
        title: result.title,
        content: result.content,
        scrapedAt: result.scraped_at,
        metadata: result.metadata ? JSON.parse(result.metadata) : null,
      })),
      total: results.length,
      query: { source, limit, search },
    });

  } catch (error) {
    console.error('❌ Error getting results:', error);
    return c.json({
      success: false,
      error: 'Failed to get results',
    }, 500);
  }
});

// Get specific scraped content by ID
app.get('/results/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    
    // We'd need to add this method to the database class
    const result = scraperDB.getRecentContent(1000).find(r => r.id === id);
    
    if (!result) {
      throw new HTTPException(404, {
        message: 'Content not found',
      });
    }

    return c.json({
      success: true,
      result: {
        id: result.id,
        source: result.source,
        url: result.url,
        title: result.title,
        content: result.content,
        rawData: JSON.parse(result.raw_data),
        scrapedAt: result.scraped_at,
        metadata: result.metadata ? JSON.parse(result.metadata) : null,
      },
    });

  } catch (error) {
    console.error('❌ Error getting content:', error);
    
    if (error instanceof HTTPException) {
      throw error;
    }

    return c.json({
      success: false,
      error: 'Failed to get content',
    }, 500);
  }
});

/**
 * 📈 STATISTICS & MONITORING  
 */

// Get system statistics
app.get('/stats', async (c) => {
  try {
    const dbStats = scraperDB.getStats();
    const queueStats = await getQueueStats();
    const jobStats = scraperDB.getJobsStats();

    return c.json({
      success: true,
      statistics: {
        database: {
          totalContent: dbStats.contentCount,
          totalJobs: dbStats.jobsCount,
          databaseSize: `${(dbStats.dbSize / 1024 / 1024).toFixed(2)} MB`,
        },
        queue: queueStats,
        jobs: jobStats,
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          version: '1.0.0',
        },
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ Error getting stats:', error);
    return c.json({
      success: false,
      error: 'Failed to get statistics',
    }, 500);
  }
});

/**
 * 🎯 QUICK START ENDPOINTS
 */

// Debug endpoint to check system readiness
app.get('/debug/status', async (c) => {
  try {
    // Check Redis
    const redisHealthy = await testRedisConnection();
    
    // Check Database
    const dbStats = scraperDB.getStats();
    
    // Check Queue
    const queueStats = await getQueueStats();
    
    return c.json({
      timestamp: new Date().toISOString(),
      services: {
        redis: {
          healthy: redisHealthy,
          config: {
            url: process.env.REDIS_URL ? '***AVAILABLE***' : 'NOT_SET',
            host: process.env.REDISHOST || process.env.REDIS_HOST || 'localhost',
            port: process.env.REDISPORT || process.env.REDIS_PORT || '6379',
          }
        },
        database: {
          healthy: true,
          stats: dbStats
        },
        queue: {
          healthy: true,
          stats: queueStats
        }
      },
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT,
        PORT: process.env.PORT,
      }
    });
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace'
    }, 500);
  }
});

// Quick scrape Reddit (for testing)
app.post('/quick/reddit', async (c) => {
  try {
    console.log('🟠 Starting quick Reddit scrape...');
    
    const jobId = await addScrapeJob(
      JobType.SCRAPE_REDDIT,
      { url: 'https://old.reddit.com/r/programming/', pages: 5 },
      5  // High priority
    );

    console.log(`✅ Reddit job created with ID: ${jobId}`);

    // 💾 Create job record in database
    console.log(`💾 Creating database record for job ${jobId}...`);
    const dbRecordId = scraperDB.createScrapeJob({
      job_id: jobId,
      job_type: JobType.SCRAPE_REDDIT,
      status: 'pending',
      started_at: new Date().toISOString(),
    });

    console.log(`💾 Database record created with ID: ${dbRecordId}`);

    return c.json({
      success: true,
      message: 'Quick Reddit scraping started!',
      jobId,
      checkStatus: `/jobs/${jobId}`,
      estimatedTime: '2-3 minutes',
      target: 'r/programming (5 posts)',
    });

  } catch (error) {
    console.error('❌ Error starting quick Reddit scrape:', error);
    console.error('❌ Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace',
    });
    
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start quick Reddit scrape',
      details: error instanceof Error ? error.name : 'Unknown error type',
    }, 500);
  }
});

// Quick scrape quotes (for testing)
app.post('/quick/quotes', async (c) => {
  try {
    console.log('🚀 Starting quick quotes scrape...');
    console.log('📊 Current queue stats before adding job...');
    
    const queueStatsBefore = await getQueueStats();
    console.log('📊 Queue stats:', queueStatsBefore);
    
    const jobId = await addScrapeJob(
      JobType.SCRAPE_QUOTES,
      { url: 'http://quotes.toscrape.com', pages: 2 },
      5  // High priority
    );

    console.log(`✅ Job created with ID: ${jobId}`);

    // 💾 Create job record in database
    console.log(`💾 Creating database record for job ${jobId}...`);
    const dbRecordId = scraperDB.createScrapeJob({
      job_id: jobId,
      job_type: JobType.SCRAPE_QUOTES,
      status: 'pending',
      started_at: new Date().toISOString(),
    });

    console.log(`💾 Database record created with ID: ${dbRecordId}`);

    return c.json({
      success: true,
      message: 'Quick quotes scraping started!',
      jobId,
      checkStatus: `/jobs/${jobId}`,
      estimatedTime: '1-2 minutes',
    });

  } catch (error) {
    console.error('❌ Error starting quick scrape:', error);
    console.error('❌ Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace',
    });
    
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start quick scrape',
      details: error instanceof Error ? error.name : 'Unknown error type',
    }, 500);
  }
});

/**
 * 🎭 START THE SERVER
 */
export default app;

export async function startServer(port: number = 3000): Promise<void> {
  console.log('🚀 Starting Scraper API Server...');
  
  // Initialize database
  await initDatabase();
  console.log('💾 Database initialized');
  
  // Test connections
  const redisHealthy = await testRedisConnection();
  if (!redisHealthy) {
    throw new Error('❌ Redis connection failed! Make sure Redis is running.');
  }
  
  console.log(`🔥 Server starting on http://localhost:${port}`);
  console.log('🎯 API Endpoints:');
  console.log('   GET  / - Welcome & documentation');
  console.log('   GET  /health - Health check');
  console.log('   POST /scrape - Trigger scraping job');
  console.log('   GET  /jobs - List all jobs');
  console.log('   GET  /jobs/:id - Get job status');
  console.log('   GET  /results - Get scraped content');
  console.log('   GET  /stats - System statistics');
  console.log('   POST /quick/quotes - Quick quotes scrape');
  console.log('');
  
  // Start server using Bun's built-in server
  Bun.serve({
    fetch: app.fetch,
    port: port,
  });
  
  console.log(`✅ Scraper API Server running on port ${port}! 🎉`);
}

// Start server if this file is run directly
if (import.meta.main) {
  startServer(3000).catch(console.error);
}

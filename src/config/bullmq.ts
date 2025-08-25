import { Queue, type QueueOptions, type DefaultJobOptions } from 'bullmq';
import { redisConnection } from './redis.js';

/**
 * BULLMQ QUEUE CONFIGURATION
 */

// Job types we support
export enum JobType {
  SCRAPE_QUOTES = 'scrape-quotes',
  SCRAPE_REDDIT = 'scrape-reddit', 
  SCRAPE_TIKTOK = 'scrape-tiktok',
}

// Job data interfaces for type safety
export interface ScrapeJobData {
  type: JobType;
  url?: string;
  pages?: number;
  options?: {
    maxRetries?: number;
    delay?: number;
    priority?: number;
  };
  metadata?: {
    requestId: string;
    timestamp: number;
    userAgent?: string;
  };
}

// Default job options - how jobs behave
const defaultJobOptions: DefaultJobOptions = {
  removeOnComplete: { count: 50 },    // Keep last 50 completed jobs for monitoring
  removeOnFail: { count: 20 },        // Keep last 20 failed jobs for debugging
  attempts: 3,             // Retry failed jobs up to 3 times
  backoff: {
    type: 'exponential',   // Wait longer between retries (1s, 2s, 4s, etc.)
    delay: 2000,           // Start with 2 second delay
  },
};

// Queue configuration
const queueOptions: QueueOptions = {
  connection: redisConnection,
  defaultJobOptions,
};

// Create our main scraping queue
export const scraperQueue = new Queue('scraper-jobs', queueOptions);

/**
 * 🎯 QUEUE HELPER FUNCTIONS
 */

/**
 * Add a scraping job to the queue
 */
export async function addScrapeJob(
  jobType: JobType, 
  data: Partial<ScrapeJobData> = {},
  priority: number = 0
): Promise<string> {
  
  const jobData: ScrapeJobData = {
    type: jobType,
    metadata: {
      requestId: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      userAgent: 'ScraperBot/1.0',
    },
    ...data,
  };

  const job = await scraperQueue.add(
    jobType,
    jobData,
    {
      priority,        // Higher number = higher priority
      delay: data.options?.delay || 0,
    }
  );

  console.log(`📋 Added ${jobType} job to queue with ID: ${job.id}`);
  return job.id!;
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
  const waiting = await scraperQueue.getWaiting();
  const active = await scraperQueue.getActive();
  const completed = await scraperQueue.getCompleted();
  const failed = await scraperQueue.getFailed();

  const stats = {
    waiting: waiting.length,
    active: active.length,
    completed: completed.length,
    failed: failed.length,
    total: waiting.length + active.length + completed.length + failed.length,
  };

  console.log('📊 Queue Stats:', stats);
  return stats;
}

/**
 * Clear all jobs from queue (useful for testing)
 */
export async function clearQueue(): Promise<void> {
  await scraperQueue.obliterate({ force: true });
  console.log('🧹 Queue cleared completely');
}

/**
 * Monitor queue events
 */
export function setupQueueMonitoring(): void {
  // Note: Queue events are different from Worker events
  // For job completion monitoring, use Worker events instead
  // This function sets up basic queue monitoring
  
  scraperQueue.on('error', (err: Error) => {
    console.log(`❌ Queue error:`, err.message);
  });

  console.log('👀 Queue monitoring enabled (basic error tracking)');
}

/**
 * Graceful shutdown
 */
export async function closeScrapeQueue(): Promise<void> {
  await scraperQueue.close();
  console.log('🐂 BullMQ queue closed');
}

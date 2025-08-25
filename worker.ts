/**
 * 🐂 WORKER ENTRY POINT
 * Simple entry point for starting the scraper worker
 */

import { createScraperWorker } from './src/workers/scraper-worker.js';
import { redisConnection } from './src/config/redis.js';
import { getQueueStats } from './src/config/bullmq.js';

async function main(): Promise<void> {
  console.log('🚀 Starting Scraper Worker...\n');
  
  // Test Redis connection
  console.log('🔴 Testing Redis connection...');
  const ping = await redisConnection.ping();
  console.log(`🏓 Redis ping: ${ping}\n`);
  
  // Show initial queue stats
  await getQueueStats();
  
  // Create and start worker
  const worker = createScraperWorker();
  
  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('\n🛑 Shutting down worker gracefully...');
    await worker.close();
    await redisConnection.quit();
    process.exit(0);
  };
  
  // Listen for shutdown signals
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  
  console.log('🎯 Worker is running! Press Ctrl+C to stop.\n');
}

main().catch((error) => {
  console.error('❌ Failed to start worker:', error);
  process.exit(1);
});

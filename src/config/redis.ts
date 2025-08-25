import Redis from 'ioredis';

/**
 * 🔴 REDIS CONNECTION CONFIGURATION
 * 
 * Redis is our message broker - it stores and manages our job queue.
 * Think of it as a super-fast, in-memory database that handles our "to-do list" of scraping jobs.
 */

// Redis connection settings for Railway
const createRedisConnection = () => {
  // Try to use REDIS_URL first (Railway format)
  if (process.env.REDIS_URL) {
    return new Redis(process.env.REDIS_URL, {
      connectTimeout: 60000,
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
  }
  
  // Fallback to individual environment variables
  const host = process.env.REDISHOST || process.env.REDIS_HOST || '127.0.0.1';
  const port = parseInt(process.env.REDISPORT || process.env.REDIS_PORT || '6379');
  const password = process.env.REDISPASSWORD || process.env.REDIS_PASSWORD;
  
  return new Redis({
    host,
    port,
    password,
    connectTimeout: 60000,
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });
};

// Create and export Redis connection
export const redisConnection = createRedisConnection();

// Handle connection events
redisConnection.on('connect', () => {
  console.log('🔴 Connected to Redis successfully!');
});

redisConnection.on('error', (err) => {
  console.error('❌ Redis connection error:', err);
});

redisConnection.on('ready', () => {
  console.log('✅ Redis is ready to accept commands');
});

// Export config for debugging/logging (simplified version)
export const REDIS_CONFIG = {
  host: process.env.REDISHOST || process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDISPORT || process.env.REDIS_PORT || '6379'),
  url: process.env.REDIS_URL || 'localhost:6379',
};

/**
 * Test Redis connection
 */
export async function testRedisConnection(): Promise<boolean> {
  try {
    const result = await redisConnection.ping();
    console.log('🏓 Redis ping result:', result);
    return result === 'PONG';
  } catch (error) {
    console.error('❌ Redis connection test failed:', error);
    return false;
  }
}

/**
 * Graceful shutdown
 */
export async function closeRedisConnection(): Promise<void> {
  await redisConnection.quit();
  console.log('🔴 Redis connection closed');
}

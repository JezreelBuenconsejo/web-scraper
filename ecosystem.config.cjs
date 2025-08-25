/**
 * 🚀 PM2 ECOSYSTEM CONFIGURATION
 * 
 * PM2 manages our application processes:
 * - API Server: Handles HTTP requests and queues scraping jobs
 * - Worker: Processes scraping jobs from the queue
 * - Both restart automatically if they crash
 * - Logs are collected and managed centrally
 */

module.exports = {
  apps: [
    {
      // 🔥 API SERVER PROCESS
      name: 'scraper-api',
      script: 'bun',
      args: ['run', './server.ts'],
      interpreter: 'none',
      instances: 1,              // Run single instance (can scale up later)
      autorestart: true,         // Restart if crashed
      watch: false,              // Don't restart on file changes (set true for development)
      max_memory_restart: '500M', // Restart if uses more than 500MB RAM
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
        WATCH: true,
      },
      // Logging
      out_file: './logs/api-out.log',
      error_file: './logs/api-error.log',
      log_file: './logs/api-combined.log',
      time: true,                // Add timestamps to logs
      
      // Advanced settings
      kill_timeout: 5000,        // Wait 5s before force killing
      listen_timeout: 10000,     // Wait 10s for app to start
      min_uptime: '10s',         // Consider app crashed if exits within 10s
      max_restarts: 5,           // Max restarts within restart_delay period
      restart_delay: 4000,       // Wait 4s between restarts
    },

    {
      // 🐂 SCRAPER WORKER PROCESS  
      name: 'scraper-worker',
      script: 'bun',
      args: ['run', './worker.ts'],
      interpreter: 'none',
      instances: 1,              // Single worker instance
      autorestart: true,         // Restart if crashed
      watch: false,              // Don't restart on file changes
      max_memory_restart: '1G',  // Workers may use more memory (browsers!)
      env: {
        NODE_ENV: 'production',
        WORKER_CONCURRENCY: 2,   // Process 2 jobs simultaneously
      },
      env_development: {
        NODE_ENV: 'development', 
        WORKER_CONCURRENCY: 1,   // Single job in development
      },
      // Logging
      out_file: './logs/worker-out.log',
      error_file: './logs/worker-error.log', 
      log_file: './logs/worker-combined.log',
      time: true,                // Add timestamps to logs
      
      // Advanced settings
      kill_timeout: 30000,       // Wait 30s before force killing (scraping takes time)
      listen_timeout: 15000,     // Wait 15s for worker to start
      min_uptime: '10s',         // Consider app crashed if exits within 10s
      max_restarts: 3,           // Fewer restarts for worker
      restart_delay: 10000,      // Wait 10s between restarts (give it time)
    }
  ],

  // 📊 DEPLOYMENT CONFIGURATION (for production)
  deploy: {
    production: {
      user: 'scraper',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:JezreelBuenconsejo/web-scraper.git',
      path: '/var/www/scraper-script',
      'pre-deploy-local': '',
      'post-deploy': 'bun install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};

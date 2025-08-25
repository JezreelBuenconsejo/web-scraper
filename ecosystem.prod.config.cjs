/**
 * 🚀 PM2 PRODUCTION DEPLOYMENT CONFIGURATION
 * 
 * PM2 manages our application processes:
 * - API Server: Handles HTTP requests and queues scraping jobs
 * - Worker: Processes scraping jobs from the queue
 * - Both restart automatically if they crash
 * - Logs are collected and managed centrally
 * 
 */

module.exports = {
  apps: [
    {
      // 🔥 API SERVER PROCESS (PRODUCTION)
      name: 'scraper-api-prod',
      script: './dist/server.js',    // Compiled JavaScript
      interpreter: 'bun',           // Use Bun to run JS files
      instances: 2,                 // Run 2 instances for load balancing
      exec_mode: 'cluster',         // Cluster mode for better performance
      autorestart: true,
      watch: false,                 // No file watching in production
      max_memory_restart: '512M',   // Restart if memory exceeds 512MB
      node_args: '--max-old-space-size=512',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // Production logging
      out_file: './logs/api-prod-out.log',
      error_file: './logs/api-prod-error.log',
      log_file: './logs/api-prod-combined.log',
      time: true,
      
      // Production settings
      kill_timeout: 5000,
      listen_timeout: 10000,
      min_uptime: '10s',
      max_restarts: 3,
      restart_delay: 5000,
    },

    {
      // 🐂 SCRAPER WORKER PROCESS (PRODUCTION)
      name: 'scraper-worker-prod',
      script: './dist/worker.js',   // Compiled JavaScript
      interpreter: 'bun',
      instances: 1,                 // Single worker instance
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',     // Workers need more memory for browsers
      env: {
        NODE_ENV: 'production',
        WORKER_CONCURRENCY: 3,      // Process 3 jobs simultaneously in prod
      },
      // Production logging
      out_file: './logs/worker-prod-out.log',
      error_file: './logs/worker-prod-error.log',
      log_file: './logs/worker-prod-combined.log',
      time: true,
      
      // Worker-specific settings
      kill_timeout: 60000,          // Give workers time to finish jobs
      listen_timeout: 15000,
      min_uptime: '10s',
      max_restarts: 2,              // Fewer restarts for workers
      restart_delay: 10000,
    }
  ],

  // 📊 PRODUCTION DEPLOYMENT CONFIGURATION
  deploy: {
    production: {
      user: 'scraper',
      host: ['your-server.com'],
      ref: 'origin/main',
      repo: 'git@https://github.com/JezreelBuenconsejo/web-scraper.git',
      path: '/var/www/scraper-script',
      'pre-deploy-local': '',
      'post-deploy': 'bun install && bun run build && pm2 reload ecosystem.prod.config.cjs --env production',
      'pre-setup': ''
    }
  }
};

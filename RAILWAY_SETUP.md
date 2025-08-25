# Railway Deployment Setup Guide

## Redis Configuration

Your app has been updated to work with Railway's Redis service. Follow these steps to set up Redis:

### 1. Add Redis Service to Your Railway Project

1. Go to your Railway project dashboard
2. Click "New Service" → "Database" → "Add Redis"
3. Railway will automatically provision a Redis instance and provide environment variables

### 2. Environment Variables

Railway will automatically set these environment variables when you add Redis:
- `REDIS_URL` - Complete Redis connection string (preferred)
- `REDISHOST` - Redis hostname
- `REDISPORT` - Redis port (usually 6379)
- `REDISPASSWORD` - Redis password

### 3. Your App Configuration

✅ **Already Done**: Your Redis configuration has been updated to automatically:
- Use `REDIS_URL` if available (Railway's preferred method)
- Fall back to individual environment variables (`REDISHOST`, `REDISPORT`, `REDISPASSWORD`)
- Use localhost for local development

### 4. Deploy

Once you've added the Redis service to your Railway project, redeploy your application:

```bash
# Your app will automatically connect to Redis using Railway's environment variables
```

### 5. Verify Connection

Check your Railway deployment logs for these messages:
- ✅ `Connected to Redis successfully!`
- ✅ `Redis is ready to accept commands`

If you see connection errors, ensure the Redis service is running in your Railway project.

### Troubleshooting

**Still getting ECONNREFUSED?**
1. Verify Redis service is added to your Railway project
2. Check that both your server and worker services are in the same Railway project
3. Ensure the Redis service is healthy (check Railway dashboard)
4. Look for any network policy restrictions

**Local Development**
For local development, ensure you have Redis running:
```bash
# Install Redis locally or use Docker
docker run -d -p 6379:6379 redis:alpine
```

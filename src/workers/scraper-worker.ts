import { Worker, Job } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { JobType, type ScrapeJobData, getQueueStats } from '../config/bullmq.js';
import { QuotesScraper } from '../scrapers/quotes-scraper.js';
import { RedditScraper } from '../scrapers/reddit-scraper.js';
import { SimpleTikTokScraper } from '../scrapers/tiktok-scraper.js';
import { scraperDB } from '../database/database.js';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

// Ensure data directory exists
async function ensureDataDirectory(): Promise<void> {
  try {
    await mkdir('./data', { recursive: true });
  } catch (error) {
    // Directory already exists, ignore error
  }
}

/**
 *  PROCESS QUOTES SCRAPING JOB
 */
async function processQuotesJob(job: Job<ScrapeJobData>): Promise<any> {
  console.log(`🎭 Processing quotes scraping job ${job.id}...`);
  
  // Update job progress
  await job.updateProgress(10);
  
  const scraper = new QuotesScraper();
  
  try {
    // Initialize the scraper
    await scraper.init();
    await job.updateProgress(25);
    
    // Extract job parameters
    const { url = 'http://quotes.toscrape.com', pages = 3 } = job.data;
    
    console.log(`📄 Scraping ${pages} pages from ${url}...`);
    
    // Scrape the quotes
    const quotes = await scraper.scrapeAllPages(url, pages);
    await job.updateProgress(75);
    
    // Convert to markdown
    const markdown = scraper.formatAsMarkdown(quotes);
    await job.updateProgress(90);
    
    // Ensure data directory exists
    await ensureDataDirectory();
    
    // Save to file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `quotes-${timestamp}.md`;
    const filepath = path.join('./data', filename);
    
    await writeFile(filepath, markdown);
    await job.updateProgress(95);
    
    // 💾 Save to database
    console.log('💾 Saving scraped data to database...');
    const contentId = scraperDB.saveScrapedContent({
      source: 'quotes',
      url: url,
      title: `${quotes.length} Quotes Scraped`,
      content: markdown,
      raw_data: JSON.stringify(quotes),
      scraped_at: new Date().toISOString(),
      metadata: JSON.stringify({
        quotesCount: quotes.length,
        pages: pages,
        scrapeTime: new Date().toISOString(),
      }),
    });
    
    // Update job status in database
    scraperDB.updateScrapeJob(job.id!, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      result_data: JSON.stringify({
        success: true,
        quotesCount: quotes.length,
        contentId: contentId,
        filepath,
      }),
    });
    
    await job.updateProgress(100);
    
    console.log(`✅ Quotes job ${job.id} completed! Saved to: ${filepath} & database ID: ${contentId}`);
    
    return {
      success: true,
      quotesCount: quotes.length,
      contentId: contentId,
      filepath,
      scrapeTime: new Date().toISOString(),
    };
    
  } catch (error) {
    console.error(`❌ Error in quotes job ${job.id}:`, error);
    throw error;
  } finally {
    // Always clean up
    await scraper.close();
  }
}

/**
 * PROCESS REDDIT SCRAPING JOB
 */
async function processRedditJob(job: Job<ScrapeJobData>): Promise<any> {
  const { url, pages, options } = job.data;
  console.log(`🟠 Processing reddit scraping job ${job.id}...`);
  console.log(`📋 Job data:`, {
    type: job.data.type,
    url: url || 'https://old.reddit.com/r/programming',
    pages: pages || 10,
    requestId: job.data.metadata?.requestId,
  });

  const scraper = new RedditScraper();
  
  try {
    await job.updateProgress(10);
    
    // Initialize browser
    console.log('🚀 Initializing Reddit scraper...');
    await scraper.init();
    await job.updateProgress(30);
    
    // Extract subreddit from URL or use default
    const subredditMatch = (url || 'https://old.reddit.com/r/programming').match(/\/r\/([^\/\?#]+)/);
    const subredditName = subredditMatch?.[1] || 'programming';
    console.log(`🎯 Targeting subreddit: r/${subredditName}`);
    
    // Navigate to subreddit
    console.log('🔗 Navigating to subreddit...');
    await scraper.navigateToSubreddit(subredditName);
    await job.updateProgress(50);
    
    // Extract posts
    console.log('🔍 Extracting Reddit posts...');
    const maxPosts = pages || 10;
    const posts = await scraper.extractPosts(subredditName, maxPosts);
    await job.updateProgress(80);
    
    if (posts.length === 0) {
      throw new Error('No posts found - subreddit might be empty or private');
    }
    
    console.log(`✅ Successfully scraped ${posts.length} posts from r/${subredditName}`);
    
    // Store each post in database
    console.log('💾 Storing posts in database...');
    let storedCount = 0;
    
    for (const post of posts) {
      try {
        scraperDB.saveScrapedContent({
          source: 'reddit',
          url: post.url,
          title: post.title,
          content: `**Author:** u/${post.author}\n**Upvotes:** ${post.upvotes}\n**Comments:** ${post.comments}\n**Type:** ${post.postType}\n\n${post.content || 'No content'}`,
          raw_data: JSON.stringify(post),
          scraped_at: new Date().toISOString(),
          metadata: JSON.stringify({
            subreddit: post.subreddit,
            postType: post.postType,
            upvotes: post.upvotes,
            comments: post.comments,
            author: post.author,
            created: post.created,
            linkUrl: post.linkUrl
          })
        });
        storedCount++;
      } catch (error) {
        console.warn(`⚠️ Failed to store post ${post.id}:`, error);
        // Continue storing other posts
      }
    }
    
    await job.updateProgress(100);
    
    const result = {
      success: true,
      postsExtracted: posts.length,
      postsStored: storedCount,
      subreddit: subredditName,
      summary: {
        totalPosts: posts.length,
        postTypes: posts.reduce((acc: any, post) => {
          acc[post.postType] = (acc[post.postType] || 0) + 1;
          return acc;
        }, {}),
        topPost: posts[0] ? {
          title: posts[0].title,
          author: posts[0].author,
          upvotes: posts[0].upvotes,
          comments: posts[0].comments
        } : null
      },
      message: `Successfully scraped ${posts.length} posts from r/${subredditName}`,
    };
    
    // Update job status in database
    scraperDB.updateScrapeJob(job.id!, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      result_data: JSON.stringify(result)
    });

    console.log(`🎉 Reddit scraping job ${job.id} completed!`);
    console.log(`📊 Final stats: ${storedCount}/${posts.length} posts stored`);
    
    return result;
    
  } catch (error) {
    console.error(`❌ Error in reddit job ${job.id}:`, error);
    
    // Update job status to failed in database
    scraperDB.updateScrapeJob(job.id!, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: error instanceof Error ? error.message : String(error)
    });
    
    throw error; // BullMQ will handle job failure
  } finally {
    // Always clean up browser
    await scraper.close();
  }
}

async function processTikTokJob(job: Job<ScrapeJobData>): Promise<any> {
  const { pages, options } = job.data;
  console.log(`🎬 Processing TikTok DATA EXTRACTION job ${job.id}...`);
  console.log(`📋 Job data:`, {
    type: job.data.type,
    strategy: 'REAL DATA (Videos, Profiles, Categories)',
    maxItems: pages || 20,
    requestId: job.data.metadata?.requestId,
  });

  const scraper = new SimpleTikTokScraper();
  
  try {
    await job.updateProgress(10);
    
    // Initialize simple browser
    console.log('🚀 Initializing Simple TikTok scraper...');
    await scraper.init();
    await job.updateProgress(30);
    
    console.log(`🎯 Target: TikTok explore/discover pages for real data extraction`);
    
    // Navigate to TikTok (tries multiple URLs)
    console.log('🔗 Navigating to TikTok pages...');
    const successfulUrl = await scraper.navigateToTikTok();
    console.log(`✅ Using: ${successfulUrl}`);
    await job.updateProgress(50);
    
    // Extract real TikTok data
    console.log('🔍 Extracting TikTok data (videos, profiles, categories)...');
    const data = await scraper.extractTikTokData();
    await job.updateProgress(80);
    
    if (data.length === 0) {
      console.warn('⚠️ No data extracted - TikTok might be showing different content');
      // Don't throw error, return partial success
    }
    
    console.log(`✅ Successfully extracted ${data.length} TikTok data items`);
    
    // Store each data item in database
    console.log('💾 Storing TikTok data in database...');
    let storedCount = 0;
    
    for (const item of data) {
      try {
        let title = '';
        let content = '';
        
        switch (item.type) {
          case 'video':
            title = `TikTok Video: ${item.name}`;
            content = `**Type:** Video\n**Video ID:** ${item.name}\n**Views/Info:** ${item.text || 'N/A'}\n**URL:** ${item.url}\n\nExtracted from TikTok explore page`;
            break;
          case 'profile':
            title = `TikTok Profile: @${item.name}`;
            content = `**Type:** Profile\n**Username:** ${item.name}\n**Info:** ${item.text || 'N/A'}\n**URL:** ${item.url}\n\nTikTok creator profile`;
            break;
          case 'category':
            title = `TikTok Category: ${item.name}`;
            content = `**Type:** Category\n**Name:** ${item.name}\n**Description:** ${item.text || 'TikTok content category'}\n**URL:** ${item.url}\n\nContent category from TikTok explore`;
            break;
        }
        
        scraperDB.saveScrapedContent({
          source: 'tiktok',
          url: item.url,
          title: title,
          content: content,
          raw_data: JSON.stringify(item),
          scraped_at: new Date().toISOString(),
          metadata: JSON.stringify({
            type: item.type,
            name: item.name,
            text: item.text,
            scrapedAt: item.scrapedAt,
            extractedFrom: successfulUrl
          })
        });
        storedCount++;
      } catch (error) {
        console.warn(`⚠️ Failed to store ${item.type} ${item.name}:`, error);
        // Continue storing other items
      }
    }
    
    await job.updateProgress(100);
    
    // Calculate data summary
    const videos = data.filter(d => d.type === 'video');
    const profiles = data.filter(d => d.type === 'profile');  
    const categories = data.filter(d => d.type === 'category');
    
    const result = {
      success: true,
      dataExtracted: data.length,
      dataStored: storedCount,
      extraction: {
        totalItems: data.length,
        videos: videos.length,
        profiles: profiles.length,
        categories: categories.length,
        sourceUrl: successfulUrl,
        topVideo: videos[0] ? {
          id: videos[0].name,
          views: videos[0].text,
          url: videos[0].url
        } : null,
        topProfile: profiles[0] ? {
          username: profiles[0].name,
          info: profiles[0].text,
          url: profiles[0].url
        } : null,
      },
      message: data.length > 0 ? 
        `Successfully extracted ${data.length} TikTok items (${videos.length} videos, ${profiles.length} profiles, ${categories.length} categories)` : 
        `Connected to TikTok but no data extracted (page structure may have changed)`,
    };
    
    // Update job status in database
    scraperDB.updateScrapeJob(job.id!, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      result_data: JSON.stringify(result)
    });

    console.log(`🎉 TikTok DATA EXTRACTION job ${job.id} completed!`);
    console.log(`📊 Data gathered: ${storedCount}/${data.length} items stored`);
    console.log(`💰 Business value: HIGH - Real TikTok content intelligence!`);
    console.log(`🎬 Videos: ${videos.length}, 👤 Profiles: ${profiles.length}, 🏷️ Categories: ${categories.length}`);
    if (videos.length > 0) console.log(`🔥 Top video: ${videos[0]?.name} (${videos[0]?.text || 'no info'})`);
    
    return result;
    
  } catch (error) {
    console.error(`❌ Error in TikTok data extraction job ${job.id}:`, error);
    
    // Update job status to failed in database
    scraperDB.updateScrapeJob(job.id!, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: error instanceof Error ? error.message : String(error)
    });
    
    throw error; // BullMQ will handle job failure
  } finally {
    // Always clean up browser
    await scraper.close();
  }
}

/**
 * MAIN JOB PROCESSOR
 * Routes different job types to their appropriate handlers
 */
async function processScrapeJob(job: Job<ScrapeJobData>): Promise<any> {
  console.log(`\n🚀 Starting job ${job.id} (${job.data.type})...`);
  console.log(`📋 Job data:`, {
    type: job.data.type,
    url: job.data.url,
    pages: job.data.pages,
    requestId: job.data.metadata?.requestId,
  });
  
  const startTime = Date.now();
  
  try {
    let result;
    
    // Route to appropriate scraper based on job type
    switch (job.data.type) {
      case JobType.SCRAPE_QUOTES:
        result = await processQuotesJob(job);
        break;
        
      case JobType.SCRAPE_REDDIT:
        result = await processRedditJob(job);
        break;
        
      case JobType.SCRAPE_TIKTOK:
        result = await processTikTokJob(job);
        break;
        
      default:
        throw new Error(`Unknown job type: ${job.data.type}`);
    }
    
    const duration = Date.now() - startTime;
    console.log(`✅ Job ${job.id} completed in ${duration}ms`);
    
    return {
      ...result,
      duration,
      jobId: job.id,
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Job ${job.id} failed after ${duration}ms:`, error);
    throw error;
  }
}

/**
 * CREATE AND START THE WORKER
 */
export function createScraperWorker(): Worker {
  const worker = new Worker(
    'scraper-jobs',           // Queue name (must match queue)
    processScrapeJob,         // Job processor function
    {
      connection: redisConnection,
      concurrency: 2,         // Process up to 2 jobs simultaneously
      removeOnComplete: { count: 50 },   // Keep 50 completed jobs
      removeOnFail: { count: 20 },       // Keep 20 failed jobs for debugging
    }
  );

  // Worker event handlers
  worker.on('ready', () => {
    console.log('🏭 Scraper worker is ready and waiting for jobs!');
  });

  worker.on('active', (job) => {
    console.log(`🔄 Worker started processing job ${job.id} (${job.name})`);
  });

  worker.on('completed', (job, result) => {
    console.log(`🎉 Worker completed job ${job.id} with result:`, result);
  });

  worker.on('failed', (job, err) => {
    console.log(`💥 Worker failed to process job ${job?.id}:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('⚠️  Worker error:', err);
  });

  return worker;
}

/**
 * MAIN FUNCTION - Run the worker
 */
async function main(): Promise<void> {
  console.log('🚀 Starting Scraper Worker...\n');
  
  // Initialize database
  console.log('💾 Initializing database...');
  await scraperDB.init();
  
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

// Run worker if this file is executed directly
if (import.meta.main) {
  main().catch(console.error);
}

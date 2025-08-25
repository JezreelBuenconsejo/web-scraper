import { chromium, type Browser, type Page } from 'playwright';

/**
 *  REDDIT SCRAPER - Learn Reddit Scraping Fundamentals!
 * 
 * Reddit is more complex than the quotes site because:
 * 1. Dynamic content loading (JavaScript-heavy)
 * 2. Anti-bot detection systems
 * 3. Rich post data (votes, comments, different post types)
 * 
 */

// Define the structure of a Reddit post
export interface RedditPost {
  id: string;           // Reddit's unique post ID
  title: string;        // Post title
  author: string;       // Username who posted
  subreddit: string;    // Which subreddit (e.g., "programming")
  upvotes: number;      // Score/upvotes
  comments: number;     // Number of comments
  created: string;      // When it was posted
  url: string;          // Link to the post
  postType: 'text' | 'link' | 'image' | 'video'; // Type of post
  content?: string;     // Text content (for text posts)
  linkUrl?: string;     // External URL (for link posts)
}

export class RedditScraper {
  private browser: Browser | null = null;
  private page: Page | null = null;
  
  /**
   * Initialize the browser with enhanced Reddit-friendly settings
   */
  async init(): Promise<void> {
    console.log('🟠 Launching browser for Reddit scraping...');
    
    // Use production-friendly settings (headless on Railway, headed locally)
    const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT === 'production';
    
    this.browser = await chromium.launch({
      headless: isProduction,
      slowMo: isProduction ? 0 : 500, // Slower actions to appear more human
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        // Enhanced anti-detection measures
        '--disable-blink-features=AutomationControlled',
        '--exclude-switches=enable-automation',
        '--disable-extensions',
        '--disable-default-apps',
        '--disable-component-extensions-with-background-pages'
      ]
      // Note: Removed --user-data-dir from args - Playwright wants this as a separate parameter
    });
    
    this.page = await this.browser.newPage();
    
    // Enhanced browser disguise - set user agent when creating new page
    await this.page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    await this.page.setViewportSize({ width: 1366, height: 768 }); // Common screen size
    
    // Remove webdriver property (key bot detection)
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });
    
    // Add realistic browser properties
    await this.page.addInitScript(() => {
      // Override the plugins property to use a custom getter
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });
      
      // Override the languages property
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en']
      });
    });
    
    console.log(`✅ Reddit scraper browser ready! (${isProduction ? 'headless' : 'headed'} mode)`);
  }

  /**
   * Navigate to a subreddit with smart fallback strategies
   */
  async navigateToSubreddit(subredditName: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not initialized. Call init() first.');
    }

    // Clean the subreddit name (remove r/ if user includes it)
    const cleanSubreddit = subredditName.replace(/^r\//, '');
    
    // Try multiple URL formats - start with old.reddit (more scraper-friendly)
    const urlsToTry = [
      `https://old.reddit.com/r/${cleanSubreddit}/`,  // Old Reddit - usually works better
      `https://www.reddit.com/r/${cleanSubreddit}/`,  // New Reddit - has anti-bot measures
    ];
    
    let lastError: Error | null = null;
    
    for (let i = 0; i < urlsToTry.length; i++) {
      const url = urlsToTry[i];
      console.log(`🔗 Attempt ${i + 1}: Navigating to ${url}`);
      
      try {
        // Add human-like delay before navigation
        if (this.page && url) {
          await this.page.waitForTimeout(1000 + Math.random() * 2000);
          
          // Navigate with more flexible wait strategy
          await this.page.goto(url, { 
            waitUntil: 'domcontentloaded', // Less strict than 'networkidle'
            timeout: 15000  // Shorter timeout, we'll retry
          });
        }
        
        // Wait a bit for dynamic content
        if (this.page) {
          await this.page.waitForTimeout(3000);
        }
        
        // Try to detect if we successfully loaded Reddit content
        const isLoaded = await this.detectRedditContent();
        
        if (isLoaded) {
          console.log(`✅ Successfully loaded r/${cleanSubreddit} using ${url && url.includes('old.') ? 'old' : 'new'} Reddit`);
          return; // Success! Exit the retry loop
        } else {
          throw new Error('Reddit content not detected on page');
        }
        
      } catch (error) {
        console.log(`⚠️  Attempt ${i + 1} failed: ${error instanceof Error ? error.message : String(error)}`);
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // If this isn't the last URL to try, continue
        if (i < urlsToTry.length - 1) {
          console.log('🔄 Trying next URL format...');
          continue;
        }
      }
    }
    
    // If we get here, all attempts failed
    console.error(`❌ All navigation attempts failed for r/${cleanSubreddit}`);
    throw new Error(`Could not access r/${cleanSubreddit}. ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Detect if we successfully loaded Reddit content (vs error/block page)
   */
  private async detectRedditContent(): Promise<boolean> {
    if (!this.page) return false;
    
    try {
      // Look for various Reddit-specific elements (old and new Reddit)
      const redditIndicators = [
        '.Post',           // Old Reddit post class
        '[data-testid="post-container"]', // New Reddit post container
        '.thing',          // Old Reddit generic post class
        '.entry',          // Old Reddit post entry
        '#siteTable',      // Old Reddit main content
        '.Content',        // New Reddit content area
      ];
      
      // Check if any Reddit-specific elements exist
      for (const selector of redditIndicators) {
        const element = await this.page.$(selector);
        if (element) {
          console.log(`✅ Reddit content detected: found ${selector}`);
          return true;
        }
      }
      
      // Also check page title
      const title = await this.page.title();
      if (title && title.toLowerCase().includes('reddit')) {
        console.log(`✅ Reddit content detected: title contains "reddit"`);
        return true;
      }
      
      console.log('❌ No Reddit content detected on page');
      return false;
      
    } catch (error) {
      console.log('❌ Error detecting Reddit content:', error);
      return false;
    }
  }

  /**
   * Extract real post data from the current Reddit page
   * This is where the magic happens - parsing the DOM!
   */
  async extractPosts(subredditName: string, maxPosts: number = 10): Promise<RedditPost[]> {
    if (!this.page) {
      throw new Error('Page not loaded. Call navigateToSubreddit() first.');
    }

    console.log(`🔍 Extracting up to ${maxPosts} posts from r/${subredditName}...`);

    try {
      // Use page.$$eval to extract data from all post elements
      // This runs JavaScript in the browser to scrape the DOM
      const posts = await this.page.$$eval('.thing', (postElements: any, args: { subredditName: string, maxPosts: number }) => {
        const extractedPosts: any[] = [];
        const { subredditName, maxPosts } = args;
        
        // Loop through each post element (up to maxPosts)
        for (let i = 0; i < Math.min(postElements.length, maxPosts); i++) {
          const postEl = postElements[i];
          
          try {
            // Extract post ID from the element's ID attribute
            const id = postEl.id.replace('thing_', '') || `post_${i}`;
            
            // Extract title and URL
            const titleElement = postEl.querySelector('.title a.title, .title a[data-event-action="title"]');
            const title = titleElement?.textContent?.trim() || 'No title';
            const linkUrl = titleElement?.getAttribute('href') || '';
            
            // Extract author
            const authorElement = postEl.querySelector('.author');
            const author = authorElement?.textContent?.trim() || 'unknown';
            
            // Extract upvotes/score
            const scoreElement = postEl.querySelector('.score.unvoted, .score');
            const upvoteText = scoreElement?.textContent?.trim() || '0';
            const upvotes = upvoteText === '•' ? 0 : parseInt(upvoteText.replace(/[^\d-]/g, '')) || 0;
            
            // Extract comment count
            const commentsElement = postEl.querySelector('.comments');
            const commentsText = commentsElement?.textContent?.trim() || '0 comments';
            const comments = parseInt(commentsText.match(/(\d+)/)?.[1] || '0');
            
            // Extract post time
            const timeElement = postEl.querySelector('time, .live-timestamp');
            const created = timeElement?.getAttribute('datetime') || new Date().toISOString();
            
            // Determine post type and content
            let postType: 'text' | 'link' | 'image' | 'video' = 'text';
            let content = '';
            
            // Check if it's an external link
            if (linkUrl && !linkUrl.startsWith('/r/') && !linkUrl.startsWith('/') && linkUrl.includes('http')) {
              postType = 'link';
            }
            
            // Check for image posts
            if (linkUrl.includes('i.redd.it') || linkUrl.includes('imgur.com') || postEl.querySelector('.thumbnail img')) {
              postType = 'image';
            }
            
            // Check for video posts
            if (linkUrl.includes('v.redd.it') || linkUrl.includes('youtube.com') || linkUrl.includes('youtu.be')) {
              postType = 'video';
            }
            
            // Extract text content if it's a text post
            const textElement = postEl.querySelector('.usertext .md');
            if (textElement && postType === 'text') {
              content = textElement.textContent?.trim() || '';
            }
            
            // Build the full Reddit URL
            const postUrl = linkUrl.startsWith('http') ? linkUrl : `https://old.reddit.com${linkUrl}`;
            
            extractedPosts.push({
              id,
              title,
              author,
              subreddit: subredditName,
              upvotes,
              comments,
              created,
              url: postUrl,
              postType,
              content: content || undefined,
              linkUrl: postType === 'link' ? linkUrl : undefined
            });
            
          } catch (error) {
            console.log(`⚠️ Error parsing post ${i}:`, error);
            // Continue with next post instead of failing completely
          }
        }
        
        return extractedPosts;
      }, { subredditName, maxPosts });

      console.log(`📊 Successfully extracted ${posts.length} real Reddit posts!`);
      
      // Log some details about what we found
      if (posts.length > 0) {
        const postTypes = posts.reduce((acc: any, post) => {
          acc[post.postType] = (acc[post.postType] || 0) + 1;
          return acc;
        }, {});
        console.log(`📈 Post types found:`, postTypes);
      }
      
      return posts as RedditPost[];
      
    } catch (error) {
      console.error('❌ Error extracting posts:', error);
      
      // Fallback: return at least some basic info if extraction fails
      console.log('🔄 Attempting fallback extraction...');
      return await this.fallbackExtraction(subredditName, maxPosts);
    }
  }

  /**
   * Fallback extraction method if main parsing fails
   */
  private async fallbackExtraction(subredditName: string, maxPosts: number): Promise<RedditPost[]> {
    if (!this.page) return [];
    
    try {
      // Simple extraction - just titles
      const titles = await this.page.$$eval('.thing .title a', (elements: any) => {
        return elements.slice(0, 5).map((el: any, index: number) => ({
          id: `fallback_${index}`,
          title: el.textContent?.trim() || 'No title',
          author: 'unknown',
          subreddit: 'unknown',
          upvotes: 0,
          comments: 0,
          created: new Date().toISOString(),
          url: el.getAttribute('href') || '',
          postType: 'text' as const
        }));
      });
      
      console.log(`📊 Fallback extraction found ${titles.length} posts`);
      return titles;
      
    } catch (error) {
      console.error('❌ Even fallback extraction failed:', error);
      return [];
    }
  }

  /**
   * Clean up - close the browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      console.log('🟠 Reddit scraper browser closed');
    }
  }
}

/**
 * TEST FUNCTION - Let's test our basic Reddit scraper!
 */
export async function testRedditScraper(): Promise<void> {
  const scraper = new RedditScraper();
  
  try {
    // Initialize the browser
    await scraper.init();
    
    // Try a smaller, less guarded subreddit for testing
    // (smaller subreddits often have less aggressive anti-bot measures)
    const testSubreddits = ['test', 'programming', 'webdev']; // Try in order
    let successfulSubreddit = '';
    
    for (const subreddit of testSubreddits) {
      try {
        console.log(`🧪 Testing with r/${subreddit}...`);
        await scraper.navigateToSubreddit(subreddit);
        successfulSubreddit = subreddit;
        break; // Success! Stop trying other subreddits
      } catch (error) {
        console.log(`⚠️  r/${subreddit} failed, trying next...`);
        continue;
      }
    }
    
    if (!successfulSubreddit) {
      throw new Error('All test subreddits failed to load');
    }
    
    // Extract some posts from the successful subreddit
    const posts = await scraper.extractPosts(successfulSubreddit, 5);
    
    console.log('\n🎉 REDDIT SCRAPING TEST COMPLETE!');
    console.log(`📊 Total posts extracted: ${posts.length}`);
    
    // Show the first post as an example
    if (posts.length > 0 && posts[0]) {
      console.log('\n📝 Sample post:');
      console.log(`Title: ${posts[0].title}`);
      console.log(`Author: u/${posts[0].author}`);
      console.log(`Upvotes: ${posts[0].upvotes} | Comments: ${posts[0].comments}`);
    }
    
  } catch (error) {
    console.error('❌ Error during Reddit scraping test:', error);
  } finally {
    // Always clean up
    await scraper.close();
  }
}

// If this file is run directly, execute the test
if (import.meta.main) {
  console.log('🟠 Testing Reddit Scraper...\n');
  testRedditScraper();
}

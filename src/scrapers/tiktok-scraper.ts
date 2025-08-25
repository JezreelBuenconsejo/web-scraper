import { chromium, type Browser, type Page } from 'playwright';

/**
 * SIMPLE TIKTOK SCRAPER - Extract the easiest data possible!
 * 
 * Strategy: Just grab hashtag links from TikTok discover page
 * - No complex parsing
 * - No anti-bot warfare
 * - Just simple, reliable hashtag extraction
 */

// Simple TikTok data interface - extract what's actually available!
export interface TikTokData {
  type: 'video' | 'profile' | 'category';
  name: string;           // video ID, username, or category name
  url: string;           // full TikTok URL
  text?: string;         // associated text (like view count)
  scrapedAt: string;     // when we scraped it
}

export class SimpleTikTokScraper {
  private browser: Browser | null = null;
  private page: Page | null = null;

  /**
   * Initialize browser - keep it simple
   */
  async init(): Promise<void> {
    console.log('🚀 Starting simple TikTok hashtag scraper...');
    
    // Simple browser setup - no fancy stealth mode
    this.browser = await chromium.launch({
      headless: false,  // Keep visible for debugging
    });
    
    this.page = await this.browser.newPage();
    
    // Basic mobile viewport (TikTok is mobile-first)
    await this.page.setViewportSize({ width: 375, height: 812 });
    
  }

  /**
   * Navigate to TikTok pages - try multiple URLs to find actual content
   */
  async navigateToTikTok(): Promise<string> {
    if (!this.page) {
      throw new Error('Browser not initialized. Call init() first.');
    }

    const urlsToTry = [
      'https://www.tiktok.com/explore',        // Explore page
      'https://www.tiktok.com/tag/fyp',        // Direct hashtag page  
      'https://www.tiktok.com/tag/viral',      // Another hashtag
      'https://www.tiktok.com/discover',       // Original discover
      'https://www.tiktok.com/'                // Homepage
    ];

    for (const url of urlsToTry) {
      try {
        console.log(`Trying: ${url}...`);
        
        await this.page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        
        // Wait longer for dynamic content
        await this.page.waitForTimeout(5000);
        
        // Check if this page has any useful content
        const hasContent = await this.page.evaluate(() => {
          const links = document.querySelectorAll('a').length;
          const bodyLength = document.body.innerText.length;
          const hasHashtags = document.body.innerText.includes('#');
          const hasTagLinks = document.querySelectorAll('a[href*="/tag/"]').length > 0;
          
          return {
            totalLinks: links,
            bodyLength: bodyLength,
            hasHashtags: hasHashtags,
            hasTagLinks: hasTagLinks,
            useful: links > 20 || bodyLength > 100 || hasHashtags || hasTagLinks
          };
        });
        
        console.log(`📊 Content check for ${url}:`, hasContent);
        
        if (hasContent.useful) {
          console.log(`✅ Found useful content at: ${url}`);
          return url;
        }
        
      } catch (error: any) {
        console.log(`❌ Failed to load ${url}:`, error.message);
        continue;
      }
    }
    
    throw new Error('All TikTok URLs failed to load useful content');
  }

  /**
   * Debug what's actually on the page
   */
  async debugPageContent(): Promise<void> {
    if (!this.page) return;

    console.log('🔍 DEBUGGING: Analyzing TikTok discover page...');
    
    const pageInfo = await this.page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        totalLinks: document.querySelectorAll('a').length,
        tagLinks: document.querySelectorAll('a[href*="/tag/"]').length,
        hashtagLinks: document.querySelectorAll('a[href*="hashtag"]').length,
        allLinksWithTag: Array.from(document.querySelectorAll('a')).map(a => a.href).filter(href => href && (href.includes('/tag/') || href.includes('hashtag'))),
        sampleLinks: Array.from(document.querySelectorAll('a')).slice(0, 10).map(a => ({
          href: a.href,
          text: a.textContent?.substring(0, 50)
        })),
        bodyText: document.body.innerText.substring(0, 500),
        hasHashtagText: document.body.innerText.includes('#'),
        hashtagsInText: (document.body.innerText.match(/#[a-zA-Z0-9_]+/g) || []).slice(0, 10)
      };
    });

    console.log('📊 PAGE ANALYSIS:', {
      title: pageInfo.title,
      url: pageInfo.url,
      totalLinks: pageInfo.totalLinks,
      tagLinks: pageInfo.tagLinks,
      hashtagLinks: pageInfo.hashtagLinks,
      linksWithTag: pageInfo.allLinksWithTag,
      hasHashtagText: pageInfo.hasHashtagText,
      hashtagsInText: pageInfo.hashtagsInText
    });
    
    console.log('📝 SAMPLE LINKS:', pageInfo.sampleLinks);
    console.log('📄 PAGE TEXT PREVIEW:', pageInfo.bodyText.substring(0, 200) + '...');
  }

  /**
   * Extract ACTUAL available TikTok data - videos, profiles, categories
   */
  async extractTikTokData(): Promise<TikTokData[]> {
    if (!this.page) {
      throw new Error('Page not loaded. Call navigateToTikTok() first.');
    }

    // First, debug what's on the page
    await this.debugPageContent();

    console.log('Extracting REAL TikTok data (videos, profiles, categories)...');
    
    const tikTokData = await this.page.evaluate(() => {
      const data: any[] = [];
      const scrapedAt = new Date().toISOString();
      
      // Strategy 1: Extract video links
      const videoLinks = document.querySelectorAll('a[href*="/video/"]');
      console.log(`Found ${videoLinks.length} video links`);
      
      for (const link of Array.from(videoLinks)) {
        try {
          const href = link.getAttribute('href');
          if (href && href.includes('/video/')) {
            const videoMatch = href.match(/\/video\/(\d+)/);
            if (videoMatch && videoMatch[1]) {
              const videoId = videoMatch[1];
              const fullUrl = href.startsWith('http') ? href : 'https://www.tiktok.com' + href;
              const text = link.textContent?.trim() || '';
              
              data.push({
                type: 'video',
                name: videoId,
                url: fullUrl,
                text: text,
                scrapedAt: scrapedAt
              });
            }
          }
        } catch (error) {
          console.log('Skipping video link');
        }
      }
      
      // Strategy 2: Extract profile links
      const profileLinks = document.querySelectorAll('a[href*="/@"]');
      console.log(`Found ${profileLinks.length} profile links`);
      
      for (const link of Array.from(profileLinks)) {
        try {
          const href = link.getAttribute('href');
          if (href && href.includes('/@')) {
            const profileMatch = href.match(/\/@([^\/\?#]+)/);
            if (profileMatch && profileMatch[1]) {
              const username = profileMatch[1];
              const fullUrl = href.startsWith('http') ? href : 'https://www.tiktok.com' + href;
              const text = link.textContent?.trim() || '';
              
              // Skip empty usernames or generic links
              if (username && username !== '' && username !== '@') {
                data.push({
                  type: 'profile',
                  name: username,
                  url: fullUrl,
                  text: text,
                  scrapedAt: scrapedAt
                });
              }
            }
          }
        } catch (error) {
          console.log('Skipping profile link');
        }
      }
      
      // Strategy 3: Extract categories from text
      const bodyText = document.body.innerText;
      const categories = [
        'Singing & Dancing', 'Comedy', 'Sports', 'Anime & Comics', 'Relationship', 
        'Shows', 'Lipsync', 'Daily Life', 'Beauty Care', 'Games', 'Society', 
        'Outfit', 'Cars', 'Food', 'Animals', 'Family', 'Drama', 'Fitness & Health',
        'Education', 'Technology'
      ];
      
      for (const category of categories) {
        if (bodyText.includes(category)) {
          data.push({
            type: 'category',
            name: category,
            url: `https://www.tiktok.com/discover?category=${encodeURIComponent(category)}`,
            text: `TikTok category: ${category}`,
            scrapedAt: scrapedAt
          });
        }
      }
      
      return data;
    });

    // Remove duplicates based on name and type
    const uniqueData = tikTokData.filter((item, index, self) => 
      self.findIndex(d => d.name === item.name && d.type === item.type) === index
    );

    console.log(`✅ Extracted ${uniqueData.length} TikTok data items:`);
    console.log(`   📹 Videos: ${uniqueData.filter(d => d.type === 'video').length}`);
    console.log(`   👤 Profiles: ${uniqueData.filter(d => d.type === 'profile').length}`);
    console.log(`   🏷️ Categories: ${uniqueData.filter(d => d.type === 'category').length}`);
    
    return uniqueData as TikTokData[];
  }

  /**
   * Clean up
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      console.log('✅ TikTok scraper closed');
    }
  }
}

/**
 * Simple test function
 */
async function testSimpleTikTokScraper(): Promise<void> {
  const scraper = new SimpleTikTokScraper();
  
  try {
    console.log('Testing simple TikTok hashtag scraper...\n');
    
    // Initialize
    await scraper.init();
    
    // Navigate to TikTok (tries multiple URLs)
    const successfulUrl = await scraper.navigateToTikTok();
    console.log(`🎯 Using: ${successfulUrl}`);
    
    // Extract TikTok data (videos, profiles, categories)
    const data = await scraper.extractTikTokData();
    
    console.log('\n🎉 SIMPLE TIKTOK DATA EXTRACTION COMPLETE!');
    console.log(`📊 Total data items found: ${data.length}`);
    
    if (data.length > 0) {
      console.log('\n Sample TikTok data:');
      data.slice(0, 8).forEach((item, index) => {
        console.log(`${index + 1}. [${item.type.toUpperCase()}] ${item.name} ${item.text ? `(${item.text})` : ''}`);
        console.log(`    🔗 ${item.url}`);
      });
      
      // Show summary by type
      const videos = data.filter(d => d.type === 'video');
      const profiles = data.filter(d => d.type === 'profile');
      const categories = data.filter(d => d.type === 'category');
      
      console.log('\n📈 Data Summary:');
      if (videos.length > 0) console.log(`📹 Videos: ${videos.length}`);
      if (profiles.length > 0) console.log(`👤 Profiles: ${profiles.length}`);
      if (categories.length > 0) console.log(`🏷️ Categories: ${categories.length}`);
    }
    
  } catch (error) {
    console.error('❌ Error during simple TikTok test:', error);
  } finally {
    await scraper.close();
  }
}

// Export for use in workers
export default SimpleTikTokScraper;

// If this file is run directly, execute the test
if (import.meta.main) {
  console.log('🏷️ Testing SIMPLE TikTok Hashtag Scraper...\n');
  testSimpleTikTokScraper();
}

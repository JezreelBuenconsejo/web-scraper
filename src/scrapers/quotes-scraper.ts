import { chromium, type Browser, type Page } from 'playwright';

/**
 * 🎭 QUOTES SCRAPER - Your First Playwright Scraper!
 * 
 * This scraper demonstrates the fundamentals:
 * 1. How to launch a browser with Playwright
 * 2. How to navigate to websites
 * 3. How to extract data from HTML elements
 * 4. How to structure and format data
 */

// Define the structure of a quote object
interface Quote {
  text: string;
  author: string;
  tags: string[];
}

export class QuotesScraper {
  private browser: Browser | null = null;
  
  /**
   * Initialize the browser - like opening Chrome/Firefox programmatically
   */
  async init(): Promise<void> {
    console.log('🚀 Launching browser...');
    
    // Use headless mode in production/Railway, headed for local development
    const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT === 'production';
    
    this.browser = await chromium.launch({
      headless: isProduction, // Headless in production, headed locally
      slowMo: isProduction ? 0 : 1000, // No slowdown in production
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    
    console.log(`✅ Browser launched successfully! (${isProduction ? 'headless' : 'headed'} mode)`);
  }

  /**
   * Scrape quotes from a single page
   */
  async scrapePage(url: string): Promise<Quote[]> {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call init() first.');
    }

    console.log(`📄 Opening page: ${url}`);
    const page: Page = await this.browser.newPage();
    
    // Navigate to the website
    await page.goto(url);
    console.log('✅ Page loaded successfully!');

    // Wait a moment for the page to fully load
    await page.waitForTimeout(2000);

    /**
     * 🔍 DATA EXTRACTION - The Heart of Scraping!
     * 
     * We use page.$$eval() to:
     * 1. Find all elements matching a CSS selector
     * 2. Extract data from those elements
     * 3. Return the data to our script
     */
    const quotes = await page.$$eval('.quote', (quoteElements) => {
      return quoteElements.map((element) => {
        // Extract the quote text (remove the quotation marks)
        const text = element.querySelector('.text')?.textContent?.replace(/[""]/g, '') || '';
        
        // Extract the author name
        const author = element.querySelector('.author')?.textContent || '';
        
        // Extract all tags for this quote
        const tagElements = element.querySelectorAll('.tag');
        const tags = Array.from(tagElements).map(tag => tag.textContent || '');

        return {
          text,
          author,
          tags
        };
      });
    });

    console.log(`📊 Found ${quotes.length} quotes on this page`);
    await page.close();
    return quotes;
  }

  /**
   * Scrape multiple pages (quotes website has pagination)
   */
  async scrapeAllPages(baseUrl: string = 'http://quotes.toscrape.com', maxPages: number = 3): Promise<Quote[]> {
    const allQuotes: Quote[] = [];
    let currentPage = 1;

    console.log(`🔄 Starting to scrape up to ${maxPages} pages...`);

    while (currentPage <= maxPages) {
      const url = currentPage === 1 ? baseUrl : `${baseUrl}/page/${currentPage}/`;
      
      try {
        const quotes = await this.scrapePage(url);
        
        if (quotes.length === 0) {
          console.log(`❌ No quotes found on page ${currentPage}. Stopping.`);
          break;
        }
        
        allQuotes.push(...quotes);
        console.log(`✅ Page ${currentPage} complete. Total quotes so far: ${allQuotes.length}`);
        
        currentPage++;
        
        // Be polite to the server - wait 2 seconds between pages
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.log(`❌ Error on page ${currentPage}:`, error);
        break;
      }
    }

    return allQuotes;
  }

  /**
   * Convert quotes to beautiful Markdown format
   */
  formatAsMarkdown(quotes: Quote[]): string {
    const markdown: string[] = [
      '# 📚 Scraped Quotes Collection',
      '',
      `*Scraped ${quotes.length} quotes on ${new Date().toISOString().split('T')[0]}*`,
      '',
      '---',
      ''
    ];

    quotes.forEach((quote, index) => {
      markdown.push(`## Quote ${index + 1}`);
      markdown.push('');
      markdown.push(`> "${quote.text}"`);
      markdown.push('');
      markdown.push(`**Author:** ${quote.author}`);
      markdown.push('');
      
      if (quote.tags.length > 0) {
        markdown.push(`**Tags:** ${quote.tags.map(tag => `\`${tag}\``).join(', ')}`);
      }
      
      markdown.push('');
      markdown.push('---');
      markdown.push('');
    });

    return markdown.join('\n');
  }

  /**
   * Clean up - close the browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      console.log('🔚 Browser closed');
    }
  }
}

/**
 * 🧪 TEST FUNCTION - Let's try our scraper!
 * Run this to see the scraper in action
 */
export async function testQuotesScraper(): Promise<void> {
  const scraper = new QuotesScraper();
  
  try {
    // Initialize the browser
    await scraper.init();
    
    // Scrape some quotes (limit to 2 pages for testing)
    const quotes = await scraper.scrapeAllPages('http://quotes.toscrape.com', 2);
    
    console.log('\n🎉 SCRAPING COMPLETE!');
    console.log(`📊 Total quotes collected: ${quotes.length}`);
    
    // Show first 3 quotes as examples
    console.log('\n📝 Sample quotes:');
    quotes.slice(0, 3).forEach((quote, index) => {
      console.log(`\n${index + 1}. "${quote.text}" - ${quote.author}`);
      console.log(`   Tags: ${quote.tags.join(', ')}`);
    });
    
    // Convert to markdown
    const markdown = scraper.formatAsMarkdown(quotes);
    
    // Save to file
    await Bun.write('./data/scraped-quotes.md', markdown);
    console.log('\n💾 Quotes saved to: ./data/scraped-quotes.md');
    
  } catch (error) {
    console.error('❌ Error during scraping:', error);
  } finally {
    // Always clean up
    await scraper.close();
  }
}

// If this file is run directly, execute the test
if (import.meta.main) {
  console.log('🎭 Testing Quotes Scraper...\n');
  testQuotesScraper();
}

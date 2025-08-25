import { Database } from 'bun:sqlite';
import { mkdir } from 'fs/promises';
import path from 'path';

/**
 * 💾 DATABASE SETUP - SQLite for Scraped Data Storage
 * 
 * We use SQLite because it's:
 * - Simple: No server setup required
 * - Fast: Great performance for local storage  
 * - Reliable: ACID transactions
 * - Portable: Single file database
 */

export interface ScrapedContent {
  id?: number;
  source: string;          // 'quotes', 'reddit', 'tiktok' 
  url: string;             // Original URL scraped
  title?: string;          // Page/post title
  content: string;         // Main content (markdown formatted)
  raw_data: string;        // Original JSON data
  scraped_at: string;      // ISO timestamp
  metadata?: string;       // Additional info (JSON)
}

export interface ScrapeJob {
  id?: number;
  job_id: string;          // BullMQ job ID
  job_type: string;        // 'scrape-quotes', etc.
  status: string;          // 'pending', 'completed', 'failed'
  started_at: string;      // ISO timestamp
  completed_at?: string;   // ISO timestamp
  error_message?: string;  // If failed
  result_data?: string;    // Job result (JSON)
}

export class ScraperDatabase {
  private db: Database;
  private dbPath: string;

  constructor(dbPath: string = './data/scraper.db') {
    this.dbPath = dbPath;
    this.db = new Database(dbPath);
    
    // Enable WAL mode for better concurrent access
    this.db.exec('PRAGMA journal_mode = WAL;');
    
    console.log(`💾 Database connected: ${dbPath}`);
  }

  /**
   * Initialize database with required tables
   */
  async init(): Promise<void> {
    // Ensure data directory exists
    await mkdir(path.dirname(this.dbPath), { recursive: true });

    // Create tables
    this.createTables();
    
    console.log('✅ Database initialized successfully!');
  }

  /**
   * Create database tables
   */
  private createTables(): void {
    // Scraped content table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scraped_content (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        url TEXT NOT NULL,
        title TEXT,
        content TEXT NOT NULL,
        raw_data TEXT NOT NULL,
        scraped_at TEXT NOT NULL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Scrape jobs tracking table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scrape_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT UNIQUE NOT NULL,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        started_at TEXT NOT NULL,
        completed_at TEXT,
        error_message TEXT,
        result_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_scraped_content_source ON scraped_content(source);
      CREATE INDEX IF NOT EXISTS idx_scraped_content_scraped_at ON scraped_content(scraped_at);
      CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status ON scrape_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_scrape_jobs_job_type ON scrape_jobs(job_type);
    `);

    console.log('📋 Database tables created successfully!');
  }

  /**
   * 💾 SCRAPED CONTENT OPERATIONS
   */

  /**
   * Save scraped content to database
   */
  saveScrapedContent(content: Omit<ScrapedContent, 'id'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO scraped_content (
        source, url, title, content, raw_data, scraped_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      content.source,
      content.url,
      content.title || null,
      content.content,
      content.raw_data,
      content.scraped_at,
      content.metadata || null
    );

    console.log(`💾 Saved scraped content with ID: ${result.lastInsertRowid}`);
    return result.lastInsertRowid as number;
  }

  /**
   * Get all scraped content by source
   */
  getContentBySource(source: string): ScrapedContent[] {
    const stmt = this.db.prepare(`
      SELECT * FROM scraped_content 
      WHERE source = ? 
      ORDER BY scraped_at DESC
    `);

    return stmt.all(source) as ScrapedContent[];
  }

  /**
   * Get recent scraped content
   */
  getRecentContent(limit: number = 10): ScrapedContent[] {
    const stmt = this.db.prepare(`
      SELECT * FROM scraped_content 
      ORDER BY scraped_at DESC 
      LIMIT ?
    `);

    return stmt.all(limit) as ScrapedContent[];
  }

  /**
   * Search content by text
   */
  searchContent(query: string): ScrapedContent[] {
    const stmt = this.db.prepare(`
      SELECT * FROM scraped_content 
      WHERE content LIKE ? OR title LIKE ?
      ORDER BY scraped_at DESC
    `);

    const searchTerm = `%${query}%`;
    return stmt.all(searchTerm, searchTerm) as ScrapedContent[];
  }

  /**
   * 🎯 SCRAPE JOBS OPERATIONS
   */

  /**
   * Create a new scrape job record (or ignore if exists)
   */
  createScrapeJob(jobData: Omit<ScrapeJob, 'id'>): number {
    // First check if job already exists
    const existingJob = this.getScrapeJob(jobData.job_id);
    if (existingJob && typeof existingJob.id === 'number') {
      console.log(`📋 Job ${jobData.job_id} already exists in database, skipping creation`);
      return existingJob.id;
    }

    const stmt = this.db.prepare(`
      INSERT INTO scrape_jobs (
        job_id, job_type, status, started_at, result_data
      ) VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      jobData.job_id,
      jobData.job_type,
      jobData.status,
      jobData.started_at,
      jobData.result_data || null
    );

    console.log(`📋 Created scrape job record with ID: ${result.lastInsertRowid}`);
    return result.lastInsertRowid as number;
  }

  /**
   * Update scrape job status
   */
  updateScrapeJob(jobId: string, updates: Partial<ScrapeJob>): void {
    const setParts: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) {
      setParts.push('status = ?');
      values.push(updates.status);
    }

    if (updates.completed_at !== undefined) {
      setParts.push('completed_at = ?');
      values.push(updates.completed_at);
    }

    if (updates.error_message !== undefined) {
      setParts.push('error_message = ?');
      values.push(updates.error_message);
    }

    if (updates.result_data !== undefined) {
      setParts.push('result_data = ?');
      values.push(updates.result_data);
    }

    if (setParts.length === 0) return;

    values.push(jobId);

    const stmt = this.db.prepare(`
      UPDATE scrape_jobs 
      SET ${setParts.join(', ')} 
      WHERE job_id = ?
    `);

    stmt.run(...values);
    console.log(`📋 Updated scrape job: ${jobId}`);
  }

  /**
   * Get job by ID
   */
  getScrapeJob(jobId: string): ScrapeJob | null {
    const stmt = this.db.prepare(`
      SELECT * FROM scrape_jobs WHERE job_id = ?
    `);

    return stmt.get(jobId) as ScrapeJob || null;
  }

  /**
   * Get all jobs by status
   */
  getJobsByStatus(status: string): ScrapeJob[] {
    const stmt = this.db.prepare(`
      SELECT * FROM scrape_jobs 
      WHERE status = ? 
      ORDER BY started_at DESC
    `);

    return stmt.all(status) as ScrapeJob[];
  }

  /**
   * Get jobs statistics
   */
  getJobsStats(): { [key: string]: number } {
    const stmt = this.db.prepare(`
      SELECT status, COUNT(*) as count 
      FROM scrape_jobs 
      GROUP BY status
    `);

    const rows = stmt.all() as { status: string; count: number }[];
    
    const stats: { [key: string]: number } = {};
    rows.forEach(row => {
      stats[row.status] = row.count;
    });

    return stats;
  }

  /**
   * 🧹 UTILITY OPERATIONS
   */

  /**
   * Get database statistics
   */
  getStats(): { contentCount: number; jobsCount: number; dbSize: number } {
    const contentCount = this.db.prepare('SELECT COUNT(*) as count FROM scraped_content').get() as { count: number };
    const jobsCount = this.db.prepare('SELECT COUNT(*) as count FROM scrape_jobs').get() as { count: number };
    
    // Get database file size (approximate)
    const dbSize = this.db.prepare('PRAGMA page_size').get() as { page_size: number };
    const pageCount = this.db.prepare('PRAGMA page_count').get() as { page_count: number };
    
    return {
      contentCount: contentCount?.count || 0,
      jobsCount: jobsCount?.count || 0,
      dbSize: (dbSize?.page_size || 0) * (pageCount?.page_count || 0),
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    console.log('💾 Database connection closed');
  }
}

// Create and export default database instance
export const scraperDB = new ScraperDatabase();

/**
 * Initialize database (call this once at app startup)
 */
export async function initDatabase(): Promise<void> {
  await scraperDB.init();
}

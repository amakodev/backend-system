const { default: FirecrawlApp } = require('@mendable/firecrawl-js');
const { formatUrl } = require('./urlUtils');
const CacheService = require('./CacheService');
const { cleanTextForAI } = require('./textProcessing');

class FirecrawlService {
  static firecrawlApp = null;
  static apiKey = process.env.FIRECRAWL_API_KEY;

  static initialize() {
    if (!FirecrawlService.firecrawlApp) {
      FirecrawlService.firecrawlApp = new FirecrawlApp({ 
        apiKey: FirecrawlService.apiKey 
      });
    }
  }

  static async crawlWebsite(url) {
    try {
      // Initialize if not already initialized
      FirecrawlService.initialize();
      
      if (!FirecrawlService.firecrawlApp) {
        throw new Error('FirecrawlApp failed to initialize');
      }

      const formattedUrl = formatUrl(url);
      
      // Check cache first
      const cachedResult = await CacheService.checkCache(formattedUrl);
      if (cachedResult) {
        return { 
          success: true, 
          data: {
            data: cachedResult.data,
            cached: true,
            wordCount: cachedResult.wordCount
          }
        };
      }

      console.log('Making crawl request to Firecrawl API');
      const crawlResponse = await FirecrawlService.firecrawlApp.crawlUrl(formattedUrl, {
        limit: 3,
        scrapeOptions: {
          formats: ['markdown', 'html']
        },
        maxDepth: 1,
        includePaths: [
          '^$',
          '/blog/*',
          '/posts/*',
          '/articles/*'
        ],
        excludePaths: [
          '/category/*',
          '/tag/*',
          '/author/*',
          '/page/*',
          '/archive/*'
        ]
      });

      if (!crawlResponse.success) {
        console.error('Crawl failed:', crawlResponse.error);
        return { 
          success: false, 
          error: crawlResponse.error || 'Failed to crawl website' 
        };
      }

      // Clean the crawled data before saving to cache
      const cleanedData = {
        ...crawlResponse,
        data: cleanTextForAI(crawlResponse.data)
      };

      // Calculate word count and save to cache
      const wordCount = CacheService.calculateWordCount(cleanedData.data);
      await CacheService.saveToCache(formattedUrl, cleanedData.data, wordCount);

      console.log('Crawl successful:', cleanedData);
      return { 
        success: true,
        data: {
          ...cleanedData,
          cached: false,
          wordCount
        }
      };
    } catch (error) {
      console.error('Error during crawl:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to connect to Firecrawl API' 
      };
    }
  }
}

// Export for CommonJS
module.exports = FirecrawlService;
// Also export as named export
module.exports.FirecrawlService = FirecrawlService;
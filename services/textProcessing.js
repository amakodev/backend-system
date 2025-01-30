/**
 * Utility functions for processing and cleaning text data before AI analysis
 */

const COMMON_CODE_PATTERNS = [
  /```[\s\S]*?```/g,  // Code blocks
  /<[^>]*>/g,         // HTML tags
  /\{\{.*?\}\}/g,     // Template literals
  /\$\{.*?\}/g,       // JavaScript template expressions
  /function\s*\(.*?\)\s*\{[\s\S]*?\}/g, // Function declarations
  /const|let|var\s+\w+\s*=.*?;/g,       // Variable declarations
  /import\s+.*?from\s+['"].*?['"];?/g,   // Import statements
  /export\s+.*?;?/g,   // Export statements
  /\/\*[\s\S]*?\*\//g, // Multi-line comments
  /\/\/.*/g,           // Single-line comments
];

const NOISE_PATTERNS = [
  /\s+/g,             // Multiple spaces
  /^\s+|\s+$/g,       // Leading/trailing whitespace
  /\n\s*\n/g,         // Multiple newlines
  /[^\S\r\n]+/g,      // Multiple spaces not including newlines
];

const cleanSingleText = (rawText) => {
  let text = rawText;
  
  // Remove code patterns
  COMMON_CODE_PATTERNS.forEach(pattern => {
    text = text.replace(pattern, ' ');
  });

  // Clean up noise
  NOISE_PATTERNS.forEach(pattern => {
    text = text.replace(pattern, ' ');
  });

  // Additional cleaning steps
  text = text
    // Remove URLs
    .replace(/https?:\/\/[^\s]+/g, '')
    // Remove file paths
    .replace(/[\/\\][\w\-. ]+[\/\\]/g, '')
    // Remove special characters that aren't punctuation
    .replace(/[^\w\s.,!?;:'"()-]/g, ' ')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();

  // Split into sentences and filter out non-meaningful ones
  const sentences = text.split(/[.!?]+/).filter(sentence => {
    const words = sentence.trim().split(/\s+/);
    // Keep sentences that have 3+ words and aren't just numbers or special chars
    return words.length >= 3 && words.some(word => /[a-zA-Z]{3,}/.test(word));
  });

  return sentences.join('. ').trim();
};

export const cleanTextForAI = (rawData) => {
  console.log('Starting text cleaning process');
  
  // Process each item in the array while maintaining the structure
  const cleanedData = rawData.map(item => {
    if (typeof item === 'string') {
      return cleanSingleText(item);
    }
    // If the item is an object, clean its text properties
    if (typeof item === 'object' && item !== null) {
      const cleanedItem = {};
      for (const [key, value] of Object.entries(item)) {
        if (typeof value === 'string') {
          cleanedItem[key] = cleanSingleText(value);
        } else {
          cleanedItem[key] = value;
        }
      }
      return cleanedItem;
    }
    return item;
  });

  console.log('Text cleaning completed. Original items:', rawData.length, 'Cleaned items:', cleanedData.length);
  
  return cleanedData;
};
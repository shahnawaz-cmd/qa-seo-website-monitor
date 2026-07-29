import * as fs from 'fs';
import * as path from 'path';

function generateMatrix() {
  const jsonPath = path.resolve('./playwright-report/discovered_urls.json');
  let urlsCount = 1;
  const batchSize = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE) : 50;

  if (fs.existsSync(jsonPath)) {
    try {
      const urls = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      if (Array.isArray(urls)) {
        urlsCount = urls.length;
      }
    } catch (e) {
      console.error('Failed to parse discovered_urls.json:', e);
    }
  }

  const numBatches = Math.ceil(urlsCount / batchSize);
  const matrix = Array.from({ length: numBatches }, (_, i) => i);
  
  // Log the matrix array as JSON string for GitHub Actions output parsing
  console.log(JSON.stringify(matrix));
}

generateMatrix();

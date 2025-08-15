const puppeteer = require('puppeteer');

// Helper function to clean job titles
function cleanJobTitle(title) {
  if (!title) return title;
  
  // Remove common prefixes and suffixes
  return title
    .replace(/^(Senior|Staff|Principal|Lead|Jr|Junior)\s+/i, '')
    .replace(/\s+(I|II|III|IV|V|\d+)$/, '')
    .replace(/\s*-\s*(Remote|Hybrid|On-site).*$/i, '')
    .trim();
}

// Helper function to parse location
function parseLocation(locationText) {
  if (!locationText) {
    return { city: 'Unknown', state: 'US' };
  }
  
  // Clean up the location text and parse different formats
  const cleanLocation = locationText.replace(/,?\s*United States$/i, '').trim();
  
  if (!cleanLocation) {
    return { city: '', state: 'United States' };
  }
  
  // Split by comma and trim
  const parts = cleanLocation.split(',').map(part => part.trim());
  
  if (parts.length >= 2) {
    // Format: "Westborough, MA" or "City, State"
    return {
      city: parts[0],
      state: parts[1]
    };
  } else if (parts.length === 1) {
    // Could be just a state or just a city
    const singlePart = parts[0];
    
    // Common US state abbreviations
    const stateAbbreviations = [
      'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
      'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
      'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
      'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
      'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
    ];
    
    if (stateAbbreviations.includes(singlePart.toUpperCase())) {
      return { city: '', state: singlePart.toUpperCase() };
    } else {
      return { city: singlePart, state: '' };
    }
  }
  
  return { city: '', state: '' };
}

// Helper function to convert date to relative forma

async function marvelScraper(searchQuery, maxPages = 10) {
  const browser = await puppeteer.launch({
    headless: true, // Set to true for production
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-images', // Disable images for optimization
      '--disable-javascript', // Keep JS enabled for interactions
      '--disable-plugins',
      '--disable-extensions',
       
      
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--disable-extensions",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-web-security",
      "--disable-features=TranslateUI",
      "--disable-ipc-flooding-protection"
    ]
  });

  const page = await browser.newPage();
  
  // Disable CSS and images for optimization
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const resourceType = req.resourceType();
    if (resourceType === 'stylesheet' || resourceType === 'image' || resourceType === 'font') {
      req.abort();
    } else {
      req.continue();
    }
  });
  
  // Set user agent to avoid blocking
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
  
  const allJobs = [];
  const baseUrl = 'https://marvell.wd1.myworkdayjobs.com';
  
  try {
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      console.log(`Scraping page ${pageNum}...`);
      
      // Construct URL with search query
      const searchUrl = `${baseUrl}/MarvellCareers?q=${encodeURIComponent(searchQuery)}&Country=bc33aa3152ec42d4995f4791a106ed09`;
      
      if (pageNum === 1) {
        console.log(`Searching for: "${searchQuery}"`);
        console.log(`Navigating to: ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 300000 });
      }
      
      // Wait for job listings to load
      try {
        await page.waitForSelector('li.css-1q2dra3', { timeout: 100000 });
      } catch (error) {
        console.log(`No jobs found on page ${pageNum}, stopping...`);
        break;
      }
      
      // Scroll to bottom to load all jobs on current page
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get all job list items
      const jobItems = await page.$$('li.css-1q2dra3');
      
      if (jobItems.length === 0) {
        console.log(`No job items found on page ${pageNum}, stopping...`);
        break;
      }
      
      console.log(`Found ${jobItems.length} potential job items on page ${pageNum}`);
      
      // Extract job data from each list item
      for (const jobItem of jobItems) {
        try {
          const jobData = await jobItem.evaluate((item) => {
            // Extract title from h3
            const titleElement = item.querySelector('h3');
            const title = titleElement ? titleElement.textContent.trim() : '';
            
            // Extract apply link from a tag
            const linkElement = item.querySelector('a');
            const applyLink = linkElement ? linkElement.getAttribute('href') : '';
            
            // Extract location and posted date from dd.css-129m7dg elements
            const ddElements = item.querySelectorAll('dd.css-129m7dg');
            let location = '';
            let posted = '';
            
            if (ddElements.length >= 2) {
              location = ddElements[0] ? ddElements[0].textContent.trim() : '';
              posted = ddElements[1] ? ddElements[1].textContent.trim() : '';
            } else if (ddElements.length === 1) {
              location = ddElements[0] ? ddElements[0].textContent.trim() : '';
            }
            
            return {
              title,
              applyLink,
              location,
              posted
            };
          });
          
          // Skip if no job data found
          if (!jobData || !jobData.title) continue;
          
          // Parse location
          const { city, state } = parseLocation(jobData.location);
          
          // Construct full apply link
          const applyLink = jobData.applyLink ? 
            (jobData.applyLink.startsWith('http') ? jobData.applyLink : `${baseUrl}${jobData.applyLink}`) 
            : '';
          
          // Format the job data
          const formattedJob = {
            employer_name: "MARVELL",
            job_title: cleanJobTitle(jobData.title),
            job_city: city,
            job_state: state,
            job_posted_at:jobData.posted,
            job_description:`${searchQuery} job for the role ${jobData.title} at ${jobData.location}`,
            job_apply_link: applyLink
          };
          
          allJobs.push(formattedJob);
          console.log(`✓ Scraped: ${jobData.title} at ${jobData.location}`);
          
        } catch (error) {
          console.error('Error extracting job data from item:', error);
          continue;
        }
      }
      
      // Check if we've reached the last page or need to navigate to next page
      if (pageNum < maxPages) {
        console.log(`Looking for next page button...`);
        
        // Look for the next page button (chevron right)
        try {
          const nextButton = await page.$('svg.wd-icon-chevron-right-small.wd-icon');
          
          if (nextButton) {
            // Check if the button is clickable (not disabled)
            const isClickable = await page.evaluate((button) => {
              const parentButton = button.closest('button');
              return parentButton && !parentButton.disabled && !parentButton.getAttribute('aria-disabled');
            }, nextButton);
            
            if (isClickable) {
              console.log(`Clicking next page button for page ${pageNum + 1}...`);
              await nextButton.click();
              
              // Wait for new page to load
              await new Promise(resolve => setTimeout(resolve, 3000));
              await page.waitForSelector('li.css-1q2dra3', { timeout: 10000 });
            } else {
              console.log('Next page button is disabled, reached last page');
              break;
            }
          } else {
            console.log('No next page button found, reached last page');
            break;
          }
        } catch (error) {
          console.log('Error navigating to next page:', error.message);
          break;
        }
      }
      
      // Add delay between pages to be respectful
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
  } catch (error) {
    console.error('Error during scraping:', error);
  } finally {
    await browser.close();
  }
  
  console.log(`\n MARVEL Scraping completed! Found ${allJobs.length} total jobs.`);
  return allJobs;
}


// Export the scraper function
module.exports = marvelScraper;

// Run if this file is executed directly
if (require.main === module) {
  main();
}
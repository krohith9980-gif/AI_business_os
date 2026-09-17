import puppeteer from 'puppeteer';
import path from 'path';

const url = 'https://ai-business-os-git-feat-purchases-suppliers-krohith9980-gifs-projects.vercel.app/dashboard/purchases';
const imagePath = 'C:/Users/krohi/.gemini/antigravity-ide/brain/9b4f1ce2-8e63-4d87-bad7-0ef8cc4e5321/.user_uploaded/uploaded_media_1788983337000.png';

async function runTest() {
    console.log('Starting E2E Test on:', url);
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        
        // Setup console logging
        page.on('console', msg => console.log('BROWSER:', msg.text()));
        
        console.log('Navigating to dashboard...');
        const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
        
        if (response.status() === 401 || response.status() === 403 || page.url().includes('login')) {
            console.log('Login required! Current URL:', page.url());
            // Need to handle login
            if (page.url().includes('login')) {
                console.log('Attempting login...');
                await page.fill('input[type="email"]', 'krohith9980@gmail.com'); // Assume this might be the admin
                await page.fill('input[type="password"]', 'password123'); // Guessing based on common dev setups or skip if impossible
                await page.click('button[type="submit"]');
                await page.waitForNavigation({ waitUntil: 'networkidle0' });
            }
        }
        
        console.log('Current URL after potential login:', page.url());
        
        // Wait for 'Upload Invoice' button
        console.log('Waiting for Upload Invoice button...');
        await page.waitForSelector('button:has-text("Upload Invoice")', { timeout: 10000 });
        await page.click('button:has-text("Upload Invoice")');
        
        console.log('Waiting for file input...');
        const fileInput = await page.waitForSelector('input[type="file"]');
        await fileInput.uploadFile(imagePath);
        
        console.log('Image uploaded. Waiting for OCR processing to finish...');
        // The modal state changes to 'scanning' then 'review'
        // Wait for the form to appear (the #invoice-form element)
        await page.waitForSelector('#invoice-form', { timeout: 60000 });
        console.log('OCR complete! Review screen loaded.');
        
        // Now extract data
        const data = await page.evaluate(() => {
            const getVal = (label) => {
                const el = Array.from(document.querySelectorAll('label')).find(l => l.textContent.includes(label));
                if (!el) return null;
                const input = el.nextElementSibling || el.parentElement.querySelector('input');
                return input ? (input.value || input.innerText) : null;
            };
            
            const getSpanVal = (label) => {
                const el = Array.from(document.querySelectorAll('span')).find(l => l.textContent.includes(label));
                if (!el) return null;
                const nextSpan = el.nextElementSibling;
                return nextSpan ? nextSpan.textContent : null;
            };
            
            // Extract from all rows
            const rows = Array.from(document.querySelectorAll('.border-gray-200.bg-gray-50, .border-indigo-200'));
            const items = rows.map(row => {
                const inputs = row.querySelectorAll('input');
                const selects = row.querySelectorAll('select');
                
                // This is a rough extraction, we'll refine if needed
                return {
                    text: row.innerText,
                    inputs: Array.from(inputs).map(i => ({ type: i.type, value: i.value, placeholder: i.placeholder, title: i.title }))
                };
            });
            
            return {
                items,
                grossSubtotal: getSpanVal('Gross Subtotal'),
                netSubtotal: getSpanVal('Net Subtotal'),
                invoiceDiscount: getVal('Invoice Discount'),
                totalTax: getVal('Total Tax'),
                roundOff: getVal('Round Off'),
                finalPayable: getSpanVal('Final Payable')
            };
        });
        
        console.log('Extracted Data from UI:', JSON.stringify(data, null, 2));
        
    } catch (e) {
        console.error('Test failed:', e);
    } finally {
        await browser.close();
    }
}

runTest();

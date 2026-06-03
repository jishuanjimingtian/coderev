const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
  const page = await browser.newPage();
  await page.setViewport({width: 600, height: 600});
  
  const svg = fs.readFileSync(path.join(__dirname, 'logo.svg'), 'utf8');
  const html = '<!DOCTYPE html><html><body style="margin:0;background:#0f172a;display:flex;align-items:center;justify-content:center;width:600px;height:600px;"><div style="width:512px;height:512px;">' + svg + '</div></body></html>';
  
  await page.setContent(html, {waitUntil: 'networkidle0'});
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({path: path.join(__dirname, 'logo-ph-preview.png'), fullPage: true});
  await browser.close();
  const s = fs.statSync(path.join(__dirname, 'logo-ph-preview.png')).size;
  console.log('preview saved (' + s + ' bytes)');
})();

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 400 });
  
  const svg = fs.readFileSync(path.join(__dirname, 'logo.svg'), 'utf8');
  // 直接渲染 240px 的内容
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#0f172a;display:flex;align-items:center;justify-content:center;width:400px;height:400px;"><div style="width:240px;height:240px;">${svg}</div></body></html>`;
  
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));
  // 精准裁剪出 240x240
  await page.screenshot({ 
    path: path.join(__dirname, 'logo-ph-240.png'),
    clip: { x: 80, y: 80, width: 240, height: 240 }
  });
  await browser.close();
  const size = fs.statSync(path.join(__dirname, 'logo-ph-240.png')).size;
  console.log('PNG 240x240 saved: logo-ph-240.png (' + size + ' bytes, ' + (size/1024).toFixed(1) + ' KB)');
})();

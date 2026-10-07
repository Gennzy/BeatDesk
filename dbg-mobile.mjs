import puppeteer from 'puppeteer-core';
const BASE = 'http://localhost:3169';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'shell', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
const info = await page.evaluate(() => {
  const doc = document.documentElement;
  const card = document.querySelector('article');
  const b = card?.querySelector('button[aria-pressed]');
  return {
    горизонтальнаяПрокрутка: doc.scrollWidth > doc.clientWidth ? doc.scrollWidth - doc.clientWidth : 0,
    колонок: card ? getComputedStyle(card.parentElement).gridTemplateColumns.split(' ').length : 0,
    кнопкаПлея: b ? Math.round(b.getBoundingClientRect().width) : null,
    шрифтТарифа: card ? getComputedStyle(card.querySelector('.row span') || card).fontSize : null,
  };
});
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: 'tmp-mobile-feed.png' });
await browser.close();

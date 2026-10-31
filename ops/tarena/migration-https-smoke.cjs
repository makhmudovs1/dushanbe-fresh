const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit, expect } = require(require.resolve('@playwright/test', { paths:[path.resolve('apps/web')] }));
const base = 'https://dushanbefresh.tj';
const directory = path.resolve('apps/web/test-results/migration-https-20261031');
const sockets = new Set();
const proxy = http.createServer((request,response) => { response.writeHead(403); response.end(); });
proxy.on('connect', (request, client, head) => {
  if (!['dushanbefresh.tj:443','www.dushanbefresh.tj:443'].includes(request.url)) return client.destroy();
  const upstream = net.connect(18345,'127.0.0.1');
  sockets.add(client); sockets.add(upstream);
  client.on('close',() => { sockets.delete(client); upstream.destroy(); });
  upstream.on('close',() => { sockets.delete(upstream); client.destroy(); });
  client.on('error',() => upstream.destroy());
  upstream.on('error',() => client.destroy());
  upstream.on('connect',() => {
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length) upstream.write(head);
    client.pipe(upstream); upstream.pipe(client);
  });
});
let stage = 'proxy';
async function main() {
  fs.mkdirSync(directory,{ recursive:true });
  await new Promise(resolve => proxy.listen(0,'127.0.0.1',resolve));
  const results = [];
  for (const [engine,width] of [['chromium',1440],['webkit',390]]) {
    const browser = await (engine === 'webkit' ? webkit : chromium).launch({ ...(engine === 'chromium' ? { channel:'chrome' } : {}),
      proxy:{ server:'http://127.0.0.1:'+proxy.address().port } });
    try {
      // No TLS interception or certificate bypass: CONNECT carries the original TLS session.
      const context = await browser.newContext({ viewport:{ width,height:900 }, isMobile:width<768, hasTouch:width<768 });
      await context.route('**/*',route => {
        const request=route.request();
        if (new URL(request.url()).origin !== base || !['GET','HEAD'].includes(request.method())) return route.abort();
        return route.continue();
      });
      const page = await context.newPage();
      stage = engine+' HTTPS catalog';
      const response = await page.goto(base+'/catalog');
      if (response.status() !== 200) throw Error('HTTPS catalog unavailable');
      const tls = await response.securityDetails();
      if (!tls || tls.subjectName !== 'dushanbefresh.tj') throw Error('Unexpected certificate subject');
      const first = page.locator('.product-card:visible').first();
      await expect(first).toBeVisible({ timeout:20000 });
      await expect.poll(() => first.locator('img').first().evaluate(img => img.complete && img.naturalWidth>0)).toBe(true);
      await page.screenshot({ path:path.join(directory,engine+'-catalog.png') });
      stage = engine+' HTTPS product';
      await first.locator('.product-gallery__link').click();
      if (width<768) {
        const dialog=page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect.poll(async () => {
          const box=await dialog.locator('footer').boundingBox();
          return !!box && box.y>=0 && box.y+box.height<=901;
        }).toBe(true);
      } else await expect(page.locator('.product-detail h1')).toBeVisible({ timeout:20000 });
      await expect(page.locator('.product-purchase-add:visible').first()).toBeEnabled({ timeout:20000 });
      await page.screenshot({ path:path.join(directory,engine+'-product.png') });
      results.push({ engine,width,httpsTrusted:true,realOriginPreserved:true,catalogAndImages:true,productPurchasePanel:true,
        certificateIssuer:tls.issuer,certificateValidTo:tls.validTo });
      await context.close();
    } finally { await browser.close(); }
  }
  const result={ strictHttpsBrowserSmokePassed:true,route:'SSH to new private TLS8449, original domain/SNI retained',
    tlsVerificationDisabled:false,dnsChanged:false,customerWritesPerformed:false,realIphoneTested:false,results };
  fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
}
main().catch(() => { console.error(JSON.stringify({ strictHttpsBrowserSmokeFailed:true,stage })); process.exitCode=1; })
  .finally(async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => proxy.close(resolve)); });

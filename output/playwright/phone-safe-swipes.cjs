const { chromium } = require('C:/Users/julia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({headless:true,channel:"msedge"});
 const page = await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
 const errors=[]; page.on('pageerror', e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5177');
 await page.waitForLoadState('domcontentloaded');
 console.log('Identity:', await page.title(), 'body:', (await page.locator('body').innerText()).slice(0,150));
 await page.evaluate(async()=>{
   const {initPhoneLayouts}=await import('/src/lib/phone-layout.js');
   document.body.innerHTML='<div class="overlay" id="m-phone-qa" style="display:flex"><div class="modal"><div class="modal-title">Record a sale</div><div class="form-group"><label for="note">Sale note</label><input id="note" value="Keep this unsaved note"></div><div class="modal-footer"><button class="btn gold">Save sale</button><button class="btn">Cancel</button></div></div></div>';
   window.qaCloses=[];
   window.qaStop=initPhoneLayouts(document.body,{closeModal:id=>window.qaCloses.push(id)});
 });
 for (const width of [360,390,600,1280]) {
   await page.setViewportSize({width,height:844});
   await page.evaluate(()=>{
    const title=document.querySelector('.modal-title');
    const send=(type,id,y)=>title.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:id,pointerType:'touch',clientY:y}));
    send('pointerdown',1,100);send('pointermove',1,280);send('pointercancel',1,280);
    send('pointerdown',1,100);send('pointerdown',2,100);send('pointermove',2,300);send('pointerup',2,300);send('pointerup',1,110);
    if(window.qaCloses.length)throw Error('Unwanted dismissal');
    if(document.getElementById('note').value!=='Keep this unsaved note')throw Error('Lost note');
    send('pointerdown',3,100);send('pointermove',3,260);send('pointerup',3,260);
    if(window.qaCloses.length!==(innerWidth<=600?1:0))throw Error('Completed swipe incorrect');
    window.qaCloses=[];
   });
   console.log('PASS gestures at width',width);
 }
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'output/playwright/phone-safe-swipes.png'});
 console.log('Fixture overflow:',await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
 console.log('App errors:',JSON.stringify(errors));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});



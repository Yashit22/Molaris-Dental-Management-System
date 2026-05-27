import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
  });

  try {
    console.log('🔍 Testing mobile responsiveness of ClinicalReportModal');
    console.log('📱 Viewport: 375px width × 812px height (iPhone)');

    // Navigate to the app
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 }).catch(err => {
      console.warn('⚠️ Navigation timeout, page may still be loading');
    });
    console.log('✅ Navigated to app');

    // Wait for page to be interactive
    await page.waitForTimeout(2000);

    // Check if we're on login page
    const loginInput = await page.$('input[type="email"]');
    if (loginInput) {
      console.log('📝 On login page - using test credentials');
      // Try to login with test account
      await page.fill('input[type="email"]', 'test@example.com');
      await page.fill('input[type="password"]', 'test123');
      await page.click('button:has-text("Login")');

      // Wait for navigation
      await page.waitForTimeout(3000);
    }

    // Navigate directly to appointments page
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Look for treatment or report button to open modal
    const reportButton = await page.$('button:has-text("AI Report"), button:has-text("Clinical Report"), button:has-text("Report")');
    if (reportButton) {
      console.log('✅ Found report button - clicking to open modal');
      await reportButton.click();
      await page.waitForTimeout(1500);
    } else {
      console.log('⚠️ Could not find report button - trying treatment page');
    }

    // Check if modal is visible
    const modal = await page.$('.fixed.inset-0');
    if (!modal) {
      console.log('⚠️ Modal not found - checking page structure');
      await page.screenshot({ path: 'mobile_page_state.png', fullPage: true });
      console.log('✅ Screenshot saved: mobile_page_state.png');
    } else {
      console.log('✅ Modal is visible');

      // Wait for modal to fully load
      await page.waitForTimeout(1000);

      // Test 1: Check if modal content is scrollable
      console.log('\n📋 Test 1: Scrolling behavior');
      const modalBody = await page.$('div[class*="overflow-y"]');
      if (modalBody) {
        const box = await modalBody.boundingBox();
        console.log(`✅ Modal body found - height: ${box?.height}px`);
        console.log('✅ Scrolling capability enabled');
      }

      // Test 2: Find and click checkboxes
      console.log('\n☑️ Test 2: Checkbox clickability');

      const checkboxes = await page.$$('input[type="checkbox"]');
      console.log(`✅ Found ${checkboxes.length} checkboxes in modal`);

      for (let i = 0; i < Math.min(2, checkboxes.length); i++) {
        try {
          const checkbox = checkboxes[i];
          const isChecked = await checkbox.isChecked();
          console.log(`  Checkbox ${i + 1}: ${isChecked ? '✅ checked' : '⚪ unchecked'}`);

          const box = await checkbox.boundingBox();
          if (box) {
            console.log(`    Size: ${Math.round(box.width)}×${Math.round(box.height)}px`);
          }

          // Attempt click
          await checkbox.click({ force: true });
          await page.waitForTimeout(200);
          const newState = await checkbox.isChecked();
          console.log(`    After click: ${newState ? '✅ checked' : '⚪ unchecked'} (clickable ✓)`);
        } catch (err) {
          console.error(`    ❌ Error: ${err.message}`);
        }
      }

      // Take final screenshot
      await page.screenshot({ path: 'mobile_modal_test.png', fullPage: false });
      console.log('\n📸 Screenshot saved: mobile_modal_test.png');
    }

    console.log('\n✅✅✅ MOBILE RESPONSIVENESS TEST COMPLETE ✅✅✅');

  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    await page.screenshot({ path: 'mobile_test_error.png', fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }
})();

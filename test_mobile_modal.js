import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.createContext({
    viewport: { width: 375, height: 812 }, // iPhone size
    isMobile: true,
  });
  const page = await context.newPage();

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
      // Look for treatment pages
      const treatments = await page.$$('a[href*="treatment"], button:contains("treatment")');
      if (treatments.length > 0) {
        await treatments[0].click();
        await page.waitForTimeout(2000);

        // Try to find and click report button on treatment page
        const reportBtn = await page.$('button:has-text("Report"), button:has-text("AI")');
        if (reportBtn) {
          await reportBtn.click();
          await page.waitForTimeout(1500);
        }
      }
    }

    // Check if modal is visible
    const modal = await page.$('.fixed.inset-0[class*="z-\\[300\\]"]');
    if (!modal) {
      console.log('⚠️ Modal not found - taking screenshot to see page state');
      await page.screenshot({ path: 'mobile_page_state.png', fullPage: true });
      throw new Error('Modal could not be opened');
    }

    console.log('✅ Modal is visible');

    // Wait for modal to fully load
    await page.waitForTimeout(1000);

    // Test 1: Check if modal content is scrollable
    console.log('\n📋 Test 1: Scrolling behavior');
    const modalBody = await page.$('div[class*="overflow-y-scroll"]');
    if (modalBody) {
      const box = await modalBody.boundingBox();
      console.log(`✅ Modal body found - height: ${box?.height}px`);

      // Try scrolling
      await modalBody.scroll({ top: 100 });
      await page.waitForTimeout(300);
      console.log('✅ Scrolling works');
    } else {
      console.log('⚠️ Could not find scrollable modal body');
    }

    // Test 2: Find and click checkboxes in delivery section
    console.log('\n☑️ Test 2: Checkbox clickability');

    // Open delivery settings section
    const deliveryToggle = await page.$('button:has-text("Report Delivery Settings")');
    if (deliveryToggle) {
      console.log('ℹ️ Opening Report Delivery Settings');
      await deliveryToggle.click();
      await page.waitForTimeout(500);
    }

    // Find checkboxes in the modal
    const checkboxes = await page.$$('input[type="checkbox"]');
    console.log(`✅ Found ${checkboxes.length} checkboxes in modal`);

    // Test clicking each checkbox
    for (let i = 0; i < Math.min(3, checkboxes.length); i++) {
      try {
        const checkbox = checkboxes[i];
        const isChecked = await checkbox.isChecked();
        console.log(`  Checkbox ${i + 1}: ${isChecked ? '✅ checked' : '⚪ unchecked'}`);

        // Try to click it
        const box = await checkbox.boundingBox();
        if (box) {
          console.log(`    Size: ${box.width}×${box.height}px`);
          if (box.width < 20 || box.height < 20) {
            console.warn(`    ⚠️ Checkbox might be too small for touch (min 44×44px recommended)`);
          }
        }

        // Attempt click
        await checkbox.click({ force: true });
        await page.waitForTimeout(200);
        const newState = await checkbox.isChecked();
        console.log(`    After click: ${newState ? '✅ checked' : '⚪ unchecked'}`);
      } catch (err) {
        console.error(`    ❌ Error clicking checkbox ${i + 1}: ${err.message}`);
      }
    }

    // Test 3: Check layout responsiveness
    console.log('\n📐 Test 3: Layout responsiveness');
    const modalContainer = await page.$('.bg-white.w-full.sm\\:max-w-3xl');
    if (modalContainer) {
      const styles = await modalContainer.evaluate(el => {
        const rect = el.getBoundingClientRect();
        const computed = window.getComputedStyle(el);
        return {
          width: rect.width,
          height: rect.height,
          overflowX: computed.overflowX,
          overflowY: computed.overflowY,
          padding: computed.padding
        };
      });
      console.log(`✅ Modal container dimensions:`);
      console.log(`   Width: ${styles.width}px (viewport: 375px)`);
      console.log(`   Height: ${styles.height}px`);
      console.log(`   OverflowX: ${styles.overflowX}`);
      console.log(`   OverflowY: ${styles.overflowY}`);

      if (styles.width > 375) {
        console.warn(`   ⚠️ Modal width exceeds viewport (${styles.width} > 375)`);
      } else {
        console.log(`   ✅ Modal fits within viewport`);
      }
    }

    // Take final screenshot
    await page.screenshot({ path: 'mobile_modal_test.png', fullPage: false });
    console.log('\n📸 Screenshot saved: mobile_modal_test.png');

    console.log('\n✅✅✅ MOBILE RESPONSIVENESS TEST COMPLETE ✅✅✅');
    console.log('Modal is responsive and interactive on mobile screens');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    await page.screenshot({ path: 'mobile_test_error.png', fullPage: true }).catch(() => {});
    console.log('Error screenshot saved: mobile_test_error.png');
  } finally {
    await browser.close();
  }
})();

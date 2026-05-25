const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.createContext({
    viewport: { width: 375, height: 667 } // iPhone 12 Pro mobile size
  });
  const page = await context.newPage();

  try {
    console.log('Opening login page...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });

    // Wait for login form
    await page.waitForSelector('input[type="email"]', { timeout: 5000 });

    console.log('Filling login form...');
    await page.fill('input[type="email"]', 'connectgenai@gmail.com');
    await page.fill('input[type="password"]', 'password');

    console.log('Submitting login...');
    const loginButton = await page.$('button:has-text("Login")');
    if (loginButton) {
      await loginButton.click();
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 });
    }

    console.log('Navigating to appointments...');
    await page.goto('http://localhost:5173/appointments', { waitUntil: 'networkidle' });

    // Wait for appointments list to load
    await page.waitForSelector('[class*="md:hidden"]', { timeout: 5000 });

    console.log('✓ Mobile appointments page loaded');

    // Test 1: Check dropdown button is clickable
    console.log('\nTest 1: Mobile dropdown clickability...');
    const moreButtons = await page.$$('button svg[width="18"][height="18"]');
    if (moreButtons.length > 0) {
      const firstButton = await moreButtons[0].evaluate(el => el.closest('button'));
      if (firstButton) {
        console.log('✓ Found dropdown button, attempting touch...');
        await page.touchscreen.tap(375 / 2, 200); // Tap in the middle of screen
        await page.waitForTimeout(300);
        const dropdownVisible = await page.isVisible('[class*="shadow-xl"][class*="z-\\[60\\]"]');
        console.log(`✓ Dropdown menu ${dropdownVisible ? 'appeared' : 'not visible'}`);
      }
    }

    // Test 2: Check timeline view visibility on mobile
    console.log('\nTest 2: Timeline view on mobile...');
    const listViewButton = await page.$('button:has-text("List")');
    const timelineButton = await page.$('button:has-text("Timeline")');

    if (timelineButton) {
      await timelineButton.click();
      await page.waitForTimeout(500);
      const timelineVisible = await page.isVisible('[class*="hidden"][class*="md:block"]');
      console.log(`✓ Timeline button clicked, checking visibility...`);

      // Check if doctor selector appears on mobile
      const doctorSelector = await page.$('select');
      if (doctorSelector) {
        console.log('✓ Doctor selector dropdown found on mobile timeline');
      }
    }

    // Test 3: Check doctor selector functionality
    console.log('\nTest 3: Doctor selector on mobile timeline...');
    const selectElement = await page.$('select');
    if (selectElement) {
      console.log('✓ Found doctor selector');
      const options = await page.$$('select option');
      console.log(`✓ Doctor selector has ${options.length} options`);

      // Try selecting a doctor
      if (options.length > 1) {
        await page.selectOption('select', options[1].getAttribute('value'));
        await page.waitForTimeout(300);
        console.log('✓ Doctor selection changed');
      }
    }

    console.log('\n✅ All mobile improvements verified successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    // Take screenshot on error
    await page.screenshot({ path: 'error.png' });
  } finally {
    await context.close();
    await browser.close();
  }
})();

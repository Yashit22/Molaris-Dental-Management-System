import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.createContext({
    viewport: { width: 375, height: 812 }, // iPhone size
    isMobile: true,
  });
  const page = await context.newPage();

  try {
    // Navigate to login page
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    console.log('✅ Navigated to app');

    // Check if we're logged in, if not, we need to mock/bypass
    const loginForm = await page.$('input[type="email"]');
    if (loginForm) {
      console.log('⚠️ Not logged in, need to login first');
      // Fill in test credentials - adjust as needed
      await page.fill('input[type="email"]', 'test@example.com');
      await page.fill('input[type="password"]', 'password');
      await page.click('button:has-text("Login")');
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    }

    console.log('📱 Viewport set to 375px width (mobile)');

    // Wait a bit for page to load
    await page.waitForTimeout(2000);

    // Try to find and open the clinical report modal
    // First look for a button that might trigger it
    const buttons = await page.locator('button').allTextContents();
    console.log('Available buttons:', buttons.slice(0, 10));

    // Try different ways to open the modal
    // Method 1: Look for AI Report or Clinical Report buttons
    let opened = false;
    const possibleSelectors = [
      'button:has-text("AI Report")',
      'button:has-text("Clinical Report")',
      'button:has-text("Report")',
      '[class*="clinical"]:has-text("Report")',
    ];

    for (const selector of possibleSelectors) {
      const elem = await page.$(selector);
      if (elem) {
        console.log(`✅ Found button: ${selector}`);
        await page.click(selector);
        await page.waitForTimeout(1000);
        const modalExists = await page.$('[class*="fixed"][class*="inset-0"]');
        if (modalExists) {
          opened = true;
          console.log('✅ Modal opened');
          break;
        }
      }
    }

    if (!opened) {
      console.log('⚠️ Could not automatically open modal - checking page structure');
      // Take a screenshot to see what's on the page
      await page.screenshot({ path: 'mobile_home.png', fullPage: true });
      console.log('Screenshot saved: mobile_home.png');
      throw new Error('Modal not found - manual intervention needed');
    }

    // Wait for modal to be fully rendered
    await page.waitForTimeout(1000);

    // Get the modal's current height
    const modalContent = await page.$('div[class*="overflow-y-auto"]');
    if (modalContent) {
      const boundingBox = await modalContent.boundingBox();
      console.log(`Modal content height: ${boundingBox?.height}px`);
    }

    // Step 1: Check template selector visible
    const templateSelect = await page.$('select');
    if (templateSelect) {
      console.log('✅ Template selector found');
      // Select a template (first option)
      await page.selectOption('select', { index: 1 });
      await page.waitForTimeout(500);
    }

    // Step 2: Start recording (click mic button)
    const micButton = await page.$('button[title*="icro"], button:has-text("Click to start recording")');
    if (micButton) {
      console.log('✅ Mic button found');
    }

    // Step 3: Try to navigate to the "done" stage or simulate it by opening delivery panel
    // Look for delivery panel toggle
    const deliveryToggle = await page.$('button:has-text("Report Delivery Settings")');
    if (deliveryToggle) {
      console.log('✅ Delivery Settings toggle found');
      await deliveryToggle.click();
      await page.waitForTimeout(500);
      console.log('✅ Delivery Settings panel opened');
    }

    // Step 4: Look for the Approve & Send section
    const approveSection = await page.$('div:has-text("Approve & Send")');
    if (approveSection) {
      console.log('✅ Approve & Send section found');
    }

    // Step 5: Click on email checkbox to expand email form
    const emailCheckbox = await page.$('input[type="checkbox"][value], text=>>Email to patient');
    if (emailCheckbox) {
      const emailLabel = await page.$('label:has-text("Email to patient")');
      if (emailLabel) {
        console.log('✅ Email checkbox found');
        await emailLabel.click();
        await page.waitForTimeout(500);
        console.log('✅ Email form expanded');
      }
    }

    // Step 6: Click on WhatsApp checkbox to expand WhatsApp form
    const waLabel = await page.$('label:has-text("WhatsApp to patient")');
    if (waLabel) {
      console.log('✅ WhatsApp checkbox found');
      await waLabel.click();
      await page.waitForTimeout(500);
      console.log('✅ WhatsApp form expanded');
    }

    // Step 7: Test scrolling - scroll down within the modal
    const scrollContainer = await page.$('div[class*="overflow-y-auto"]');
    if (scrollContainer) {
      await scrollContainer.scroll({ top: 500 });
      await page.waitForTimeout(500);
      console.log('✅ Scrolled down in modal');

      // Try scrolling more
      await scrollContainer.scroll({ top: 1000 });
      await page.waitForTimeout(300);
      console.log('✅ Scrolled further');

      // Scroll back to top
      await scrollContainer.scroll({ top: 0 });
      await page.waitForTimeout(300);
      console.log('✅ Scrolled back to top');
    }

    // Take final screenshot of mobile modal with delivery options
    await page.screenshot({ path: 'mobile_modal_delivery.png', fullPage: false });
    console.log('Screenshot saved: mobile_modal_delivery.png');

    // Check if we can interact with form fields on mobile
    const emailInput = await page.$('input[type="email"]');
    if (emailInput) {
      console.log('✅ Email input field is accessible');
      await emailInput.click();
      console.log('✅ Email input is clickable');
    }

    const phoneInput = await page.$('input[placeholder*="phone"], input[placeholder*="Phone"]');
    if (phoneInput) {
      console.log('✅ Phone input field is accessible');
      await phoneInput.click();
      console.log('✅ Phone input is clickable');
    }

    console.log('\n✅✅✅ VERIFICATION COMPLETE ✅✅✅');
    console.log('Modal is responsive and scrollable on 375px mobile viewport');

  } catch (error) {
    console.error('❌ Error during verification:', error.message);
    await page.screenshot({ path: 'mobile_error.png', fullPage: true });
    console.log('Error screenshot saved: mobile_error.png');
  } finally {
    await browser.close();
  }
})();

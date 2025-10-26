import { chromium } from 'playwright'
import * as readline from "readline"

// Helper function to prompt user for OTP
function promptForOTP() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    rl.question("\n🔐 Please check your email for the OTP and enter it here: ", (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function testLogin() {
  console.log("🚀 Starting Mando Agentic Testing - Login Test\n")

  // Launch Playwright browser
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    console.log("✅ Browser initialized\n")

    // Navigate to login page
    console.log("🌐 Navigating to https://joinmando.com/auth/login...")
    await page.goto("https://joinmando.com/auth/login")
    console.log("✅ Login page loaded\n")

    // Wait a moment for page to fully render
    await page.waitForTimeout(2000)

    // Enter email using precise selector
    console.log("📧 Attempting to enter email...")
    await page.getByRole('textbox', { name: 'Email*' }).fill('test@example.com')
    console.log("✅ Email entered\n")

    // Click continue button
    console.log("🔘 Clicking continue button...")
    await page.getByRole('button', { name: 'Continue' }).click()
    console.log("✅ Continue button clicked\n")

    // Wait for OTP input field to appear
    await page.waitForTimeout(2000)

    // Pause and ask user to enter OTP
    console.log("⏸️  Pausing for OTP entry...")
    const otp = await promptForOTP()
    console.log(`✅ OTP received: ${otp}\n`)

    // Enter the OTP
    console.log("🔢 Entering OTP...")
    await page.getByRole('textbox').fill(otp)
    console.log("✅ OTP entered\n")

    // Wait for auto-submit and navigation
    console.log("🔘 Waiting for auto-submit and navigation...")
    await page.waitForTimeout(10000)
    console.log("✅ Navigation completed\n")

    // Verify login success by checking URL
    const currentUrl = page.url()
    console.log(`📍 Current URL: ${currentUrl}\n`)

    if (!currentUrl.includes('/auth/login')) {
      console.log("🎉 LOGIN SUCCESSFUL! You are now logged in.\n")

      // Get page title
      const title = await page.title()
      console.log("📊 Page title:", title)
    } else {
      console.log("❌ Login may have failed. Still on login page.")
    }

    // Keep browser open for inspection
    console.log("\n⏳ Keeping browser open for 30 seconds for inspection...")
    await page.waitForTimeout(30000)
  } catch (error) {
    console.error("❌ Error during login test:", error)
  } finally {
    // Close the browser
    console.log("\n🔚 Closing browser...")
    await browser.close()
    console.log("✅ Test complete!")
  }
}

// Run the test
testLogin()
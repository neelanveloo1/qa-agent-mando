import { type NextRequest, NextResponse } from "next/server"
import { chromium } from 'playwright'
import { z } from "zod"
import { addSession, cleanupExpiredSessions, debugGlobalState } from "@/lib/session-store"
import { analyzeLoginState } from "@/lib/vision"

const requestSchema = z.object({
  startUrl: z.string().transform((val) => {
    if (!val || !val.trim()) return 'https://joinmando.com/auth/login'
    const trimmed = val.trim()
    return trimmed.startsWith('http://') || trimmed.startsWith('https://') 
      ? trimmed 
      : `https://${trimmed}`
  }),
  email: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { startUrl, email } = requestSchema.parse(body)
    
    console.log("=========================================")
    console.log("[START] Starting agent for URL:", startUrl)
    console.log("[START] Timestamp:", new Date().toISOString())
    console.log("=========================================")
    
    // Debug global state before starting
    debugGlobalState()
    
    // Clean up expired sessions
    cleanupExpiredSessions()
    
    // Launch browser
    console.log("[STEP 1] Launching browser...")
    const browser = await chromium.launch({ 
      headless: false,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--autoplay-policy=no-user-gesture-required', // Enable autoplay for videos
        '--force-device-scale-factor=1' // Prevent zoom scaling
      ]
    })
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1, // Force 1x device scale factor
      hasTouch: false,
      isMobile: false
    })
    const page = await context.newPage()
    
    console.log("[STEP 1] Browser launched successfully")
    
    // Navigate to URL
    console.log("[STEP 2] Navigating to:", startUrl)
    await page.goto(startUrl)
    console.log("[STEP 2] Navigation complete")
    console.log("[STEP 2] Current URL:", page.url())
    
    // Wait 1 second for page to fully load
    console.log("[STEP 3] Waiting 1 second for page to load...")
    await page.waitForTimeout(1000)
    console.log("[STEP 3] Wait complete")
    console.log("[STEP 3] Current URL after wait:", page.url())
    
    // Take screenshot
    console.log("[STEP 4] Taking screenshot...")
    const screenshot = await page.screenshot({ fullPage: false, type: 'png' })
    const base64Screenshot = screenshot.toString('base64')
    console.log("[STEP 4] Screenshot captured, size:", base64Screenshot.length, "bytes")
    
    // Send screenshot to OpenAI Vision
    console.log("[STEP 5] Sending screenshot to OpenAI Vision API...")
    const visionResult = await analyzeLoginState(base64Screenshot)
    console.log("[STEP 5] Vision API response:", JSON.stringify(visionResult, null, 2))
    
    // Check if it's a login page (email field + Continue button visible)
    const emailCount = await page.locator('input[type="email"]').count()
    const emailTextboxCount = await page.getByRole('textbox', { name: /email/i }).count()
    const hasLoginForm = emailCount > 0 || emailTextboxCount > 0
    
    console.log("[STEP 6] Checking page state...")
    console.log("[STEP 6] Email input fields found:", emailCount > 0 || emailTextboxCount > 0)
    console.log("[STEP 6] Has login form:", hasLoginForm)
    
    // If logged in with decent confidence, create active session
    if (visionResult.loggedIn && visionResult.confidence > 70) {
      console.log("[STEP 6] LOGGED IN detected with confidence:", visionResult.confidence)
      
      const sessionId = Math.random().toString(36).substring(7)
      const environment = startUrl.includes('staging.mando.work') ? 'staging' : 'production'
      
      console.log("[STEP 6] Creating active session:", sessionId)
      console.log("[STEP 6] Environment:", environment)
      
      addSession(sessionId, browser, page, '', 'active', startUrl)
      
      console.log("[STEP 6] Session created successfully")
      console.log("=========================================")
      console.log("[SUCCESS] Agent is now ACTIVE")
      console.log("=========================================")
      
      return NextResponse.json({
        success: true,
        loggedIn: true,
        sessionId,
        logs: [
          "Step 1: Browser launched",
          "Step 2: Navigated to URL",
          "Step 3: Waited for page to load (1s)",
          "Step 4: Screenshot captured",
          "Step 5: Vision AI analysis complete",
          `AI Vision reasoning: ${visionResult.reasoning}`,
          `Logged in detected (confidence: ${visionResult.confidence}%)`,
          "Agent is now ACTIVE"
        ],
      })
    } else if (hasLoginForm && !visionResult.loggedIn) {
      console.log("[STEP 6] LOGIN PAGE detected")
      console.log("[STEP 6] Vision reasoning:", visionResult.reasoning)
      
      // Check if email is provided
      if (!email) {
        console.log("[STEP 6] No email provided - returning error")
        await browser.close()
        return NextResponse.json({
          success: false,
          error: "Email required for login URLs. Please provide your email address.",
          logs: [
            "Step 1: Browser launched",
            "Step 2: Navigated to URL",
            "Step 3: Waited for page to load (1s)",
            "Step 4: Screenshot captured",
            "Step 5: Vision AI analysis complete",
            "Login form detected - email required"
          ],
        })
      }
      
      // STEP 8: Fill email and trigger OTP screen
      console.log("[STEP 8] Filling email and triggering OTP screen...")
      console.log("[STEP 8] Email provided:", email)
      
      try {
        // Detect environment for correct selector
        const emailSelector = startUrl.includes('staging.mando.work') 
          ? 'Work email' 
          : 'Email*'
        
        console.log("[STEP 8] Filling email field with selector:", emailSelector)
        await page.getByRole('textbox', { name: emailSelector }).fill(email)
        console.log("[STEP 8] Email filled successfully")
        
        console.log("[STEP 8] Clicking Continue button...")
        await page.getByRole('button', { name: 'Continue', exact: true }).click()
        console.log("[STEP 8] Continue clicked, waiting for OTP screen...")
        
        // Wait for either: 1) navigation away from login page, OR 2) OTP field appears
        console.log("[STEP 8] Waiting for navigation or OTP field...")
        try {
          // Wait up to 10 seconds for page to change or OTP field to appear
          await Promise.race([
            page.waitForTimeout(10000),
            page.waitForFunction(
              () => {
                // Try multiple selectors for OTP field
                const otpInputs1 = document.querySelectorAll('input[type="text"][maxlength="6"]')
                const otpInputs2 = document.querySelectorAll('input[type="text"]')
                // Also check if page text mentions "one-time passcode"
                const pageText = document.body.textContent || ''
                const hasOtpText = pageText.includes('one-time passcode') || 
                                   pageText.includes('enter the code') ||
                                   pageText.includes('verification code')
                return otpInputs1.length > 0 || otpInputs2.length > 0 || hasOtpText
              },
              { timeout: 10000 }
            )
          ])
        } catch (waitError) {
          console.log("[STEP 8] Wait completed or timeout")
        }
        
        console.log("[STEP 8] Wait complete, checking for OTP field...")
        
        // Check if OTP field appeared - try multiple selectors
        const otpCount1 = await page.locator('input[type="text"][maxlength="6"]').count()
        const otpCount2 = await page.getByRole('textbox', { name: /code|passcode|otp/i }).count()
        const hasOtpText = await page.evaluate(() => {
          const pageText = document.body.textContent || ''
          return pageText.includes('6-digit code') ||
                 pageText.includes('Verify your email') ||
                 pageText.includes('one-time passcode') || 
                 pageText.includes('enter the code') ||
                 pageText.includes('verification code')
        })
        const otpCount = otpCount1 + otpCount2
        const currentUrl = page.url()
        console.log("[STEP 8] OTP input count (maxlength='6'):", otpCount1)
        console.log("[STEP 8] OTP input count (textbox with code in name):", otpCount2)
        console.log("[STEP 8] Has OTP text on page:", hasOtpText)
        console.log("[STEP 8] Total OTP indicators:", otpCount + (hasOtpText ? 1 : 0))
        console.log("[STEP 8] Current URL:", currentUrl)
        
        // If URL changed away from login page, assume we're logged in
        const stillOnLoginPage = currentUrl.includes('/auth/login')
        if (!stillOnLoginPage) {
          console.log("[STEP 8] URL changed - user is logged in!")
          
          const sessionId = Math.random().toString(36).substring(7)
          const environment = startUrl.includes('staging.mando.work') ? 'staging' : 'production'
          
          console.log("[STEP 8] Creating active session:", sessionId)
          addSession(sessionId, browser, page, email, 'active', startUrl)
          
          console.log("[STEP 8] Session created, agent is now active")
          console.log("=========================================")
          console.log("[SUCCESS] Agent is now ACTIVE")
          console.log("=========================================")
          
          return NextResponse.json({
            success: true,
            loggedIn: true,
            sessionId,
            logs: [
              "Step 1: Browser launched",
              "Step 2: Navigated to URL",
              "Step 3: Waited for page to load (1s)",
              "Step 4: Screenshot captured",
              "Step 5: Vision AI analysis complete",
              `Filled email: ${email}`,
              "Clicked Continue",
              "URL changed - user is logged in",
              "Agent is now ACTIVE"
            ],
          })
        }
        
        if (otpCount > 0 || hasOtpText) {
          console.log("[STEP 8] OTP screen successfully appeared!")
          
          const sessionId = Math.random().toString(36).substring(7)
          const environment = startUrl.includes('staging.mando.work') ? 'staging' : 'production'
          
          console.log("[STEP 8] Creating session for OTP:", sessionId)
          addSession(sessionId, browser, page, email, 'initializing', startUrl)
          
          console.log("[STEP 8] Session created, waiting for OTP entry")
          console.log("=========================================")
          console.log("[SUCCESS] OTP screen ready - waiting for user input")
          console.log("=========================================")
          
          return NextResponse.json({
            success: true,
            requiresOtp: true,
            sessionId,
            logs: [
              "Step 1: Browser launched",
              "Step 2: Navigated to URL",
              "Step 3: Waited for page to load (1s)",
              "Step 4: Screenshot captured",
              "Step 5: Vision AI analysis complete",
              `AI Vision reasoning: ${visionResult.reasoning}`,
              `Not logged in (confidence: ${visionResult.confidence}%)`,
              `Filled email: ${email}`,
              "Clicked Continue",
              "Waiting for OTP screen...",
              "OTP screen detected - please enter OTP code"
            ],
          })
        } else {
          console.log("[STEP 8] OTP screen did not appear, checking current page...")
          const currentUrl = page.url()
          console.log("[STEP 8] Current URL:", currentUrl)
          
          // Check for error messages on the page
          console.log("[STEP 8] Checking for error messages...")
          const pageContent = await page.content()
          const pageText = await page.evaluate(() => document.body.textContent || '')
          
          console.log("[STEP 8] Page text length:", pageText.length)
          console.log("[STEP 8] Page content snippet:", pageText.substring(0, 500))
          
          // Look for common error patterns
          let errorMessage = null
          if (pageText.includes('Invalid') || pageText.includes('incorrect')) {
            errorMessage = "Invalid email address. Please check your email and try again."
          } else if (pageText.includes('not found') || pageText.includes("doesn't exist")) {
            errorMessage = "Email not found. Please check your email and try again."
          } else if (pageText.includes('Unable') || pageText.includes('error')) {
            errorMessage = "An error occurred during login. Please try again or use a magic link."
          }
          
          await browser.close()
          console.log("[STEP 8] Browser closed")
          console.log("=========================================")
          console.log("[FAILED] OTP screen did not appear")
          if (errorMessage) {
            console.log("[STEP 8] Error detected:", errorMessage)
          }
          console.log("=========================================")
          
          return NextResponse.json({
            success: false,
            error: errorMessage || "Failed to reach OTP screen. The email may be invalid or the login flow failed. Please try again or use a magic link.",
            logs: [
              "Step 1: Browser launched",
              "Step 2: Navigated to URL",
              "Step 3: Waited for page to load (1s)",
              "Step 4: Screenshot captured",
              "Step 5: Vision AI analysis complete",
              `Filled email: ${email}`,
              "Clicked Continue",
              errorMessage || "OTP screen did not appear",
              "Error: Failed to reach OTP screen"
            ],
          })
        }
      } catch (error) {
        console.error("[STEP 8] Error during email fill/OTP trigger:", error)
        await browser.close()
        return NextResponse.json({
          success: false,
          error: `Failed to fill email and trigger OTP: ${error instanceof Error ? error.message : 'Unknown error'}`,
          logs: [
            "Step 1: Browser launched",
            "Step 2: Navigated to URL",
            "Step 3: Waited for page to load (1s)",
            "Step 4: Screenshot captured",
            "Step 5: Vision AI analysis complete",
            `Error filling email: ${error instanceof Error ? error.message : 'Unknown error'}`
          ],
        })
      }
    } else {
      console.log("[STEP 6] NOT logged in (confidence:", visionResult.confidence, ")")
      console.log("[STEP 6] Vision reasoning:", visionResult.reasoning)
      
      // Not logged in - check for OTP or close browser
      console.log("[STEP 7] Checking for OTP input field...")
      const otpInputCount = await page.locator('input[type="text"][maxlength="6"]').count()
      console.log("[STEP 7] OTP input count:", otpInputCount)
      
      if (otpInputCount > 0) {
        console.log("[STEP 7] OTP screen detected")
        
    const sessionId = Math.random().toString(36).substring(7)
        const environment = startUrl.includes('staging.mando.work') ? 'staging' : 'production'
        
        console.log("[STEP 7] Creating session for OTP:", sessionId)
        addSession(sessionId, browser, page, '', 'initializing', startUrl)

        console.log("[STEP 7] Session created, waiting for OTP")
        console.log("=========================================")

    return NextResponse.json({
          success: true,
          requiresOtp: true,
      sessionId,
          logs: [
            "Step 1: Browser launched",
            "Step 2: Navigated to URL",
            "Step 3: Waited for page to load (1s)",
            "Step 4: Screenshot captured",
            "Step 5: Vision AI analysis complete",
            `AI Vision reasoning: ${visionResult.reasoning}`,
            `Not logged in (confidence: ${visionResult.confidence}%)`,
            "OTP screen detected - waiting for OTP entry..."
          ],
        })
      } else {
        console.log("[STEP 7] No OTP input found")
        console.log("[STEP 7] Closing browser due to unknown state")
        
        await browser.close()
        console.log("[STEP 7] Browser closed")
        console.log("=========================================")
        console.log("[FAILED] Could not determine page state")
        console.log("=========================================")
        
        return NextResponse.json({
          success: false,
          error: visionResult.reasoning || "Could not determine page state",
          logs: [
            "Step 1: Browser launched",
            "Step 2: Navigated to URL",
            "Step 3: Waited for page to load (1s)",
            "Step 4: Screenshot captured",
            "Step 5: Vision AI analysis complete",
            `AI Vision reasoning: ${visionResult.reasoning}`,
            `Not logged in (confidence: ${visionResult.confidence}%)`,
            "No OTP screen detected",
            "ERROR: Could not determine page state"
          ],
        })
      }
    }
  } catch (error) {
    console.error("=========================================")
    console.error("[ERROR] Exception caught:", error)
    console.error("[ERROR] Stack:", error instanceof Error ? error.stack : 'No stack trace')
    console.error("=========================================")
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        logs: [
          "ERROR occurred during agent startup",
          error instanceof Error ? error.message : 'Unknown error',
          error instanceof Error ? error.stack || 'No stack trace' : 'No stack trace'
        ]
      },
      { status: 500 }
    )
  }
}

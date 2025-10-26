import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSession, removeSession, cleanupExpiredSessions, debugGlobalState, updateSessionStatus } from "@/lib/session-store"
import { SELECTORS } from "@/lib/selectors"
import { promises as fs } from "fs"
import path from "path"

const requestSchema = z.object({
  sessionId: z.string(),
  otp: z.string(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, otp } = requestSchema.parse(body)

    console.log("=========================================")
    console.log("[OTP] Submitting OTP for session:", sessionId)
    console.log("[OTP] OTP code:", otp)
    console.log("[OTP] Timestamp:", new Date().toISOString())
    console.log("=========================================")
    
    // Debug global state
    debugGlobalState()
    
    // Clean up expired sessions
    cleanupExpiredSessions()

    const session = getSession(sessionId)
    if (!session) {
      console.error("[OTP] ERROR: Session not found")
      return NextResponse.json({
        success: false,
        error: "Session not found or expired",
      })
    }

    const { page } = session.instance
    console.log("[OTP STEP 1] Retrieved session successfully")
    console.log("[OTP STEP 1] Current page URL:", page.url())

    // Enter OTP using the exact selector from Playwright Inspector
    console.log("[OTP STEP 2] Filling OTP into textbox...")
    await page.getByRole('textbox').fill(otp)
    console.log("[OTP STEP 2] OTP entered successfully")

    // Submit OTP - wait for navigation to complete
    // Based on the Inspector test, after filling OTP, we should navigate to /ai-search
    console.log("[OTP STEP 3] Waiting 1s for OTP auto-submit and navigation...")
    await page.waitForTimeout(1000) // Wait for auto-submit and navigation
    console.log("[OTP STEP 3] Wait complete")

    // Check if login was successful by checking URL change
    const currentUrl = page.url()
    console.log("[OTP STEP 4] Current URL after OTP:", currentUrl)

    // Simple and reliable login detection: check if we're no longer on login page
    const isLoggedIn = !currentUrl.includes('/auth/login')
    console.log("[OTP STEP 4] Login successful:", isLoggedIn)

    if (isLoggedIn) {
      console.log("[OTP STEP 5] Login successful, proceeding with activation...")
      
      // Navigate to custom URL if provided
      const sessionCheck = getSession(sessionId)
      if (sessionCheck && sessionCheck.customUrl && !sessionCheck.customUrl.includes('/auth/login')) {
          console.log(`[OTP STEP 5] Navigating to custom URL: ${sessionCheck.customUrl}`)
          try {
            await page.goto(sessionCheck.customUrl)
            await page.waitForTimeout(1000) // Wait for navigation
          console.log(`[OTP STEP 5] Navigated to custom URL successfully`)
        } catch (navError) {
          console.log(`[OTP STEP 5] Error navigating to custom URL:`, navError)
        }
      }

      // Take screenshot
      console.log("[OTP STEP 6] Taking screenshot...")
      const screenshotBuffer = await page.screenshot({ fullPage: true, type: 'png' })
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `login-success-${sessionId}-${timestamp}.png`
      const screenshotDir = path.join(process.cwd(), 'public', 'screenshots')
      await fs.mkdir(screenshotDir, { recursive: true })
      const screenshotPath = path.join(screenshotDir, filename)
      await fs.writeFile(screenshotPath, screenshotBuffer)
      console.log(`[OTP STEP 6] Screenshot saved: ${screenshotPath}`)

      // Keep session active instead of cleaning up
      console.log("[OTP STEP 7] Updating session status to active...")
      updateSessionStatus(sessionId, "active")
      console.log(`[OTP STEP 7] Agent is now ACTIVE - session ${sessionId} ready for commands`)
      console.log("=========================================")
      console.log("[SUCCESS] OTP flow completed successfully")
      console.log("=========================================")

      return NextResponse.json({
        success: true,
        status: "active",
        sessionId: sessionId,
        logs: ["Entered OTP", "Submitted OTP", "Login successful!", `Redirected to: ${currentUrl}`, screenshotPath ? "Screenshot captured!" : "Screenshot failed", "Agent is now ACTIVE and ready for commands"],
        screenshotUrl: `/screenshots/${filename}`,
        currentUrl: currentUrl
      })
    } else {
      console.log("[OTP] Login FAILED - still on login page")
      console.log("[OTP] Closing browser and cleaning up...")
      
      // Clean up on failure
      removeSession(sessionId)
      await session.instance.browser.close()
      
      console.log("=========================================")
      console.log("[FAILED] OTP authentication failed")
      console.log("=========================================")
      
      return NextResponse.json({
        success: false,
        error: "Login failed - still on login page",
        logs: ["OTP may be incorrect or expired"],
      })
    }

  } catch (error) {
    console.error("=========================================")
    console.error("[OTP ERROR] Exception caught:", error)
    console.error("[OTP ERROR] Stack:", error instanceof Error ? error.stack : 'No stack trace')
    console.error("=========================================")
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 },
    )
  }
}
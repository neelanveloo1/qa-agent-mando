import type { Page } from 'playwright'
import { analyzeLoginState } from './vision'

export async function detectPageState(page: Page): Promise<{
  type: 'otp_required' | 'logged_in' | 'login_page' | 'unknown'
  message: string
  confidence?: number
}> {
  // Check for OTP input field FIRST
  const otpInputCount = await page.locator('input[type="text"][maxlength="6"]').count()
  if (otpInputCount > 0) {
    return {
      type: 'otp_required',
      message: 'OTP input field detected'
    }
  }
  
  // ALWAYS check Vision AI FIRST to see if we're logged in
  console.log("[Page Detector] Taking screenshot for AI vision analysis...")
  const screenshot = await page.screenshot({ fullPage: false, type: 'png' })
  const base64Screenshot = screenshot.toString('base64')
  
  const visionResult = await analyzeLoginState(base64Screenshot)
  console.log(`[Page Detector] Vision result: ${JSON.stringify(visionResult)}`)
  
  // If Vision AI says we're logged in (with decent confidence), trust it
  if (visionResult.loggedIn && visionResult.confidence > 70) {
    return {
      type: 'logged_in',
      message: `Logged in detected by AI (confidence: ${visionResult.confidence}%)`,
      confidence: visionResult.confidence
    }
  }
  
  // Only NOW check for email fields (might be login page)
  const emailCount = await page.locator('input[type="email"]').count()
  const emailTextboxCount = await page.getByRole('textbox', { name: /email/i }).count()
  
  if (emailCount > 0 || emailTextboxCount > 0) {
    return {
      type: 'login_page',
      message: 'Login page with email field detected'
    }
  }
  
  // Unknown state
  return {
    type: 'unknown',
    message: visionResult.reasoning || 'Could not determine page state'
  }
}


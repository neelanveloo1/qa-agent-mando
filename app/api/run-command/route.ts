import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSession, updateSessionStatus, updateSessionActivity } from "@/lib/session-store"
import { SELECTORS } from "@/lib/selectors"
import { promises as fs } from "fs"
import path from "path"
import type { Page } from 'playwright'

const requestSchema = z.object({
  sessionId: z.string(),
  command: z.string(),
})

async function captureAndSaveScreenshot(page: Page, sessionId: string, prefix: string): Promise<string> {
  const screenshotBuffer = await page.screenshot({ fullPage: true, type: 'png' })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `${prefix}-${sessionId}-${timestamp}.png`
  const screenshotDir = path.join(process.cwd(), 'public', 'screenshots')
  await fs.mkdir(screenshotDir, { recursive: true })
  const filePath = path.join(screenshotDir, filename)
  await fs.writeFile(filePath, screenshotBuffer)
  console.log(`[Playwright] Screenshot saved: ${filePath}`)
  return `/screenshots/${filename}`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, command } = requestSchema.parse(body)

    console.log(`[Playwright] Executing command for session: ${sessionId}`)
    console.log(`[Playwright] Command: ${command}`)

    const session = getSession(sessionId)
    if (!session) {
      return NextResponse.json({
        success: false,
        error: "Agent not active or session expired",
      })
    }

    const { page } = session.instance
    updateSessionStatus(sessionId, "executing")

    const logs: string[] = []
    const screenshots: string[] = []

    try {
      // Capture before screenshot
      logs.push(`Starting command: ${command}`)
      const beforeScreenshot = await captureAndSaveScreenshot(page, sessionId, 'before')
      screenshots.push(beforeScreenshot)
      logs.push("Before screenshot captured")

      // Execute the command using Playwright
      // For AI search commands, fill the input and click submit
      await page.fill(SELECTORS.aiSearch.input, command)
      logs.push("Command text entered")
      
      await page.click(SELECTORS.aiSearch.submitButton)
      logs.push("Submit button clicked")

      // Wait for response (with timeout)
      try {
        await page.waitForSelector(SELECTORS.aiSearch.responseContainer, { timeout: 30000 })
        logs.push("AI response received")
      } catch (timeoutError) {
        logs.push("Timeout waiting for AI response - continuing anyway")
      }

      // Wait a moment for the page to settle
      await page.waitForTimeout(2000)

      // Capture after screenshot
      const afterScreenshot = await captureAndSaveScreenshot(page, sessionId, 'after')
      screenshots.push(afterScreenshot)
      logs.push("After screenshot captured")

      // Get current URL
      const currentUrl = page.url()
      logs.push(`Current URL: ${currentUrl}`)

      // Update session status back to active
      updateSessionStatus(sessionId, "active")
      updateSessionActivity(sessionId)

      console.log(`[Playwright] Command completed, agent ready for next command`)

      return NextResponse.json({
        success: true,
        logs,
        screenshots,
        screenshotUrl: afterScreenshot, // Return the final screenshot for main display
        currentUrl: currentUrl
      })

    } catch (commandError) {
      logs.push(`Error executing command: ${commandError.message}`)
      console.error("[Playwright] Error executing command:", commandError)
      
      // Update session status back to active even on error
      updateSessionStatus(sessionId, "active")
      
      return NextResponse.json({
        success: false,
        error: commandError.message,
        logs,
        screenshots
      }, { status: 500 })
    }

  } catch (error) {
    console.error("[Playwright] Error in run-command:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 },
    )
  }
}
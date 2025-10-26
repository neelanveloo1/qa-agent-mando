import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSession } from "@/lib/session-store"
import { promises as fs } from "fs"
import path from "path"

const requestSchema = z.object({
  sessionId: z.string(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId } = requestSchema.parse(body)
    
    const session = getSession(sessionId)
    if (!session) {
      return NextResponse.json({ success: false, error: "Session not found" })
    }

    const { page } = session.instance
    const screenshotBuffer = await page.screenshot({ fullPage: false, type: 'png' })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `live-${sessionId}-${timestamp}.png`
    const screenshotDir = path.join(process.cwd(), 'public', 'screenshots')
    await fs.mkdir(screenshotDir, { recursive: true })
    const screenshotPath = path.join(screenshotDir, filename)
    await fs.writeFile(screenshotPath, screenshotBuffer)

    return NextResponse.json({
      success: true,
      screenshotUrl: `/screenshots/${filename}`
    })
  } catch (error) {
    console.error("[Live Screenshot] Error:", error)
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 })
  }
}


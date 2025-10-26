import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSession, removeSession } from "@/lib/session-store"

const requestSchema = z.object({
  sessionId: z.string(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId } = requestSchema.parse(body)

    console.log(`[v0] Disconnecting agent session: ${sessionId}`)

    // Get the session
    const session = getSession(sessionId)
    if (!session) {
      return NextResponse.json({
        success: false,
        error: "Session not found",
      })
    }

    const { stagehand } = session

    // Close the browser
    try {
      await stagehand.close()
      console.log(`[v0] Browser closed for session: ${sessionId}`)
    } catch (error) {
      console.error(`[v0] Error closing browser for session ${sessionId}:`, error)
    }

    // Remove the session
    removeSession(sessionId)

    console.log(`[v0] Agent disconnected successfully`)

    return NextResponse.json({
      success: true,
      logs: ["Agent disconnected successfully"]
    })

  } catch (error) {
    console.error("[v0] Error in disconnect-agent:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 },
    )
  }
}


import { NextResponse } from "next/server"
import { cleanupAllSessions } from "@/lib/session-store"

export async function POST() {
  try {
    cleanupAllSessions()
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    })
  }
}


import { NextRequest, NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"

export async function GET() {
  try {
    const screenshotDir = path.join(process.cwd(), 'public', 'screenshots')
    
    // Check if directory exists
    try {
      await fs.access(screenshotDir)
    } catch {
      // Directory doesn't exist, return empty array
      return NextResponse.json({ screenshots: [] })
    }
    
    const files = await fs.readdir(screenshotDir)
    
    // Filter for image files only
    const screenshotFiles = files
      .filter(file => /\.(png|jpg|jpeg|gif)$/i.test(file))
      .map(file => ({
        filename: file,
        url: `/screenshots/${file}`,
        createdAt: fs.stat(path.join(screenshotDir, file)).then(stats => stats.mtime)
      }))
    
    // Get creation times for all files
    const screenshotsWithTimes = await Promise.all(
      screenshotFiles.map(async (screenshot) => ({
        filename: screenshot.filename,
        url: screenshot.url,
        createdAt: await screenshot.createdAt
      }))
    )
    
    // Sort by creation time (newest first)
    screenshotsWithTimes.sort((a, b) => 
      b.createdAt.getTime() - a.createdAt.getTime()
    )
    
    return NextResponse.json({ screenshots: screenshotsWithTimes })
  } catch (error) {
    console.error("[Screenshots API] Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch screenshots" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { filename } = body
    
    if (!filename) {
      return NextResponse.json(
        { error: "Filename required" },
        { status: 400 }
      )
    }
    
    const screenshotDir = path.join(process.cwd(), 'public', 'screenshots')
    const filePath = path.join(screenshotDir, filename)
    
    // Check if file exists
    try {
      await fs.access(filePath)
    } catch {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      )
    }
    
    await fs.unlink(filePath)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Screenshots API] Delete error:", error)
    return NextResponse.json(
      { error: "Failed to delete screenshot" },
      { status: 500 }
    )
  }
}


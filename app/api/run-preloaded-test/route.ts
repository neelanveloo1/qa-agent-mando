import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSession, updateSessionStatus } from "@/lib/session-store"
import { SELECTORS } from "@/lib/selectors"
import { promises as fs } from "fs"
import path from "path"
import type { Page } from 'playwright'
import { analyzeDocumentScreenshot } from "@/lib/vision"
import { analyzeSearchResponse, detectSearchState } from "@/lib/vision-search"

const requestSchema = z.object({
  sessionId: z.string(),
  testId: z.string(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, testId } = requestSchema.parse(body)
    
    console.log(`[Preloaded Test] Running test: ${testId} for session: ${sessionId}`)
    
    const session = getSession(sessionId)
    if (!session) {
      return NextResponse.json({ success: false, error: "Session not found" })
    }

    const { page } = session.instance
    updateSessionStatus(sessionId, "executing")
    
    // Get environment from session
    const environment = session.environment || 'production'
    
    let result = { passed: false, message: "", screenshotUrl: "", metadata: {} }
    
    // Execute test based on testId
    if (testId === "docs-loading") {
      result = await testDocsLoading(page, sessionId)
    } else if (testId === "search-results") {
      result = await testSearchResults(page, sessionId)
    }
    
    updateSessionStatus(sessionId, "active")
    
    // Add metadata to result
    result.metadata = {
      testId,
      environment,
      timestamp: new Date().toISOString(),
      sessionId
    }
    
    console.log(`[Preloaded Test] Test ${testId} completed:`, result)
    
    return NextResponse.json({
      success: true,
      testResult: result
    })
  } catch (error) {
    console.error("[Preloaded Test] Error:", error)
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 })
  }
}

async function testDocsLoading(page: Page, sessionId: string) {
  try {
    console.log("[Test: Docs Loading] Starting test")
    
    // Get session to determine environment
    const session = getSession(sessionId)
    const environment = session?.environment || 'production'
    const customUrl = session?.customUrl || 'https://joinmando.com'
    const aiDocsUrl = new URL('/ai-docs', customUrl).href
    
    console.log(`[Test: Docs Loading] Environment: ${environment}`)
    
    // Initialize screenshot directory
    const screenshotDir = path.join(process.cwd(), 'public', 'screenshots')
    await fs.mkdir(screenshotDir, { recursive: true })
    
    // Navigate to AI Docs initially
    console.log("[Test: Docs Loading] Navigating to AI Docs")
    // Try clicking the link first, if that fails, navigate directly
    try {
      await page.getByRole('link', { name: SELECTORS.aiDocs.docsLink }).click()
      await page.waitForTimeout(4000)
    } catch {
      // If link doesn't work, navigate directly
      await page.goto(aiDocsUrl)
      await page.waitForTimeout(4000)
    }
    
    // Test results for each document
    const documentResults: Array<{
      docNumber: number
      passed: boolean
      message: string
      screenshotUrl?: string
      timestamp: string
    }> = []
    
    // Loop through first 3 documents
    for (let i = 0; i < 3; i++) {
      const docNumber = i + 1
      console.log(`[Test: Docs Loading] Testing document ${docNumber}/3`)
      
      try {
        // Get all workflow buttons
        const workflowButtons = await page.getByRole('button').filter({ hasText: 'workflow' }).all()
        
        if (i >= workflowButtons.length) {
          console.log(`[Test: Docs Loading] Only ${workflowButtons.length} documents available, stopping`)
          documentResults.push({
            docNumber,
            passed: false,
            message: `Document ${docNumber} not found (only ${workflowButtons.length} docs available)`
          })
          break
        }
        
        // Click the Nth document
        await workflowButtons[i].click()
        await page.waitForTimeout(4000) // Initial wait time for document to load
        
        // For staging with videos, try to interact with video to trigger loading
        if (environment === 'staging') {
          try {
            console.log(`[Test: Docs Loading] Waiting for video element and attempting to load video`)
            
            // Wait for video element to exist
            await page.waitForSelector('video', { timeout: 10000 })
            console.log(`[Test: Docs Loading] Video element found`)
            
            // Try to interact with the video to trigger loading/playback
            await page.evaluate(() => {
              const video = document.querySelector('video') as HTMLVideoElement | null
              if (video) {
                // Attempt to play the video programmatically
                video.play().catch((error: Error) => {
                  console.log(`Video autoplay prevented: ${error.message}`)
                })
              }
            })
            
            // Give it additional time to load after attempted play
            await page.waitForTimeout(5000)
            console.log(`[Test: Docs Loading] Video interaction complete`)
          } catch (videoError) {
            console.log(`[Test: Docs Loading] Video element not found or interaction failed: ${videoError instanceof Error ? videoError.message : 'Unknown'}`)
          }
        }
        
        // Use vision AI to validate content (applies to both production and staging)
        let contentLoaded = false
        let message = ""
        let base64Screenshot: string | undefined = undefined
        
        try {
          console.log(`[Test: Docs Loading] Using AI vision to analyze document ${docNumber}`)
          
          // Take screenshot
          const docScreenshot = await page.screenshot({ fullPage: false, type: 'png' })
          base64Screenshot = docScreenshot.toString('base64')
          
          // Analyze with vision AI (applies to both production and staging)
          const visionResult = await analyzeDocumentScreenshot(base64Screenshot, environment)
          
          contentLoaded = visionResult.contentLoaded
          message = visionResult.contentLoaded
            ? `Doc ${docNumber}: Content loaded (AI confidence: ${visionResult.confidence}%)`
            : `Doc ${docNumber}: Empty or header only (AI: ${visionResult.reasoning})`
          
          console.log(`[Test: Docs Loading] Vision result: ${message}`)
        } catch (visionError) {
          console.error(`[Test: Docs Loading] Vision analysis failed:`, visionError)
          contentLoaded = false
          message = `Doc ${docNumber}: Vision analysis failed - ${visionError instanceof Error ? visionError.message : 'Unknown'}`
        }
        
        // Save screenshot for this document
        const docTimestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const docFilename = `test-doc-${docNumber}-${environment}-${sessionId}-${docTimestamp}.png`
        
        // Re-take screenshot if we didn't do it yet (for staging case)
        let screenshotForFile: Buffer
        if (environment === 'production' && base64Screenshot) {
          screenshotForFile = Buffer.from(base64Screenshot, 'base64')
        } else {
          screenshotForFile = await page.screenshot({ fullPage: false, type: 'png' })
        }
        
        const docFilePath = path.join(screenshotDir, docFilename)
        await fs.writeFile(docFilePath, screenshotForFile)
        
        documentResults.push({
          docNumber,
          passed: contentLoaded,
          message,
          screenshotUrl: `/screenshots/${docFilename}`,
          timestamp: new Date().toISOString()
        })
        
        console.log(`[Test: Docs Loading] Document ${docNumber} result: ${contentLoaded ? 'PASSED' : 'FAILED'}`)
        
        // Navigate back to AI Docs for next iteration (unless it's the last one)
        if (i < 2) {
          console.log(`[Test: Docs Loading] Returning to AI Docs list`)
          if (environment === 'staging') {
            await page.getByRole('link', { name: 'AI Docs', exact: true }).click()
          } else {
            await page.goto(aiDocsUrl)
          }
          await page.waitForTimeout(4000) // Reduced from 6000
        }
      } catch (docError) {
        console.error(`[Test: Docs Loading] Error testing document ${docNumber}:`, docError)
        
        // Take screenshot even on error
        try {
          const errorScreenshot = await page.screenshot({ fullPage: false, type: 'png' })
          const errorTimestamp = new Date().toISOString().replace(/[:.]/g, '-')
          const errorFilename = `test-doc-${docNumber}-error-${environment}-${sessionId}-${errorTimestamp}.png`
          const errorFilePath = path.join(screenshotDir, errorFilename)
          await fs.writeFile(errorFilePath, errorScreenshot)
          
          documentResults.push({
            docNumber,
            passed: false,
            message: `Doc ${docNumber}: Error - ${docError instanceof Error ? docError.message : 'Unknown'}`,
            screenshotUrl: `/screenshots/${errorFilename}`,
            timestamp: new Date().toISOString()
          })
        } catch (screenshotError) {
          documentResults.push({
            docNumber,
            passed: false,
            message: `Doc ${docNumber}: Error - ${docError instanceof Error ? docError.message : 'Unknown'}`,
            screenshotUrl: "",
            timestamp: new Date().toISOString()
          })
        }
      }
    }
    
    // Calculate overall results
    const passedCount = documentResults.filter(r => r.passed).length
    const totalCount = documentResults.length
    const allPassed = passedCount === totalCount
    
    // Take final screenshot
    console.log("[Test: Docs Loading] Taking screenshot")
    const screenshotBuffer = await page.screenshot({ fullPage: false, type: 'png' })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `test-docs-${environment}-${sessionId}-${timestamp}.png`
    const filePath = path.join(screenshotDir, filename)
    await fs.writeFile(filePath, screenshotBuffer)
    
    // Build summary message with environment
    const summaryMessage = `[${environment}] ${passedCount}/${totalCount} documents passed\n` +
      documentResults.map(r => `  ${r.passed ? '✓' : '✗'} ${r.message}`).join('\n')
    
    console.log(`[Test: Docs Loading] Test ${allPassed ? 'PASSED' : 'FAILED'}: ${summaryMessage}`)
    
    return {
      passed: allPassed,
      message: summaryMessage,
      screenshotUrl: `/screenshots/${filename}`,
      documents: documentResults // Include all per-document results with screenshots
    }
  } catch (error) {
    console.error("[Test: Docs Loading] Error:", error)
    return {
      passed: false,
      message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      screenshotUrl: ""
    }
  }
}

async function testSearchResults(page: Page, sessionId: string) {
  try {
    console.log("[Test: Search Results] Starting test")
    
    // Get session to determine environment
    const session = getSession(sessionId)
    const environment = session?.environment || 'production'
    const customUrl = session?.customUrl || 'https://joinmando.com'
    const aiSearchUrl = new URL('/ai-search', customUrl).href
    
    console.log(`[Test: Search Results] Environment: ${environment}`)
    
    // Initialize screenshot directory
    const screenshotDir = path.join(process.cwd(), 'public', 'screenshots')
    await fs.mkdir(screenshotDir, { recursive: true })
    
    // Get environment-specific selectors
    const selectors = environment === 'staging' 
      ? SELECTORS.aiSearch.staging 
      : SELECTORS.aiSearch.production
    
    // Test queries
    const queries = [
      'What is a calculated field?',
      'What is a worker object?'
    ]
    
    // Store results for each query
    const queryResults: Array<{
      query: string
      passed: boolean
      responseTime: number
      message: string
      screenshotUrl?: string
      screenshots?: string[]
      timestamp: string
    }> = []
    
    // Navigate to AI Search
    console.log("[Test: Search Results] Navigating to AI Search")
    await page.goto(aiSearchUrl)
    await page.waitForTimeout(4000)
    
    // Test each query
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i]
      console.log(`[Test: Search Results] Testing query ${i + 1}/2: "${query}"`)
      
      let passed = false
      let message = ""
      let responseTime = 0
      
      try {
        // Fill search input
        console.log("[Test: Search Results] Filling search input")
        const searchInput = page.getByRole('textbox', { name: selectors.searchInput })
        await searchInput.click()
        await searchInput.fill(query)
        
        // Start timer and click send
        const startTime = Date.now()
        console.log("[Test: Search Results] Clicking send button")
        await page.getByRole('button', { name: selectors.sendButton }).click()
        
        // Poll for search state every 5 seconds (max 30 seconds)
        console.log("[Test: Search Results] Starting polling for search state...")
        let finalState: 'searching' | 'answer-returned' | 'failed' | 'unknown' = 'searching'
        let finalScreenshot: Buffer | null = null
        let pollCount = 0
        const maxPolls = 6 // 30 seconds total (6 polls × 5 seconds)
        const screenshots: Array<{filename: string, state: string}> = []
        
        while (pollCount < maxPolls) {
          await page.waitForTimeout(5000) // Wait 5 seconds between polls
          pollCount++
          
          // Take screenshot
          const screenshot = await page.screenshot({ fullPage: false, type: 'png' })
          const base64Screenshot = screenshot.toString('base64')
          
          // Detect current state
          console.log(`[Test: Search Results] Poll ${pollCount}/${maxPolls} - detecting state...`)
          const stateResult = await detectSearchState(base64Screenshot, query)
          console.log(`[Test: Search Results] State detected: ${stateResult.state} (confidence: ${stateResult.confidence}%) - ${stateResult.reasoning}`)
          
          // Save this screenshot
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
          const filename = `test-search-q${i + 1}-poll${pollCount}-${stateResult.state}-${environment}-${sessionId}-${timestamp}.png`
          const filePath = path.join(screenshotDir, filename)
          await fs.writeFile(filePath, screenshot)
          screenshots.push({ filename: `/screenshots/${filename}`, state: stateResult.state })
          
          // Check if we've moved past "searching" state
          if (stateResult.state === 'answer-returned') {
            console.log(`[Test: Search Results] Answer detected at poll ${pollCount}`)
            finalState = 'answer-returned'
            finalScreenshot = screenshot
            break
          } else if (stateResult.state === 'failed') {
            console.log(`[Test: Search Results] Failed state detected at poll ${pollCount}`)
            finalState = 'failed'
            finalScreenshot = screenshot
            break
          }
          // Continue polling if still "searching" or "unknown"
        }
        
        // Calculate response time
        responseTime = Date.now() - startTime
        
        // Process final state
        if (finalState === 'answer-returned' && finalScreenshot) {
          console.log(`[Test: Search Results] Answer returned successfully`)
          passed = true
          message = `Query "${query}": Answer returned in ${(responseTime / 1000).toFixed(1)}s`
          
          // Save final screenshot
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
          const filename = `test-search-q${i + 1}-final-${environment}-${sessionId}-${timestamp}.png`
          const filePath = path.join(screenshotDir, filename)
          await fs.writeFile(filePath, finalScreenshot)
          
          queryResults.push({
            query,
            passed,
            responseTime,
            message,
            screenshotUrl: `/screenshots/${filename}`,
            screenshots: screenshots.map(s => s.filename),
            timestamp: new Date().toISOString()
          })
        } else if (finalState === 'failed') {
          console.log(`[Test: Search Results] Search failed or unavailable`)
          passed = false
          message = `Query "${query}": Failed to retrieve answer - Mando unavailable or error occurred`
          
          queryResults.push({
            query,
            passed,
            responseTime,
            message,
            screenshotUrl: screenshots.length > 0 ? screenshots[screenshots.length - 1].filename : '',
            screenshots: screenshots.map(s => s.filename),
            timestamp: new Date().toISOString()
          })
        } else {
          // Timeout - still searching after max polls
          console.log(`[Test: Search Results] Timeout after ${maxPolls} polls (${maxPolls * 5}s)`)
          passed = false
          message = `Query "${query}": Response timed out after ${maxPolls * 5}s`
          
          queryResults.push({
            query,
            passed,
            responseTime,
            message,
            screenshotUrl: screenshots.length > 0 ? screenshots[screenshots.length - 1].filename : '',
            screenshots: screenshots.map(s => s.filename),
            timestamp: new Date().toISOString()
          })
        }
        
        // If first query succeeded and passed, verify source link
        if (i === 0 && passed) {
          try {
            console.log("[Test: Search Results] Verifying source link opens")
            
            // Click sources button if needed
            const sourcesButton = page.getByRole('button', { name: selectors.sourcesButton })
            const sourcesVisible = await sourcesButton.isVisible().catch(() => false)
            if (sourcesVisible) {
              await sourcesButton.click()
              await page.waitForTimeout(1000)
            }
            
            // Click first source link (opens in new tab)
            const sourceLink = page.getByRole('link', { name: selectors.sourceLink }).first()
            const [newPage] = await Promise.all([
              page.context().waitForEvent('page'),
              sourceLink.click()
            ])
            
            // Verify new page opened
            await newPage.waitForLoadState('domcontentloaded', { timeout: 5000 })
            console.log("[Test: Search Results] Source link opened successfully")
            await newPage.close()
          } catch (sourceError) {
            console.log(`[Test: Search Results] Source link verification failed: ${sourceError instanceof Error ? sourceError.message : 'Unknown'}`)
          }
        }
        
        // Prepare for next query (if not last)
        if (i < queries.length - 1) {
          console.log("[Test: Search Results] Clicking New Search button")
          await page.getByRole('button', { name: selectors.newSearchButton }).click()
          await page.waitForTimeout(2000)
        }
      } catch (queryError) {
        console.error(`[Test: Search Results] Error testing query "${query}":`, queryError)
        
        // Save error screenshot
        try {
          const errorScreenshot = await page.screenshot({ fullPage: false, type: 'png' })
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
          const filename = `test-search-q${i + 1}-error-${environment}-${sessionId}-${timestamp}.png`
          const filePath = path.join(screenshotDir, filename)
          await fs.writeFile(filePath, errorScreenshot)
          
          queryResults.push({
            query,
            passed: false,
            responseTime: 0,
            message: `Query "${query}": Error - ${queryError instanceof Error ? queryError.message : 'Unknown'}`,
            screenshotUrl: `/screenshots/${filename}`,
            timestamp: new Date().toISOString()
          })
        } catch {
          queryResults.push({
            query,
            passed: false,
            responseTime: 0,
            message: `Query "${query}": Error - ${queryError instanceof Error ? queryError.message : 'Unknown'}`,
            timestamp: new Date().toISOString()
          })
        }
      }
    }
    
    // Calculate overall results
    const passedCount = queryResults.filter(r => r.passed).length
    const totalCount = queryResults.length
    const allPassed = passedCount === totalCount
    
    // Take final screenshot
    const screenshotBuffer = await page.screenshot({ fullPage: false, type: 'png' })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `test-search-${environment}-${sessionId}-${timestamp}.png`
    const filePath = path.join(screenshotDir, filename)
    await fs.writeFile(filePath, screenshotBuffer)
    
    // Build summary message
    const avgResponseTime = queryResults.reduce((sum, r) => sum + r.responseTime, 0) / queryResults.length
    const summaryMessage = `[${environment}] ${passedCount}/${totalCount} queries passed (avg ${(avgResponseTime / 1000).toFixed(1)}s)\n` +
      queryResults.map(r => `  ${r.passed ? '✓' : '✗'} ${r.message}`).join('\n')
    
    console.log(`[Test: Search Results] Test ${allPassed ? 'PASSED' : 'FAILED'}: ${summaryMessage}`)
    
    return {
      passed: allPassed,
      message: summaryMessage,
      screenshotUrl: `/screenshots/${filename}`,
      queries: queryResults
    }
  } catch (error) {
    console.error("[Test: Search Results] Error:", error)
    return {
      passed: false,
      message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      screenshotUrl: ""
    }
  }
}


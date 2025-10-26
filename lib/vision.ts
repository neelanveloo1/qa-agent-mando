import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function analyzeDocumentScreenshot(
  screenshotBase64: string,
  environment?: 'production' | 'staging'
): Promise<{
  contentLoaded: boolean
  confidence: number
  reasoning: string
}> {
  const prompt = `Analyze this screenshot of a Workday workflow documentation page. CRITICALLY determine if the STEP IMAGES/DIAGRAMS have loaded successfully, or if only header/metadata/errors are visible.
    
Return JSON:
{
  "contentLoaded": true/false,
  "confidence": 0-100,
  "reasoning": "brief explanation"
}

CONTENT IS LOADED if you see:
- Visual step images, diagrams, screenshots showing the actual workflow process
- Images that appear within numbered steps (Step 1, Step 2, etc.)
- Step-by-step visual illustrations with screenshots or diagrams embedded
- Video player showing actual video content (not error state)
- Multiple visible images/diagrams demonstrating workflow steps
- Instruction images that are clear, fully rendered, and show UI elements
- Any visual content that shows WHAT TO DO, not just text about what to do

CONTENT IS NOT LOADED if you see:
- ONLY text descriptions without any visual step images
- "Failed to load video" or "Video not available" error messages
- Blank/white space where images should be
- Loading spinners, broken image placeholders, or gray boxes
- Only page header, title, author, publish date with NO step images below
- "Step 1", "Step 2" text labels with NO corresponding images
- Error messages about content not loading
- Placeholder text like "Image loading..." or "Content unavailable"

BE STRICT: If you can read the instructions but don't see the actual SCREENSHOT IMAGES that demonstrate those steps, the content has NOT loaded properly.`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${screenshotBase64}`,
            },
          },
        ],
      },
    ],
    max_tokens: 300,
    response_format: { type: 'json_object' },
  })

  const result = JSON.parse(response.choices[0].message.content || '{}')
  return {
    contentLoaded: result.contentLoaded ?? false,
    confidence: result.confidence ?? 0,
    reasoning: result.reasoning ?? 'No response',
  }
}

export async function analyzeLoginState(
  screenshotBase64: string
): Promise<{
  loggedIn: boolean
  confidence: number
  reasoning: string
}> {
  const prompt = `Analyze this screenshot to determine if the user is logged into the Mando AI application.

Look for these indicators that suggest the user IS logged in:
- "MANDO AI" branding/logo at the top
- A search bar with placeholder text like "Ask MandoAI any Workday question..."
- Sidebar navigation with options like "Dashboard", "AI Search", "AI Docs", "Get Help", "Notifications", "Settings"
- A "Threads" panel or conversation history
- Active application interface elements (complex layout with navigation, search, threads)
- User profile picture or avatar
- Multiple interactive UI elements beyond just a simple form

Look for these indicators that suggest the user is NOT logged in:
- A minimal page with JUST an email input field and continue button
- Password input field
- OTP/verification code input
- "Continue" or "Sign in" buttons with no other app interface
- Blank/minimal page with ONLY a login form visible
- Loading spinner on an otherwise blank page

IMPORTANT: If you see a rich application interface with navigation menus, search bars, threads, or dashboard elements, the user IS logged in. Don't assume "not logged in" just because there might be an email field somewhere on the page - focus on the overall page structure and richness of the interface.

Return JSON:
{
  "loggedIn": true/false,
  "confidence": 0-100,
  "reasoning": "brief explanation of what you see, especially what makes you confident"
}`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${screenshotBase64}`,
            },
          },
        ],
      },
    ],
    max_tokens: 300,
    response_format: { type: 'json_object' },
  })

  const result = JSON.parse(response.choices[0].message.content || '{}')
  return {
    loggedIn: result.loggedIn ?? false,
    confidence: result.confidence ?? 0,
    reasoning: result.reasoning ?? 'No response',
  }
}

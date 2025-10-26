import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function detectSearchState(
  screenshotBase64: string,
  query: string
): Promise<{
  state: 'searching' | 'answer-returned' | 'failed' | 'unknown'
  confidence: number
  reasoning: string
}> {
  const prompt = `Analyze this screenshot of an AI search interface after submitting the query: "${query}"

Determine the current state of the search:

STATE: "searching" (query is still being processed)
- "Searching..." text or indicator is visible
- Loading spinners or animations
- No answer content yet
- AI is still processing

STATE: "answer-returned" (successful answer)
- Paragraphs of text answering the query
- Structured content with explanations
- Multiple sentences forming coherent answers
- Sources, citations, or references displayed
- Answer content area populated with information
- No "Searching..." indicator

STATE: "failed" (error or unavailable)
- "Mando is unavailable" or similar error message
- "Failed to retrieve answer" messages
- "No results found" or connection errors
- Service unavailable messages
- Network error indicators

STATE: "unknown" (cannot determine)
- Unclear state
- Partial or cut-off content

Return JSON:
{
  "state": "searching" | "answer-returned" | "failed" | "unknown",
  "confidence": 0-100,
  "reasoning": "brief explanation"
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
    state: (result.state as 'searching' | 'answer-returned' | 'failed' | 'unknown') || 'unknown',
    confidence: result.confidence ?? 0,
    reasoning: result.reasoning ?? 'No response',
  }
}

export async function analyzeSearchResponse(
  screenshotBase64: string,
  query: string
): Promise<{
  hasResponse: boolean
  confidence: number
  reasoning: string
}> {
  const prompt = `Analyze this screenshot of an AI search interface after submitting the query: "${query}"

Look for indicators that a MEANINGFUL RESPONSE was returned:

RESPONSE IS PRESENT if you see:
- Paragraphs of text answering the query
- Structured content with explanations about the query topic
- Multiple sentences forming a coherent answer
- Sources or citations displayed
- Answer content area populated with relevant information

RESPONSE IS NOT PRESENT if you see:
- "Searching..." loading state still active
- Empty answer area
- Error messages like "No results found" or "Failed to load"
- Only the search input field with no response below
- Loading spinners without content

Return JSON:
{
  "hasResponse": true/false,
  "confidence": 0-100,
  "reasoning": "brief explanation of what you see"
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
    hasResponse: result.hasResponse ?? false,
    confidence: result.confidence ?? 0,
    reasoning: result.reasoning ?? 'No response',
  }
}


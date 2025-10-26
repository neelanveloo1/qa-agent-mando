/**
 * UI Selectors for Mando Agentic Testing
 * 
 * These selectors are used by Playwright to interact with Mando's UI elements.
 * Discovered using Playwright Inspector: npx playwright codegen https://joinmando.com/auth/login
 */

export const SELECTORS = {
  login: {
    emailInput: 'input[role="textbox"][name="Email*"], input[placeholder*="email"], input[type="email"]',
    submitButton: 'button[name="Continue"], button:has-text("Continue"), button[type="submit"]',
    errorMessage: '[role="alert"], .error-message, [class*="error"]',
  },
  otp: {
    input: 'input[role="textbox"], input[type="text"], input[placeholder*="code"], input[placeholder*="otp"]',
    submitButton: 'button:has-text("Verify"), button:has-text("Submit"), button[type="submit"]',
    errorMessage: '[role="alert"], .error-message, [class*="error"]',
  },
  aiSearch: {
    input: 'textarea[placeholder*="Ask"], input[placeholder*="search"], textarea[placeholder*="question"]',
    submitButton: 'button[aria-label="Send"], button:has-text("Send"), button[type="submit"]',
    responseContainer: '.ai-response, [data-testid="ai-response"], [class*="response"]',
    loadingIndicator: '.loading, [data-loading="true"], [class*="loading"]',
  },
  aiDocs: {
    // Link to navigate to AI Docs from main page
    docsLink: 'topic AI Docs',
    // Generic: click first button with "workflow" in the name
    // This will work dynamically for any first document in the list
  },
  // Environment-specific content checks
  aiDocsContent: {
    // Production: Checks for specific image
    production: {
      contentImage: 'Step 1 (Animated)',
    },
    // Staging: Checks for video elements
    staging: {
      videoElement: 'video',
      videoErrorText: 'Failed to load video',
    }
  },
  aiSearch: {
    production: {
      searchInput: 'Ask MandoAI any Workday',
      sendButton: 'copilot-send-question-button',
      searchingIndicator: 'Searching...',
      sourcesButton: 'link Sources',
      newSearchButton: 'New Search',
      sourceLink: 'Workday Logo book_2' // First source link pattern
    },
    staging: {
      searchInput: 'Ask MandoAI any question',
      sendButton: 'copilot-send-question-button',
      searchingIndicator: 'Searching...',
      sourcesButton: 'link Sources',
      newSearchButton: 'New Search',
      sourceLink: 'Mando Logo ads_click' // First source link pattern
    }
  }
} as const

/**
 * Helper function to get selector with fallbacks
 */
export function getSelector(category: keyof typeof SELECTORS, element: string): string {
  const selector = SELECTORS[category][element as keyof typeof SELECTORS[typeof category]]
  if (!selector) {
    throw new Error(`Selector not found: ${category}.${element}`)
  }
  return selector
}

/**
 * Common selectors that might be useful across different pages
 */
export const COMMON_SELECTORS = {
  buttons: {
    submit: 'button[type="submit"]',
    continue: 'button:has-text("Continue")',
    next: 'button:has-text("Next")',
    send: 'button:has-text("Send")',
    verify: 'button:has-text("Verify")',
  },
  inputs: {
    email: 'input[type="email"]',
    text: 'input[type="text"]',
    password: 'input[type="password"]',
    search: 'input[placeholder*="search"], textarea[placeholder*="search"]',
  },
  messages: {
    error: '[role="alert"], .error, [class*="error"]',
    success: '.success, [class*="success"]',
    loading: '.loading, [class*="loading"]',
  },
} as const

# Mando Agentic Testing

A production-ready QA automation tool powered by Playwright for testing the Mando application. Supports both staging (`staging.mando.work`) and production (`joinmando.com`) environments with automated login via magic links or OTP, followed by intelligent test execution with Vision AI validation.

## Features

- **Multi-Environment Support**: Test on production (`joinmando.com`) or staging (`staging.mando.work`)
- **Flexible Login Options**: Use magic links or OTP-based authentication
- **Vision AI Validation**: Uses OpenAI GPT-4 Vision API to validate test results
- **Real-Time Monitoring**: Live screenshot feed and activity stream
- **Preloaded Test Suite**: Automated tests for docs loading and search functionality
- **Interactive Test Panel**: View test history, screenshots, and results with expandable details
- **Smart Session Management**: Persistent sessions with automatic cleanup

## Prerequisites

- Node.js 18+ and npm
- OpenAI API key for Vision AI analysis
- Access to Mando staging or production environment

## ⚠️ Important Notes

- **Screenshot Management**: This app captures screenshots every 2 seconds during active sessions and stores them locally. Screenshots can quickly accumulate and take up significant disk space. Always use "End Session" before closing, and periodically clean up screenshots from `public/screenshots/` directory.
- **Session Cleanup**: Always click "End Session" when done testing to properly clean up browser sessions and stop screenshot capture.

## Setup

1. Clone the repository:
```bash
git clone https://github.com/neelanveloo1/qa-agent-mando.git
cd qa-agent-mando
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```bash
OPENAI_API_KEY=sk-your-actual-key-here
```

4. Run the development server:
```bash
npm run dev
```

5. Open http://localhost:3000 in your browser

## How to Use

### Option 1: Magic Link Login

1. Get a magic link from Mando (staging or production)
2. Enter your email address in the web app
3. Paste the magic link into the "Start URL" field
4. Click "Log Agent In"
5. The agent automatically detects you're logged in and activates

### Option 2: OTP Login

1. Enter your email address
2. Enter the login URL (default: `https://joinmando.com/auth/login` for production, or `https://staging.mando.work/auth/login` for staging)
3. Click "Log Agent In"
4. The agent will navigate to the login page
5. Check your email for the 6-digit OTP code
6. Enter the OTP in the web interface
7. The agent completes login automatically

### Running Tests

Once logged in, you'll see the Test Suite panel with preloaded tests:

1. **Check if docs load correctly**
   - Validates document images load successfully
   - Tests first 3 documents in AI Docs
   - Uses Vision AI to confirm step images/diagrams load

2. **Test search returns results**
   - Tests AI search functionality with Workday queries
   - Measures response time (target: <20s)
   - Validates meaningful answers using Vision AI
   - Checks source link functionality

3. Click "Run Test" on any test to execute it
4. View real-time progress in the Live Agent View
5. Check test results with detailed Vision AI analysis
6. Click screenshot links to view them in a modal overlay

## How It Works

### Login Detection

The agent uses **OpenAI GPT-4 Vision API** to analyze screenshots and determine login state:
- **Magic Links**: Automatically detects logged-in state and activates the session
- **OTP Flow**: Detects login page, fills email, waits for OTP input, completes authentication

### Test Execution

Tests run automated Playwright flows:
1. Navigate to target pages (AI Docs, AI Search, etc.)
2. Interact with UI elements using precise selectors
3. Capture screenshots at key points
4. Use Vision AI to validate content loading and functionality
5. Return structured results with pass/fail status and reasoning

### Vision AI Validation

The tool uses GPT-4 Vision API to:
- **Login Detection**: Determine if user is logged in based on UI elements
- **Document Validation**: Verify step images and diagrams load correctly
- **Search Validation**: Confirm AI responses are meaningful and complete

## Available Tests

### Check if docs load correctly
- **Environment**: Both staging and production
- **Flow**: Navigates to `/ai-docs`, clicks first 3 documents, validates content loads
- **Validation**: Vision AI checks for step images, diagrams, or video content
- **Result**: Shows per-document results with screenshots

### Test search returns results
- **Environment**: Both staging and production
- **Flow**: Navigates to `/ai-search`, submits 2 Workday queries, measures response time
- **Validation**: Vision AI confirms meaningful AI responses returned within 20s
- **Result**: Shows per-query results with polling screenshots and response times

## Technical Stack

- **Frontend**: Next.js 16 with React 19, Tailwind CSS, Radix UI
- **Automation**: Playwright for browser automation
- **AI Vision**: OpenAI GPT-4 Vision API for content validation
- **Session Management**: In-memory storage with automatic cleanup

## Project Structure

```
/app
  /api
    run-test.ts          # Initialize agent (magic link or OTP)
    submit-otp.ts        # Handle OTP submission
    run-preloaded-test.ts # Execute test suite
    live-screenshot.ts    # Real-time screenshots
  page.tsx               # Main UI
/lib
  selectors.ts           # Playwright selectors (staging/production)
  session-store.ts       # Session management
  vision.ts              # Login state detection
  vision-search.ts       # Search state detection
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | Your OpenAI API key for Vision AI | Yes |

## Important: Screenshot Management

⚠️ **The app takes screenshots every 2 seconds when the agent is active** and stores them in:
```
public/screenshots/
```

**Before closing or ending your session:**
1. Always click "End Session" to properly clean up
2. Your screenshots are stored at `/Users/[your-username]/Downloads/qa-agent/public/screenshots/`
3. Screenshots can accumulate quickly - delete them periodically to free up disk space

**To delete screenshots:**
- Use the "Screenshots" button in the active agent status bar to view and delete screenshots via the UI
- Or manually delete from: `public/screenshots/` directory in your project folder

## Security Notes

- Never commit your `.env` file to git
- The `.gitignore` file already excludes `.env*` files
- Keep your OpenAI API key secure
- Screenshots are stored locally in `public/screenshots/`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT
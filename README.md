# Mando Agentic Testing

A web-based QA automation tool powered by Playwright for testing the Mando application at joinmando.com.

## Features

- Web UI for launching and monitoring tests
- Real-time test logs and status updates
- Interactive OTP input through the browser
- Automated login flow testing with Playwright
- Live screenshot feed during test execution

## Setup

1. Install dependencies: `npm install`
2. Run locally: `npm run dev`
3. Open http://localhost:3000

## How to Use

1. Open the web app in your browser
2. Enter your email address for the Mando login
3. Click "Launch Test"
4. When prompted, check your email for the OTP
5. Enter the OTP in the web interface
6. View the test results in real-time
7. Once logged in, send commands to the active agent

## How It Works

The QA agent uses Playwright to:
- Navigate to joinmando.com/auth/login
- Enter your email using precise selectors
- Wait for you to provide the OTP through the web UI
- Complete the login and verify success
- Execute test commands and capture screenshots
- Report results back to the interface

## Extending the Tests

You can add more test scenarios by:
- Creating new API routes in `app/api/`
- Adding test buttons to the main page
- Building additional Playwright automation flows
- Validating page content and user flows after login

## Technical Details

- **Frontend**: Next.js 16 with React 19
- **Automation**: Playwright
- **Session Management**: In-memory storage (use Redis for production)
- **UI**: Tailwind CSS with Radix UI components
// Shared session store for API routes
// Using global variable to persist across Next.js API route calls
// In production, use Redis or a proper database

import type { Browser, Page } from 'playwright'

// Session status types
type SessionStatus = "initializing" | "active" | "executing" | "idle"

// Session instance type (only Playwright now)
type SessionInstance = { browser: Browser; page: Page }

// Declare global variable to ensure persistence across API routes
declare global {
  var __activeSessions: Map<string, { 
    instance: SessionInstance;
    email: string;
    customUrl?: string;
    environment: 'production' | 'staging';
    createdAt: number;
    status: SessionStatus;
    lastActivity: number;
  }> | undefined;
}

// Initialize global session store if it doesn't exist
if (!global.__activeSessions) {
  global.__activeSessions = new Map();
}

const activeSessions = global.__activeSessions;

// Clean up expired sessions (older than 10 minutes)
export function cleanupExpiredSessions() {
  const now = Date.now()
  const tenMinutes = 10 * 60 * 1000
  
  for (const [sessionId, session] of activeSessions.entries()) {
    // Only clean up if session is truly expired AND not active
    if (now - session.createdAt > tenMinutes && session.status !== 'active') {
      console.log(`[Session Store] Cleaning up expired session: ${sessionId}`)
      // Try to close the browser before removing
      try {
        session.instance.browser.close()
      } catch (error) {
        console.log(`[Session Store] Error closing browser for session ${sessionId}:`, error)
      }
      activeSessions.delete(sessionId)
    }
  }
}

// Add a Playwright session (renamed from addPlaywrightSession)
export function addSession(
  sessionId: string, 
  browser: Browser, 
  page: Page, 
  email: string = '', 
  status: SessionStatus = "initializing",
  customUrl?: string
) {
  // Detect environment from customUrl or default
  const baseUrl = customUrl || 'https://joinmando.com/auth/login'
  const environment = baseUrl.includes('staging.mando.work') ? 'staging' : 'production'
  
  console.log(`[Session Store] Before adding session ${sessionId}, current sessions:`, Array.from(activeSessions.keys()))
  activeSessions.set(sessionId, {
    instance: { browser, page },
    email,
    customUrl,
    environment,
    createdAt: Date.now(),
    status,
    lastActivity: Date.now()
  })
  console.log(`[Session Store] Added session: ${sessionId}, status: ${status}, environment: ${environment}, total sessions: ${activeSessions.size}`)
  console.log(`[Session Store] All sessions after add:`, Array.from(activeSessions.keys()))
}

// Get a session
export function getSession(sessionId: string) {
  console.log(`[Session Store] Looking for session: ${sessionId}`)
  console.log(`[Session Store] Current sessions:`, Array.from(activeSessions.keys()))
  console.log(`[Session Store] Global sessions reference:`, global.__activeSessions === activeSessions)
  
  const session = activeSessions.get(sessionId)
  if (session) {
    console.log(`[Session Store] Retrieved session: ${sessionId}, age: ${Date.now() - session.createdAt}ms`)
  } else {
    console.log(`[Session Store] Session not found: ${sessionId}, available sessions: ${Array.from(activeSessions.keys())}`)
  }
  return session
}

// Remove a session
export function removeSession(sessionId: string) {
  const existed = activeSessions.delete(sessionId)
  console.log(`[Session Store] Removed session: ${sessionId}, existed: ${existed}, remaining sessions: ${activeSessions.size}`)
  return existed
}

// Update session status
export function updateSessionStatus(sessionId: string, status: SessionStatus) {
  const session = activeSessions.get(sessionId)
  if (session) {
    session.status = status
    session.lastActivity = Date.now()
    console.log(`[Session Store] Updated session ${sessionId} status to: ${status}`)
  }
}

// Update session activity
export function updateSessionActivity(sessionId: string) {
  const session = activeSessions.get(sessionId)
  if (session) {
    session.lastActivity = Date.now()
  }
}

// Clean up all sessions
export function cleanupAllSessions() {
  console.log(`[Session Store] Cleaning up all ${activeSessions.size} sessions`)
  
  for (const [sessionId, session] of activeSessions.entries()) {
    try {
      console.log(`[Session Store] Closing browser for session: ${sessionId}`)
      session.instance.browser.close()
    } catch (error) {
      console.log(`[Session Store] Error closing browser for session ${sessionId}:`, error)
    }
  }
  activeSessions.clear()
  console.log(`[Session Store] All sessions cleaned up`)
}

// Debug function to check global state
export function debugGlobalState() {
  console.log(`[Session Store] Global state check:`)
  console.log(`[Session Store] - global.__activeSessions exists:`, !!global.__activeSessions)
  console.log(`[Session Store] - activeSessions reference:`, activeSessions)
  console.log(`[Session Store] - activeSessions size:`, activeSessions.size)
  console.log(`[Session Store] - activeSessions keys:`, Array.from(activeSessions.keys()))
}

// Note: Process cleanup listeners removed to prevent memory leaks
// Cleanup is handled by the application lifecycle instead
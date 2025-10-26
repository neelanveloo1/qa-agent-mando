"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { Loader2, PlayCircle, CheckCircle2, XCircle, X, Camera, Activity, Clock, Lock, RotateCw, Trash2, Image as ImageIcon, Search, FileText, ArrowLeft } from "lucide-react"

type TestStatus = "idle" | "running" | "waiting-for-otp" | "active" | "success" | "error"

export default function QAAgentPage() {
  const [status, setStatus] = useState<TestStatus>("idle")
  const [logs, setLogs] = useState<string[]>([])
  const [otp, setOtp] = useState("")
  const [email, setEmail] = useState("")
  const [customUrl, setCustomUrl] = useState("https://joinmando.com/auth/login")
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [showSetupGuide, setShowSetupGuide] = useState(true)
  const [agentActive, setAgentActive] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [liveScreenshotUrl, setLiveScreenshotUrl] = useState<string | null>(null)
  const [activityLogs, setActivityLogs] = useState<Array<{id: string, message: string, timestamp: Date, type: 'screenshot' | 'info' | 'error', screenshotUrl?: string}>>([])
  const logsContainerRef = useRef<HTMLDivElement>(null)
  // Load test results from localStorage on mount - now stores arrays of results per test
  const [testResults, setTestResults] = useState<Record<string, Array<{
    passed: boolean
    message: string
    timestamp: Date
    screenshotUrl?: string
    documents?: Array<{
      docNumber: number
      passed: boolean
      message: string
      screenshotUrl?: string
      timestamp: string
    }>
    queries?: Array<{
      query: string
      passed: boolean
      responseTime: number
      message: string
      screenshotUrl?: string
      screenshots?: string[]
      timestamp: string
    }>
    metadata?: {
      testId: string
      environment: string
      timestamp: string
      sessionId: string
    }
    runId?: string // Add unique identifier for each run
  }>>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const stored = localStorage.getItem('testResults')
      if (stored) {
        const parsed = JSON.parse(stored)
        // Convert timestamp strings back to Date objects for each result in each array
        const converted = Object.entries(parsed).reduce((acc, [key, value]: [string, any]) => {
          acc[key] = Array.isArray(value) 
            ? value.map((item: any) => ({
                ...item,
                timestamp: new Date(item.timestamp)
              }))
            : [{
                ...value,
                timestamp: new Date(value.timestamp)
              }]
          return acc
        }, {} as any)
        return converted
      }
    } catch (e) {
      console.error('Failed to load test results from localStorage:', e)
    }
    return {}
  })
  const [runningTestId, setRunningTestId] = useState<string | null>(null)
  const [screenshots, setScreenshots] = useState<Array<{filename: string, url: string, createdAt: Date}>>([])
  const [showGallery, setShowGallery] = useState(false)
  const [endingSession, setEndingSession] = useState(false)
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null)
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set())
  const [modalScreenshot, setModalScreenshot] = useState<string | null>(null)

  // ExpandableMessage component
  const ExpandableMessage = ({ 
    message, 
    id, 
    expanded, 
    onToggle 
  }: { 
    message: string
    id: string
    expanded: boolean
    onToggle: () => void
  }) => {
    const isLong = message.length > 150

    return (
      <div>
        <p className={`text-sm text-slate-600 ${!expanded && isLong ? 'line-clamp-2' : ''}`}>
          {message}
        </p>
        {isLong && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onToggle()
            }}
            className="text-xs text-blue-500 hover:text-blue-600 mt-1 font-medium transition-colors"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
    )
  }

  // Preloaded tests configuration
  const PRELOADED_TESTS = [
    {
      id: "docs-loading",
      name: "Check if docs load correctly",
      description: "Verifies document images load successfully",
      icon: FileText
    },
    {
      id: "search-results",
      name: "Test search returns results",
      description: "Validates AI search responds to queries within 20s with meaningful answers",
      icon: Search
    }
  ]

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`])
  }

  const addActivityLog = (message: string, type: 'screenshot' | 'info' | 'error' = 'info', screenshotUrl?: string) => {
    const newLog = {
      id: Math.random().toString(36).substring(7),
      message,
      timestamp: new Date(),
      type,
      screenshotUrl
    }
    setActivityLogs((prev) => [...prev.slice(-9), newLog]) // Keep last 10 entries
  }

  // Save test results to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('testResults', JSON.stringify(testResults))
    } catch (e) {
      console.error('Failed to save test results to localStorage:', e)
    }
  }, [testResults])

  // Load dismissal state from localStorage on mount
  useEffect(() => {
    const dismissed = localStorage.getItem('setupGuideDismissed')
    if (dismissed === 'true') setShowSetupGuide(false)
  }, [])

  // Auto-scroll to latest activity log within horizontal container
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollLeft = logsContainerRef.current.scrollWidth
    }
  }, [activityLogs])

  // Fetch screenshots when gallery opens
  const fetchScreenshots = async () => {
    try {
      const response = await fetch('/api/screenshots')
      const data = await response.json()
      setScreenshots(data.screenshots || [])
    } catch (error) {
      console.error('Failed to fetch screenshots:', error)
    }
  }

  // Delete screenshot
  const deleteScreenshot = async (filename: string) => {
    try {
      const response = await fetch('/api/screenshots', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      })
      if (response.ok) {
        setScreenshots(prev => prev.filter(s => s.filename !== filename))
      }
    } catch (error) {
      console.error('Failed to delete screenshot:', error)
    }
  }

  useEffect(() => {
    if (showGallery) {
      fetchScreenshots()
    }
  }, [showGallery])

  // Restore active session on page load
  useEffect(() => {
    const savedSession = localStorage.getItem('activeSession')
    if (savedSession) {
      try {
        const { sessionId, email: savedEmail, timestamp } = JSON.parse(savedSession)
        
        // Only restore if session is less than 30 minutes old
        const age = Date.now() - timestamp
        if (age < 30 * 60 * 1000) { // 30 minutes
          setAgentActive(true)
          setActiveSessionId(sessionId)
          setStatus("active")
          addLog(`Restored active session: ${sessionId}`)
        } else {
          // Session expired, clear it
          localStorage.removeItem('activeSession')
          addLog("Previous session expired")
        }
      } catch (error) {
        console.error('Failed to restore session:', error)
        localStorage.removeItem('activeSession')
      }
    }
  }, [])

  // Auto-screenshot polling for live view
  useEffect(() => {
    if (!agentActive || !activeSessionId) return

    const fetchLiveScreenshot = async () => {
      try {
        const response = await fetch('/api/live-screenshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: activeSessionId })
        })
        const data = await response.json()
        
        if (data.success && data.screenshotUrl) {
          setLiveScreenshotUrl(data.screenshotUrl)
          addActivityLog(`📸 Screenshot captured at ${new Date().toLocaleTimeString()}`, 'screenshot', data.screenshotUrl)
        } else if (data.error === "Session not found") {
          // Session no longer exists on backend
          setAgentActive(false)
          setActiveSessionId(null)
          setStatus("idle")
          localStorage.removeItem('activeSession')
          addLog("Session expired or closed")
        }
      } catch (error) {
        console.error('Failed to get live screenshot:', error)
      }
    }

    // Initial fetch
    fetchLiveScreenshot()

    // Poll every 2 seconds
    const interval = setInterval(fetchLiveScreenshot, 2000)

    return () => clearInterval(interval)
  }, [agentActive, activeSessionId])

  // Handle dismissal
  const dismissSetupGuide = () => {
    setShowSetupGuide(false)
    localStorage.setItem('setupGuideDismissed', 'true')
  }

  const startTest = async () => {
    setStatus("running")
    setLogs([])
    setOtp("")
    setSessionId(null)
    addLog("Starting agent...")

    try {
      const endpoint = "/api/run-test"
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          startUrl: customUrl || "https://joinmando.com/auth/login",
          email: email
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error("API error response:", response.status, errorText)
        setStatus("error")
        addLog(`Server error: ${response.status} ${errorText}`)
        return
      }

      const data = await response.json()

      console.log("API Response:", JSON.stringify(data, null, 2))

      if (data.success && data.loggedIn) {
        // Already logged in - agent is active
        setAgentActive(true)
        setActiveSessionId(data.sessionId)
        setStatus("active")
        addActivityLog("✅ Agent activated and ready", 'info')
        
        if (data.logs) {
          data.logs.forEach((log: string) => addLog(log))
        }
        
        // Persist session to localStorage
        localStorage.setItem('activeSession', JSON.stringify({
          sessionId: data.sessionId,
          email: '',
          timestamp: Date.now()
        }))
        
        addLog("Agent is now ACTIVE and ready for commands!")
      } else if (data.success && data.requiresOtp) {
        setSessionId(data.sessionId)
        setStatus("waiting-for-otp")
        addLog("OTP screen detected, waiting for OTP entry...")
        if (data.logs) {
          data.logs.forEach((log: string) => addLog(log))
        }
      } else if (data.success) {
        setStatus("success")
        addLog("Test completed successfully!")
        if (data.logs) {
          data.logs.forEach((log: string) => addLog(log))
        }
      } else {
        setStatus("error")
        addLog(`Error: ${data.error || 'Unknown error'}`)
        if (data.logs) {
          data.logs.forEach((log: string) => addLog(log))
        }
      }
    } catch (error) {
      setStatus("error")
      addLog(`Error: ${error instanceof Error ? error.message : "Unknown error"}`)
      console.error("Start test error:", error)
    }
  }

  const submitOtp = async () => {
    if (!otp || !sessionId) return

    addLog(`Submitting OTP...`)
    setStatus("running")

    try {
      const endpoint = "/api/submit-otp"
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, otp }),
      })

      const data = await response.json()

      if (data.success) {
        if (data.status === "active") {
          setStatus("active")
          setAgentActive(true)
          setActiveSessionId(data.sessionId)
          addActivityLog("✅ Agent activated and ready for commands", 'info')
          if (data.screenshotUrl) {
            setLiveScreenshotUrl(data.screenshotUrl) // Use as initial live view
            addActivityLog(`📸 Initial screenshot captured at ${new Date().toLocaleTimeString()}`, 'screenshot', data.screenshotUrl)
          }
          
          // Persist session to localStorage
          localStorage.setItem('activeSession', JSON.stringify({
            sessionId: data.sessionId,
            email: '',
            timestamp: Date.now()
          }))
          
          addLog("Agent is now ACTIVE and ready for commands!")
        } else {
        setStatus("success")
        addLog("Login successful!")
        addLog("Test completed!")
        }
        
        if (data.screenshotUrl) {
          addLog(`Screenshot captured: ${data.screenshotUrl}`)
          console.log("Screenshot URL received:", data.screenshotUrl)
        } else {
          addLog("No screenshot URL received from server")
          console.log("No screenshot URL in response:", data)
        }
        if (data.logs) {
          data.logs.forEach((log: string) => addLog(log))
        }
      } else {
        setStatus("error")
        addLog(`Error: ${data.error}`)
      }
    } catch (error) {
      setStatus("error")
      addLog(`Error: ${error instanceof Error ? error.message : "Unknown error"}`)
    }

    setOtp("")
    setSessionId(null)
  }


  const runPreloadedTest = async (testId: string) => {
    if (!activeSessionId) return
    
    const testName = PRELOADED_TESTS.find(t => t.id === testId)?.name || testId
    setRunningTestId(testId)
    addActivityLog(`▶️ Running test: ${testName}`, 'info')
    
    try {
      const response = await fetch("/api/run-preloaded-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: activeSessionId, testId }),
      })
      
      const data = await response.json()
      
      if (data.success && data.testResult) {
        setTestResults(prev => ({
          ...prev,
          [testId]: [
            {
              passed: data.testResult.passed,
              message: data.testResult.message,
              timestamp: new Date(),
              screenshotUrl: data.testResult.screenshotUrl,
              documents: data.testResult.documents,
              queries: data.testResult.queries,
              metadata: data.testResult.metadata,
              runId: Math.random().toString(36).substring(7) // Unique ID for this run
            },
            ...(prev[testId] || []) // Add new result to top, old ones below
          ]
        }))
        
        if (data.testResult.screenshotUrl) {
          setLiveScreenshotUrl(data.testResult.screenshotUrl)
          addActivityLog(`📸 Test screenshot captured`, 'screenshot', data.testResult.screenshotUrl)
        }
        
        addActivityLog(
          `${data.testResult.passed ? '✅ Test PASSED' : '❌ Test FAILED'}: ${data.testResult.message}`,
          data.testResult.passed ? 'info' : 'error'
        )
      } else {
        addActivityLog(`❌ Test error: ${data.error || 'Unknown error'}`, 'error')
      }
    } catch (error) {
      addActivityLog(`❌ Test error: ${error instanceof Error ? error.message : 'Unknown'}`, 'error')
    } finally {
      setRunningTestId(null)
    }
  }

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-br from-background via-background to-muted/20 flex flex-col">
      {/* Active Agent Status */}
      {agentActive && (
        <div className="w-full bg-gradient-to-r from-green-100 to-green-200 border border-green-200/50 rounded-lg shadow-sm mb-6 flex items-center justify-between px-4 py-1">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-light text-gray-700 tracking-wide">
                Agent Active
              </span>
        </div>
            <p className="text-xs text-gray-600 font-light">
              Live view updating every 2 seconds • Session: {activeSessionId?.slice(0, 6)}...
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowGallery(true)}
              variant="outline"
              className="bg-blue-100/80 hover:bg-blue-200/90 text-gray-700 border-blue-200/50 hover:border-blue-300/70 shadow-sm text-xs font-light px-3 py-1"
            >
              <ImageIcon className="mr-2 h-3 w-3" />
              Screenshots
            </Button>
            <Button
              onClick={async () => {
                setEndingSession(true)
                try {
                  await fetch("/api/cleanup-sessions", { method: "POST" })
                  addLog("All sessions cleared")
                  setAgentActive(false)
                  setActiveSessionId(null)
                  setLiveScreenshotUrl(null)
                  setActivityLogs([])
                } catch (error) {
                  addLog(`Error clearing sessions: ${error}`)
                } finally {
                  setEndingSession(false)
                }
              }}
              variant="outline"
              className="bg-red-100/80 hover:bg-red-200/90 text-gray-700 border-red-200/50 hover:border-red-300/70 shadow-sm text-xs font-light px-3 py-1"
              disabled={endingSession}
            >
              {endingSession ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  Ending...
                </>
              ) : (
                "End Session"
              )}
            </Button>
          </div>
            </div>
      )}
      
      {/* Main Layout - Single Column */}
      <div className="flex-1 overflow-hidden flex flex-col p-8 pt-0">
        <div className="flex-1 overflow-hidden flex flex-col gap-6">
          {/* Title */}
          <div className="text-center pt-8">
            <h1 className="text-4xl font-light tracking-tight text-gray-900">
              Mando Agentic Testing
            </h1>
          </div>


          {/* Login Form (when not active) */}
          {!agentActive && (
            <Card className="max-w-md mx-auto border-2 shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader>
                <CardTitle className="text-xl font-light">Start Agent</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
                  <Label htmlFor="email">Email (required for login URLs)</Label>
              <Input
                id="email"
                type="email"
                    placeholder="your.email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === "running" || status === "waiting-for-otp"}
                    className="font-light"
                  />
                  <p className="text-xs text-gray-500 mt-1 font-light">
                    Your Mando email address
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customUrl">Start URL</Label>
                  <Input
                    id="customUrl"
                    type="text"
                    placeholder="https://joinmando.com/auth/login or paste a magic link"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    disabled={status === "running" || status === "waiting-for-otp"}
                    className="font-light"
                  />
                  <p className="text-xs text-gray-500 mt-1 font-light">
                    Enter a login URL or magic link to start the agent
                  </p>
            </div>

            {status === "waiting-for-otp" && (
                  <Alert className="border-2 border-primary/20 bg-primary/5 animate-in fade-in-50 slide-in-from-top-2">
                <AlertDescription>
                  <div className="space-y-3">
                        <p className="font-semibold text-base">Check your email for the OTP code</p>
                    <div className="space-y-2">
                          <Label htmlFor="otp" className="text-base">Enter OTP</Label>
                      <div className="flex gap-2">
                        <Input
                          id="otp"
                          type="text"
                          placeholder="Enter OTP code"
                          value={otp}
                          onChange={(e) => setOtp(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && submitOtp()}
                              className="h-11 text-base"
                        />
                            <Button onClick={submitOtp} disabled={!otp} className="h-11 px-6 shadow-md hover:shadow-lg">
                          Submit
                        </Button>
                      </div>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}

                {status === "error" && (
                  <Alert className="border-red-200 bg-red-50 text-red-700">
                    <AlertDescription>
                      <div className="space-y-2">
                        <p className="font-semibold text-base">Error</p>
                        <p className="text-sm">{logs[logs.length - 1] || 'An error occurred'}</p>
                        <Button
                          onClick={() => setStatus("idle")}
                          variant="outline"
                          size="sm"
                          className="mt-2"
                        >
                          Try Again
                        </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <Button
              onClick={startTest}
                  disabled={status === "running" || status === "waiting-for-otp"}
                  className="w-full h-12 text-base shadow-md hover:shadow-lg transition-all"
            >
              {status === "running" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running Test...
                </>
              ) : status === "waiting-for-otp" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Waiting for OTP...
                </>
              ) : (
                <>
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Log Agent In
                </>
              )}
            </Button>
          </CardContent>
        </Card>
          )}

          {/* When agent is active, show side-by-side layout */}
          {agentActive && (
            <div className="grid grid-cols-10 gap-4 flex-1 min-h-0">
              {/* Live Agent View - 70% */}
              <div className="col-span-7 flex flex-col overflow-hidden">
                <Card className="border-2 shadow-lg h-full flex flex-col overflow-hidden">
                  <CardHeader className="py-0 pb-0.5 px-4">
                    <CardTitle className="text-lg font-light leading-tight">Live Agent View</CardTitle>
                    <CardDescription className="text-xs font-light">
                      Real-time view with continuous event stream
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0 flex flex-col flex-1">
                    {/* Screenshot Viewer */}
                    <div className="relative w-full flex-1 overflow-auto bg-gray-50 flex items-start justify-center px-3 py-0">
                      {liveScreenshotUrl ? (
                        <img 
                          src={liveScreenshotUrl} 
                          alt="Live agent view"
                          className="w-3/4 h-auto transition-all duration-300 ease-in-out"
                          onLoad={(e) => {
                            e.currentTarget.style.opacity = '1'
                            e.currentTarget.style.transform = 'scale(1)'
                          }}
                          onLoadStart={(e) => {
                            e.currentTarget.style.opacity = '0.95'
                            e.currentTarget.style.transform = 'scale(0.998)'
                          }}
                          style={{ 
                            opacity: 1,
                            transform: 'scale(1)',
                            transition: 'opacity 0.3s ease-in-out, transform 0.3s ease-in-out'
                          }}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center">
                            <Spinner className="mx-auto mb-4" />
                            <p className="text-gray-500 font-light">Loading live view...</p>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Horizontal Event Stream */}
                    <div className="bg-gradient-to-r from-gray-50 to-white p-4 border-t border-gray-200">
                      <div ref={logsContainerRef} className="flex gap-2 overflow-x-auto pb-2">
                        {activityLogs.map((log) => {
                          const content = (
                            <>
                              <div className="flex-shrink-0">
                                {log.type === 'screenshot' && <Camera className="h-3 w-3 text-blue-400" />}
                                {log.type === 'info' && <CheckCircle2 className="h-3 w-3 text-green-400" />}
                                {log.type === 'error' && <XCircle className="h-3 w-3 text-red-400" />}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-light text-gray-700 whitespace-nowrap">{log.message}</p>
                                <p className="text-xs font-light text-gray-400">{log.timestamp.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                              </div>
                            </>
                          )
                          
                          if (log.screenshotUrl) {
                            return (
                              <a 
                                key={log.id}
                                href={log.screenshotUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-md bg-white/80 backdrop-blur-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-1 duration-200 hover:bg-white hover:shadow-md cursor-pointer transition-all"
                              >
                                {content}
                              </a>
                            )
                          }
                          
                          return (
                            <div 
                              key={log.id}
                              className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-md bg-white/80 backdrop-blur-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-1 duration-200"
                            >
                              {content}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              {/* Test Panel - Single unified panel */}
              <div className="col-span-3 flex flex-col overflow-hidden">
                <Card className="border-2 shadow-lg h-full flex flex-col overflow-hidden">
                  <CardHeader 
                    className="flex-shrink-0 cursor-pointer hover:bg-slate-50/50 transition-colors"
                    onClick={() => selectedTestId && setSelectedTestId(null)}
                  >
                    <div className="flex items-center gap-2">
                      {selectedTestId && (
                        <ArrowLeft className="h-4 w-4 text-slate-500" />
                      )}
                      <div className="flex-1">
                        <CardTitle className="text-lg font-light">Test Suite</CardTitle>
                        <CardDescription className="text-sm font-light">
                          {selectedTestId 
                            ? 'Click header to return' 
                            : 'Click any test to run or view history'}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-y-auto p-4 scroll-smooth">
                    {selectedTestId ? (
                      /* Single Test History View */
                      (() => {
                        const results = testResults[selectedTestId] || []
                        const test = PRELOADED_TESTS.find(t => t.id === selectedTestId)
                        
                        return (
                          <div className="space-y-4">
                            {/* Test info header */}
                            <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
                              <test.icon className="h-6 w-6 text-slate-600" />
                              <div>
                                <h3 className="font-semibold text-slate-900">{test.name}</h3>
                                <p className="text-xs text-slate-500">{test.description}</p>
                              </div>
                            </div>
                            
                            {/* Running state */}
                            {runningTestId === selectedTestId ? (
                              <div className="flex flex-col items-center py-12">
                                <div className="relative">
                                  <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
                                  <div className="absolute inset-0 h-12 w-12 border-4 border-blue-200 rounded-full animate-ping" />
                                </div>
                                <p className="text-slate-700 font-semibold mt-6 text-lg">Running test...</p>
                                <p className="text-slate-500 text-sm mt-2 animate-pulse">{test.name}</p>
                              </div>
                            ) : results.length === 0 ? (
                              <div className="text-center py-12">
                                <CheckCircle2 className="mx-auto h-12 w-12 text-slate-400 mb-4" />
                                <p className="text-slate-500 font-light">No test results yet</p>
                                <p className="text-xs text-slate-400 mt-2">Run this test to see results</p>
                              </div>
                            ) : (
                              /* History list */
                              <div className="space-y-3">
                                {results.map((result, idx) => (
                                  <div
                                    key={result.runId || `${selectedTestId}-run-${idx}-${result.timestamp.getTime()}`}
                                    className={`
                                      relative overflow-hidden rounded-xl p-4 border-l-4
                                      transition-all duration-300 ease-out animate-slide-in-bottom
                                      ${result.passed 
                                        ? 'bg-emerald-50/50 border-emerald-400' 
                                        : 'bg-rose-50/50 border-rose-400'}
                                    `}
                                    style={{ animationDelay: `${idx * 100}ms` }}
                                  >
                                    {/* Overall status */}
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        {result.passed ? (
                                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                        ) : (
                                          <XCircle className="h-5 w-5 text-rose-600" />
                                        )}
                                        <span className={`font-semibold ${
                                          result.passed ? 'text-emerald-700' : 'text-rose-700'
                                        }`}>
                                          {result.passed ? 'PASSED' : 'FAILED'}
                                        </span>
                                      </div>
                                      <span className="text-xs text-slate-500 font-mono">
                                        {result.timestamp.toLocaleString('en-US', { 
                                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                                        })}
                                      </span>
                                    </div>

                                    {/* Summary message */}
                                    <ExpandableMessage 
                                      key={`message-${selectedTestId}-${result.runId || result.timestamp.getTime()}`}
                                      id={`message-${selectedTestId}-${result.runId || result.timestamp.getTime()}`}
                                      message={result.message}
                                      expanded={expandedMessages.has(`message-${selectedTestId}-${result.runId || result.timestamp.getTime()}`)}
                                      onToggle={() => {
                                        const id = `message-${selectedTestId}-${result.runId || result.timestamp.getTime()}`
                                        setExpandedMessages(prev => {
                                          const next = new Set(prev)
                                          if (next.has(id)) {
                                            next.delete(id)
                                          } else {
                                            next.add(id)
                                          }
                                          return next
                                        })
                                      }}
                                    />

                                    {/* Vision API Results - Documents */}
                                    {result.documents && result.documents.length > 0 && (
                                      <div className="mt-3 space-y-2">
                                        <p className="text-xs font-semibold text-slate-700">Document Checks:</p>
                                        {result.documents.map((doc: any, i) => (
                                          <div key={i} className="ml-3 pl-3 border-l-2 border-slate-200 text-xs">
                                            <div className="flex items-center gap-2">
                                              {doc.passed ? (
                                                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                              ) : (
                                                <XCircle className="h-3 w-3 text-rose-500" />
                                              )}
                                              <span className="font-medium">Document {doc.docNumber}</span>
                                            </div>
                                            <p className="text-slate-600 mt-1">{doc.message}</p>
                                            {doc.screenshotUrl && (
                                              <button
                                                onClick={(e) => {
                                                  e.preventDefault()
                                                  e.stopPropagation()
                                                  setModalScreenshot(doc.screenshotUrl)
                                                }}
                                                className="text-blue-500 hover:underline mt-1 inline-block text-xs cursor-pointer"
                                              >
                                                📸 View screenshot
                                              </button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Vision API Results - Queries */}
                                    {result.queries && result.queries.length > 0 && (
                                      <div className="mt-3 space-y-2">
                                        <p className="text-xs font-semibold text-slate-700">Query Checks:</p>
                                        {result.queries.map((query: any, i) => (
                                          <div key={i} className="ml-3 pl-3 border-l-2 border-slate-200 text-xs">
                                            <div className="flex items-center gap-2">
                                              {query.passed ? (
                                                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                              ) : (
                                                <XCircle className="h-3 w-3 text-rose-500" />
                                              )}
                                              <span className="font-medium">Query {i + 1}</span>
                                            </div>
                                            <p className="text-slate-600 mt-1">{query.message}</p>
                                            {(query.screenshotUrl || (query.screenshots && query.screenshots.length > 0)) && (
                                              <div className="mt-2 flex flex-col gap-1">
                                                {query.screenshotUrl && (
                                                  <button
                                                    onClick={(e) => {
                                                      e.preventDefault()
                                                      e.stopPropagation()
                                                      setModalScreenshot(query.screenshotUrl)
                                                    }}
                                                    className="text-blue-500 hover:underline text-xs cursor-pointer text-left"
                                                  >
                                                    📸 View final screenshot
                                                  </button>
                                                )}
                                                {query.screenshots && query.screenshots.length > 0 && query.screenshots.map((screenshot, idx) => (
                                                  <button
                                                    key={idx}
                                                    onClick={(e) => {
                                                      e.preventDefault()
                                                      e.stopPropagation()
                                                      setModalScreenshot(screenshot)
                                                    }}
                                                    className="text-blue-500 hover:underline text-xs cursor-pointer text-left"
                                                  >
                                                    📸 View poll {idx + 1}
                                                  </button>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })()
                    ) : (
                      /* All Tests View */
                      <div className="space-y-3">
                        {PRELOADED_TESTS.map((test, idx) => {
                          const results = testResults[test.id] || []
                          const latestResult = results[0]
                          const isRunning = runningTestId === test.id
                          
                          return (
                            <div
                              key={test.id}
                              className={`
                                group relative
                                bg-white/80 backdrop-blur-sm rounded-xl p-4
                                border-2 transition-all duration-200 ease-out
                                ${isRunning ? 'border-amber-400 animate-pulse' : 
                                  latestResult?.passed ? 'border-emerald-200' : 
                                  latestResult && !latestResult.passed ? 'border-rose-200' : 
                                  'border-slate-200'}
                                animate-fade-in-up
                              `}
                              style={{ animationDelay: `${idx * 50}ms`, opacity: 0 }}
                            >
                              {/* Status Badge */}
                              <div className="absolute top-2 right-2">
                                {isRunning && (
                                  <div className="bg-amber-100 text-amber-600 px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Running
                                  </div>
                                )}
                                {!isRunning && latestResult?.passed && (
                                  <div className="bg-emerald-100 text-emerald-600 px-2 py-1 rounded-full text-xs font-medium animate-bounce-in">
                                    <CheckCircle2 className="h-3 w-3" />
                                  </div>
                                )}
                                {!isRunning && latestResult && !latestResult.passed && (
                                  <div className="bg-rose-100 text-rose-600 px-2 py-1 rounded-full text-xs font-medium animate-shake">
                                    <XCircle className="h-3 w-3" />
                                  </div>
                                )}
                              </div>

                              {/* Icon & Content */}
                              <div className="flex items-start gap-3 pr-16">
                                <test.icon className="h-6 w-6 text-slate-600 flex-shrink-0 mt-1" />
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-semibold text-slate-900">{test.name}</h3>
                                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{test.description}</p>
                                  {latestResult && (
                                    <p className="text-xs text-slate-400 mt-2">
                                      Last run • {latestResult.metadata?.environment || 'production'} • {latestResult.timestamp.toLocaleString('en-US', { 
                                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                                      })}
                                    </p>
                                  )}
                                </div>
                              </div>
                              
                              {/* Action Buttons */}
                              <div className="flex gap-2 mt-3">
                                <Button
                                  onClick={() => {
                                    if (!isRunning && runningTestId === null) {
                                      runPreloadedTest(test.id)
                                    }
                                  }}
                                  disabled={isRunning || runningTestId !== null}
                                  size="sm"
                                  className="flex-1 h-8 text-xs"
                                  variant={isRunning ? "outline" : "default"}
                                >
                                  {isRunning ? (
                                    <>
                                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                      Running
                                    </>
                                  ) : (
                                    "Run Test"
                                  )}
                                </Button>
                                
                                {results.length > 0 && (
                                  <Button
                                    onClick={() => setSelectedTestId(test.id)}
                                    disabled={isRunning}
                                    size="sm"
                                    variant="outline"
                                    className="h-8 text-xs"
                                  >
                                    History ({results.length})
                                  </Button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Screenshots Gallery Modal */}
      {showGallery && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-8">
          <Card className="w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <CardHeader className="flex-shrink-0 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-light">Screenshots Gallery</CardTitle>
                  <CardDescription className="text-sm">
                    All captured screenshots from test runs
                  </CardDescription>
                </div>
                <Button
                  onClick={() => setShowGallery(false)}
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-6">
              {screenshots.length === 0 ? (
                <div className="text-center py-12">
                  <ImageIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-gray-500 font-light">No screenshots yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {screenshots.map((screenshot) => (
                    <div key={screenshot.filename} className="group relative">
                      <a
                        href={screenshot.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block aspect-video bg-gray-100 rounded-lg overflow-hidden border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all"
                      >
                        <img
                          src={screenshot.url}
                          alt={screenshot.filename}
                          className="w-full h-full object-cover"
                        />
                      </a>
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          onClick={(e) => {
                            e.preventDefault()
                            deleteScreenshot(screenshot.filename)
                          }}
                          size="icon"
                          variant="destructive"
                          className="h-8 w-8 shadow-lg"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="mt-2">
                        <p className="text-xs text-gray-500 truncate" title={screenshot.filename}>
                          {screenshot.filename}
                        </p>
                        <p className="text-xs text-gray-400">
                          {screenshot.createdAt.toLocaleString()}
                        </p>
                      </div>
                  </div>
                ))}
              </div>
              )}
            </CardContent>
          </Card>
        </div>
        )}

      {/* Screenshot Modal */}
      {modalScreenshot && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-8"
          onClick={() => setModalScreenshot(null)}
        >
          <div className="relative max-w-6xl max-h-[90vh] w-full h-full flex items-center justify-center">
            <Button
              onClick={() => setModalScreenshot(null)}
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 h-10 w-10 bg-white/10 hover:bg-white/20 text-white z-10"
            >
              <X className="h-6 w-6" />
            </Button>
            <img
              src={modalScreenshot}
              alt="Screenshot"
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  )
}

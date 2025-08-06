"use client"

import React from "react"

import { useState, useRef, useCallback, useEffect } from "react"
import { Settings, ArrowLeft, RotateCcw, ChevronUp, ChevronDown } from "lucide-react"

interface TouchData {
  isActive: boolean
  startX: number
  startY: number
  currentX: number
  currentY: number
  value: number
}

interface ControlSettings {
  sensitivity: number
  deadZone: number
  smoothing: number
}

interface ReverseSettings {
  forward: boolean
  turn: boolean
  pan: boolean
  tilt: boolean
}

interface TrimSettings {
  forwardTrim: number
  turnTrim: number
  panTrim: number
}

interface CameraSettings {
  streamQuality: string
  panLimit: number
  tiltLimit: number
  smoothMovement: boolean
}

interface DriveLayoutSettings {
  mode: "tracked" | "truck" | "claw"
}

interface AppSettings {
  control: ControlSettings
  reverse: ReverseSettings
  trim: TrimSettings
  camera: CameraSettings
  driveLayout: DriveLayoutSettings
}

const defaultSettings: AppSettings = {
  control: {
    sensitivity: 100,
    deadZone: 5,
    smoothing: 0,
  },
  reverse: {
    forward: false,
    turn: false,
    pan: false,
    tilt: false,
  },
  trim: {
    forwardTrim: 0,
    turnTrim: 0,
    panTrim: 0,
    tiltTrim: 0,
  },
  camera: {
    streamQuality: "cif",
    panLimit: 90,
    tiltLimit: 45,
    smoothMovement: true,
  },
  driveLayout: {
    mode: "tracked",
  },
}

const ESP32_IP = "http://192.168.4.21"

export default function RobotControlUI() {
  const [leftTouch, setLeftTouch] = useState<TouchData>({
    isActive: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    value: 0,
  })

  const [rightTouch, setRightTouch] = useState<TouchData>({
    isActive: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    value: 0,
  })

  const [cameraControl, setCameraControl] = useState({
    isActive: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    panValue: 0,
    tiltValue: 0,
  })

  const [lastTapTime, setLastTapTime] = useState(0)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [currentSettingsView, setCurrentSettingsView] = useState<string>("main")
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [isFlashlightOn, setIsFlashlightOn] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(true)

  const [isRecording, setIsRecording] = useState(false)
  const [isPlaybackOpen, setIsPlaybackOpen] = useState(false)
  const [mediaFiles, setMediaFiles] = useState<
    Array<{
      name: string
      type: "image" | "video"
      size: number
      timestamp: string
      url: string
    }>
  >([])
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)

  const [showInstructions, setShowInstructions] = useState(true)


  const fetchMediaFiles = useCallback(async () => {
    try {
      const response = await fetch(`${ESP32_IP}/media-list`)
      const files = await response.json()
      setMediaFiles(files)
    } catch (error) {
      console.error("Failed to fetch media files:", error)
    }
  }, [])

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem("robotControlSettings")
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings)
        setSettings({ ...defaultSettings, ...parsed })
      } catch (error) {
        console.error("Failed to load settings:", error)
      }
    }
  }, [])

  // Save settings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("robotControlSettings", JSON.stringify(settings))
  }, [settings])

  // Apply sensitivity and dead zone to control values
  const applyControlSettings = useCallback(
    (rawValue: number, trim = 0) => {
      const sensitivity = settings.control.sensitivity / 100
      const deadZone = settings.control.deadZone / 100

      // Apply dead zone
      if (Math.abs(rawValue) < deadZone) {
        return trim / 100
      }

      // Apply sensitivity and trim
      const adjustedValue = rawValue * sensitivity + trim / 100
      return Math.max(-1, Math.min(1, adjustedValue))
    },
    [settings.control.sensitivity, settings.control.deadZone],
  )

  // Handle touch start
  const handleTouchStart = useCallback((e: React.TouchEvent, side: "left" | "right") => {
    e.preventDefault()
    const touch = e.touches[0]
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = touch.clientX - rect.left
    const y = touch.clientY - rect.top

    const touchData = {
      isActive: true,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      value: 0,
    }

    if (side === "left") {
      setLeftTouch(touchData)
    } else {
      setRightTouch(touchData)
    }
  }, [])

  // Handle touch move
  const handleTouchMove = useCallback(
    (e: React.TouchEvent, side: "left" | "right") => {
      e.preventDefault()
      const touch = e.touches[0]
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const x = touch.clientX - rect.left
      const y = touch.clientY - rect.top

      if (side === "left") {
        setLeftTouch((prev) => {
          if (!prev.isActive) return prev
          const deltaY = prev.startY - y
          const maxDistance = 100
          const clampedDelta = Math.max(-maxDistance, Math.min(maxDistance, deltaY))
          let rawValue = clampedDelta / maxDistance

          // Apply reverse direction
          if (settings.reverse.forward) {
            rawValue = -rawValue
          }

          // Apply control settings and trim
          const value = applyControlSettings(rawValue, settings.trim.forwardTrim)

          return {
            ...prev,
            currentX: x,
            currentY: y,
            value,
          }
        })
      } else {
        setRightTouch((prev) => {
          if (!prev.isActive) return prev
          const deltaX = x - prev.startX
          const maxDistance = 100
          const clampedDelta = Math.max(-maxDistance, Math.min(maxDistance, deltaX))
          let rawValue = clampedDelta / maxDistance

          // Apply reverse direction
          if (settings.reverse.turn) {
            rawValue = -rawValue
          }

          // Apply control settings and trim
          const value = applyControlSettings(rawValue, settings.trim.turnTrim)

          return {
            ...prev,
            currentX: x,
            currentY: y,
            value,
          }
        })
      }
    },
    [
      settings.reverse.forward,
      settings.reverse.turn,
      settings.trim.forwardTrim,
      settings.trim.turnTrim,
      applyControlSettings,
    ],
  )

  // Handle touch end
  const handleTouchEnd = useCallback(
    (side: "left" | "right") => {
      if (side === "left") {
        setLeftTouch((prev) => ({ ...prev, isActive: false, value: settings.trim.forwardTrim / 100 }))
      } else {
        setRightTouch((prev) => ({ ...prev, isActive: false, value: settings.trim.turnTrim / 100 }))
      }
    },
    [settings.trim.forwardTrim, settings.trim.turnTrim],
  )

  // Handle mouse start (similar to touch start)
  const handleMouseStart = useCallback((e: React.MouseEvent, side: "left" | "right") => {
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const touchData = {
      isActive: true,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      value: 0,
    }

    if (side === "left") {
      setLeftTouch(touchData)
    } else {
      setRightTouch(touchData)
    }
  }, [])

  // Handle mouse move (similar to touch move)
  const handleMouseMove = useCallback(
    (e: React.MouseEvent, side: "left" | "right") => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      if (side === "left") {
        setLeftTouch((prev) => {
          if (!prev.isActive) return prev
          const deltaY = prev.startY - y
          const maxDistance = 100
          const clampedDelta = Math.max(-maxDistance, Math.min(maxDistance, deltaY))
          let rawValue = clampedDelta / maxDistance

          if (settings.reverse.forward) {
            rawValue = -rawValue
          }

          const value = applyControlSettings(rawValue, settings.trim.forwardTrim)

          return {
            ...prev,
            currentX: x,
            currentY: y,
            value,
          }
        })
      } else {
        setRightTouch((prev) => {
          if (!prev.isActive) return prev
          const deltaX = x - prev.startX
          const maxDistance = 100
          const clampedDelta = Math.max(-maxDistance, Math.min(maxDistance, deltaX))
          let rawValue = clampedDelta / maxDistance

          if (settings.reverse.turn) {
            rawValue = -rawValue
          }

          const value = applyControlSettings(rawValue, settings.trim.turnTrim)

          return {
            ...prev,
            currentX: x,
            currentY: y,
            value,
          }
        })
      }
    },
    [
      settings.reverse.forward,
      settings.reverse.turn,
      settings.trim.forwardTrim,
      settings.trim.turnTrim,
      applyControlSettings,
    ],
  )

  // Handle mouse end
  const handleMouseEnd = useCallback(
    (side: "left" | "right") => {
      if (side === "left") {
        setLeftTouch((prev) => ({ ...prev, isActive: false, value: settings.trim.forwardTrim / 100 }))
      } else {
        setRightTouch((prev) => ({ ...prev, isActive: false, value: settings.trim.turnTrim / 100 }))
      }
    },
    [settings.trim.forwardTrim, settings.trim.turnTrim],
  )

  // Handle camera touch start
  const handleCameraTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault()
      const touch = e.touches[0]
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const x = touch.clientX - rect.left
      const y = touch.clientY - rect.top

      // Check for double tap to recenter
      const currentTime = Date.now()
      if (currentTime - lastTapTime < 300) {
        setCameraControl((prev) => ({
          ...prev,
          panValue: settings.trim.panTrim / 100,
          tiltValue: settings.trim.tiltTrim / 100,
        }))
        setLastTapTime(0)
        return
      }
      setLastTapTime(currentTime)

      setCameraControl((prev) => ({
        ...prev,
        isActive: true,
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
      }))
    },
    [lastTapTime, settings.trim.panTrim, settings.trim.tiltTrim],
  )

  // Handle camera touch move
  const handleCameraTouchMove = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault()
      const touch = e.touches[0]
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const x = touch.clientX - rect.left
      const y = touch.clientY - rect.top

      setCameraControl((prev) => {
        if (!prev.isActive) return prev

        const deltaX = x - prev.startX
        const deltaY = prev.startY - y
        const maxDistance = 80

        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
        const clampedDistance = Math.min(distance, maxDistance)
        const angle = Math.atan2(deltaY, deltaX)

        const clampedDeltaX = Math.cos(angle) * clampedDistance
        const clampedDeltaY = Math.sin(angle) * clampedDistance

        let panValue = clampedDeltaX / maxDistance
        let tiltValue = clampedDeltaY / maxDistance

        // Apply reverse direction
        if (settings.reverse.pan) {
          panValue = -panValue
        }
        if (settings.reverse.tilt) {
          tiltValue = -tiltValue
        }

        // Apply control settings and trim
        panValue = applyControlSettings(panValue, settings.trim.panTrim)
        tiltValue = applyControlSettings(tiltValue, settings.trim.tiltTrim)

        // Apply camera limits
        const panLimit = settings.camera.panLimit / 90
        const tiltLimit = settings.camera.tiltLimit / 90
        panValue = Math.max(-panLimit, Math.min(panLimit, panValue))
        tiltValue = Math.max(-tiltLimit, Math.min(tiltLimit, tiltValue))

        return {
          ...prev,
          currentX: x,
          currentY: y,
          panValue,
          tiltValue,
        }
      })
    },
    [
      settings.reverse.pan,
      settings.reverse.tilt,
      settings.trim.panTrim,
      settings.trim.tiltTrim,
      settings.camera.panLimit,
      settings.camera.tiltLimit,
      applyControlSettings,
    ],
  )

  // Handle camera touch end
  const handleCameraTouchEnd = useCallback(() => {
    setCameraControl((prev) => ({
      ...prev,
      isActive: false,
    }))
  }, [])

  // Handle camera mouse events (for testing)
  const handleCameraMouseStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      const currentTime = Date.now()
      if (currentTime - lastTapTime < 300) {
        setCameraControl((prev) => ({
          ...prev,
          panValue: settings.trim.panTrim / 100,
          tiltValue: settings.trim.tiltTrim / 100,
        }))
        setLastTapTime(0)
        return
      }
      setLastTapTime(currentTime)

      setCameraControl((prev) => ({
        ...prev,
        isActive: true,
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
      }))
    },
    [lastTapTime, settings.trim.panTrim, settings.trim.tiltTrim],
  )

  const handleCameraMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      setCameraControl((prev) => {
        if (!prev.isActive) return prev

        const deltaX = x - prev.startX
        const deltaY = y - prev.startY
        const maxDistance = 80

        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
        const clampedDistance = Math.min(distance, maxDistance)
        const angle = Math.atan2(deltaY, deltaX)

        const clampedDeltaX = Math.cos(angle) * clampedDistance
        const clampedDeltaY = Math.sin(angle) * clampedDistance

        let panValue = clampedDeltaX / maxDistance
        let tiltValue = clampedDeltaY / maxDistance

        if (settings.reverse.pan) {
          panValue = -panValue
        }
        if (settings.reverse.tilt) {
          tiltValue = -tiltValue
        }

        panValue = applyControlSettings(panValue, settings.trim.panTrim)
        tiltValue = applyControlSettings(tiltValue, settings.trim.tiltTrim)

        const panLimit = settings.camera.panLimit / 90
        const tiltLimit = settings.camera.tiltLimit / 90
        panValue = Math.max(-panLimit, Math.min(panLimit, panValue))
        tiltValue = Math.max(-tiltLimit, Math.min(tiltLimit, tiltValue))

        return {
          ...prev,
          currentX: x,
          currentY: y,
          panValue,
          tiltValue,
        }
      })
    },
    [
      settings.reverse.pan,
      settings.reverse.tilt,
      settings.trim.panTrim,
      settings.trim.tiltTrim,
      settings.camera.panLimit,
      settings.camera.tiltLimit,
      applyControlSettings,
    ],
  )

  const handleCameraMouseEnd = useCallback(() => {
    setCameraControl((prev) => ({
      ...prev,
      isActive: false,
    }))
  }, [])

  const toggleSettings = useCallback(() => {
    setIsSettingsOpen((prev) => !prev)
    setCurrentSettingsView("main")
  }, [])

  const updateSettings = useCallback((category: keyof AppSettings, key: string, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: value,
      },
    }))
  }, [])

  const resetSettings = useCallback(() => {
    setSettings(defaultSettings)
    localStorage.removeItem("robotControlSettings")
  }, [])

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev)

    if (!document.fullscreenElement) {
      // Enter fullscreen
      document.documentElement.requestFullscreen().catch((err) => {
        console.log(`Error attempting to enable fullscreen: ${err.message}`)
      })
    } else {
      // Exit fullscreen
      document.exitFullscreen().catch((err) => {
        console.log(`Error attempting to exit fullscreen: ${err.message}`)
      })
    }
  }, [])

  const takeStillPhoto = useCallback(async () => {
    try {
      const response = await fetch(`${ESP32_IP}/capture`)
      const result = await response.json()
      if (result.success) {
        console.log("Photo captured:", result.filename)
        // Refresh media files list
        fetchMediaFiles()
      }
    } catch (error) {
      console.error("Failed to capture photo:", error)
    }
  }, [fetchMediaFiles])

  const toggleVideoRecording = useCallback(async () => {
    try {
      const endpoint = isRecording ? "/stop-recording" : "/start-recording"
      const response = await fetch(`${ESP32_IP}${endpoint}`)
      const result = await response.json()
      if (result.success) {
        setIsRecording(!isRecording)
        console.log(isRecording ? "Recording stopped" : "Recording started")
        if (!isRecording) {
          // Refresh media files list when recording stops
          fetchMediaFiles()
        }
      }
    } catch (error) {
      console.error("Failed to toggle recording:", error)
    }
  }, [isRecording, fetchMediaFiles])

  const deleteMediaFile = useCallback(
    async (filename: string) => {
      try {
        const response = await fetch(`${ESP32_IP}/delete-media?file=${filename}`, {
          method: "DELETE",
        })
        const result = await response.json()
        if (result.success) {
          fetchMediaFiles() // Refresh the list
        }
      } catch (error) {
        console.error("Failed to delete media file:", error)
      }
    },
    [fetchMediaFiles],
  )

  const togglePlayback = useCallback(() => {
    setIsPlaybackOpen((prev) => !prev)
    if (!isPlaybackOpen) {
      fetchMediaFiles()
    }
    setSelectedMedia(null)
  }, [isPlaybackOpen, fetchMediaFiles])

  // Send control commands to ESP32 (placeholder function)
  const sendControlCommand = useCallback(
    (forward: number, turn: number, pan: number, tilt: number, flashlight: boolean) => {
      console.log(
        `Forward: ${forward.toFixed(2)}, Turn: ${turn.toFixed(2)}, Pan: ${pan.toFixed(2)}, Tilt: ${tilt.toFixed(2)}, Flashlight: ${flashlight}`,
      )
    },
    [],
  )

  const toggleFlashlight = useCallback(() => {
    setIsFlashlightOn((prev) => !prev)
    // Send flashlight command to ESP32
    console.log(`Flashlight: ${!isFlashlightOn ? "ON" : "OFF"}`)
    // Example: fetch(`http://your-esp32-ip/flashlight?state=${!isFlashlightOn}`)
  }, [isFlashlightOn])

  // Send commands when values change
  React.useEffect(() => {
    sendControlCommand(
      leftTouch.value,
      rightTouch.value,
      cameraControl.panValue,
      cameraControl.tiltValue,
      isFlashlightOn,
    )
  }, [
    leftTouch.value,
    rightTouch.value,
    cameraControl.panValue,
    cameraControl.tiltValue,
    isFlashlightOn,
    sendControlCommand,
  ])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
    }
  }, [])

  const renderSettingsContent = () => {
    switch (currentSettingsView) {
      case "control":
        return (
          <div className="space-y-4">
            <div className="flex items-center mb-4">
              <button onClick={() => setCurrentSettingsView("main")} className="text-gray-400 hover:text-white mr-3">
                <ArrowLeft size={20} />
              </button>
              <h3 className="text-white text-lg font-semibold">Control Settings</h3>
            </div>

            <div>
              <label className="block text-white text-sm mb-2">Sensitivity: {settings.control.sensitivity}%</label>
              <input
                type="range"
                min="10"
                max="200"
                value={settings.control.sensitivity}
                onChange={(e) => updateSettings("control", "sensitivity", Number.parseInt(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              />
            </div>

            <div>
              <label className="block text-white text-sm mb-2">Dead Zone: {settings.control.deadZone}%</label>
              <input
                type="range"
                min="0"
                max="20"
                value={settings.control.deadZone}
                onChange={(e) => updateSettings("control", "deadZone", Number.parseInt(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              />
            </div>

            <div>
              <label className="block text-white text-sm mb-2">Smoothing: {settings.control.smoothing}%</label>
              <input
                type="range"
                min="0"
                max="50"
                value={settings.control.smoothing}
                onChange={(e) => updateSettings("control", "smoothing", Number.parseInt(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              />
            </div>
          </div>
        )

      case "reverse":
        return (
          <div className="space-y-4">
            <div className="flex items-center mb-4">
              <button onClick={() => setCurrentSettingsView("main")} className="text-gray-400 hover:text-white mr-3">
                <ArrowLeft size={20} />
              </button>
              <h3 className="text-white text-lg font-semibold">Reverse Direction</h3>
            </div>

            {[
              { key: "forward", label: "Forward/Backward" },
              { key: "turn", label: "Left/Right Turn" },
              { key: "pan", label: "Camera Pan" },
              { key: "tilt", label: "Camera Tilt" },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-white">{label}</span>
                <button
                  onClick={() => updateSettings("reverse", key, !settings.reverse[key as keyof ReverseSettings])}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    settings.reverse[key as keyof ReverseSettings] ? "bg-blue-500" : "bg-gray-600"
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full transition-transform ${
                      settings.reverse[key as keyof ReverseSettings] ? "translate-x-6" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        )

      case "trim":
        return (
          <div className="space-y-4">
            <div className="flex items-center mb-4">
              <button onClick={() => setCurrentSettingsView("main")} className="text-gray-400 hover:text-white mr-3">
                <ArrowLeft size={20} />
              </button>
              <h3 className="text-white text-lg font-semibold">Trim Adjustments</h3>
            </div>

            {[
              { key: "forwardTrim", label: "Forward Trim", min: -20, max: 20 },
              { key: "turnTrim", label: "Turn Trim", min: -20, max: 20 },
              { key: "panTrim", label: "Pan Trim", min: -20, max: 20 },
              { key: "tiltTrim", label: "Tilt Trim", min: -20, max: 20 },
            ].map(({ key, label, min, max }) => (
              <div key={key}>
                <label className="block text-white text-sm mb-2">
                  {label}: {settings.trim[key as keyof TrimSettings]}%
                </label>
                <input
                  type="range"
                  min={min}
                  max={max}
                  value={settings.trim[key as keyof TrimSettings]}
                  onChange={(e) => updateSettings("trim", key, Number.parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                />
              </div>
            ))}

            <button
              onClick={() =>
                setSettings((prev) => ({
                  ...prev,
                  trim: { forwardTrim: 0, turnTrim: 0, panTrim: 0, tiltTrim: 0 },
                }))
              }
              className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg transition-colors"
            >
              Reset All Trim
            </button>
          </div>
        )

      case "camera":
        return (
          <div className="space-y-4">
            <div className="flex items-center mb-4">
              <button onClick={() => setCurrentSettingsView("main")} className="text-gray-400 hover:text-white mr-3">
                <ArrowLeft size={20} />
              </button>
              <h3 className="text-white text-lg font-semibold">Camera Settings</h3>
            </div>

            <div>
              <label className="block text-white text-sm mb-2">Stream Quality</label>
              <select
                value={settings.camera.streamQuality}
                onChange={(e) => updateSettings("camera", "streamQuality", e.target.value)}
                className="w-full bg-gray-700 text-white p-2 rounded-lg border border-gray-600"
              >
                <option value="qvga">QVGA (320×240) - Best Frame Rate</option>
                <option value="cif">CIF (352×288) - Balanced</option>
                <option value="vga">VGA (640×480) - Best Quality</option>
              </select>
            </div>

            <div>
              <label className="block text-white text-sm mb-2">Pan Limit: ±{settings.camera.panLimit}°</label>
              <input
                type="range"
                min="30"
                max="180"
                value={settings.camera.panLimit}
                onChange={(e) => updateSettings("camera", "panLimit", Number.parseInt(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              />
            </div>

            <div>
              <label className="block text-white text-sm mb-2">Tilt Limit: ±{settings.camera.tiltLimit}°</label>
              <input
                type="range"
                min="15"
                max="90"
                value={settings.camera.tiltLimit}
                onChange={(e) => updateSettings("camera", "tiltLimit", Number.parseInt(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-white">Smooth Movement</span>
              <button
                onClick={() => updateSettings("camera", "smoothMovement", !settings.camera.smoothMovement)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.camera.smoothMovement ? "bg-blue-500" : "bg-gray-600"
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    settings.camera.smoothMovement ? "translate-x-6" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          </div>
        )

      case "driveLayout":
        return (
          <div className="space-y-4">
            <div className="flex items-center mb-4">
              <button onClick={() => setCurrentSettingsView("main")} className="text-gray-400 hover:text-white mr-3">
                <ArrowLeft size={20} />
              </button>
              <h3 className="text-white text-lg font-semibold">Drive Layout</h3>
            </div>

            <div className="space-y-3">
              {[
                {
                  value: "tracked",
                  label: "Tracked Mode",
                  description: "Tank-style driving with dual motors for forward/turn, servos for camera pan/tilt",
                },
                {
                  value: "truck",
                  label: "Truck Mode",
                  description: "Motors in unison for forward/reverse, servo steering with camera pan linked",
                },
                {
                  value: "claw",
                  label: "Claw Mode",
                  description: "Robotic arm control (future implementation)",
                },
              ].map(({ value, label, description }) => (
                <div key={value} className="space-y-2">
                  <button
                    onClick={() => updateSettings("driveLayout", "mode", value)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      settings.driveLayout.mode === value
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    <div className="font-semibold">{label}</div>
                    <div className="text-sm opacity-75 mt-1">{description}</div>
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 bg-gray-800 rounded-lg border border-gray-600">
              <div className="text-white text-sm font-semibold mb-2">
                Current Mode:{" "}
                {settings.driveLayout.mode === "tracked"
                  ? "Tracked Mode"
                  : settings.driveLayout.mode === "truck"
                    ? "Truck Mode"
                    : "Claw Mode"}
              </div>
              <div className="text-gray-400 text-xs">
                {settings.driveLayout.mode === "tracked" &&
                  "Left/Right controls turn individual tracks. Camera pan/tilt independent."}
                {settings.driveLayout.mode === "truck" &&
                  "Left/Right controls steering servo. Camera pan linked to steering."}
                {settings.driveLayout.mode === "claw" && "Controls configured for robotic arm operation."}
              </div>
            </div>
          </div>
        )

      default:
        return (
          <div className="space-y-3">
            <button
              onClick={() => setCurrentSettingsView("control")}
              className="w-full text-left text-white hover:bg-gray-800 p-3 rounded-lg transition-colors flex items-center justify-between"
            >
              <span>Control Settings</span>
              <span className="text-gray-400 text-sm">›</span>
            </button>

            <button
              onClick={() => setCurrentSettingsView("reverse")}
              className="w-full text-left text-white hover:bg-gray-800 p-3 rounded-lg transition-colors flex items-center justify-between"
            >
              <span>Reverse Direction</span>
              <span className="text-gray-400 text-sm">›</span>
            </button>

            <button
              onClick={() => setCurrentSettingsView("trim")}
              className="w-full text-left text-white hover:bg-gray-800 p-3 rounded-lg transition-colors flex items-center justify-between"
            >
              <span>Trim</span>
              <span className="text-gray-400 text-sm">›</span>
            </button>

            <button
              onClick={() => setCurrentSettingsView("camera")}
              className="w-full text-left text-white hover:bg-gray-800 p-3 rounded-lg transition-colors flex items-center justify-between"
            >
              <span>Camera Settings</span>
              <span className="text-gray-400 text-sm">›</span>
            </button>

            <button
              onClick={() => setCurrentSettingsView("driveLayout")}
              className="w-full text-left text-white hover:bg-gray-800 p-3 rounded-lg transition-colors flex items-center justify-between"
            >
              <span>Drive Layout</span>
              <span className="text-gray-400 text-sm">›</span>
            </button>

            <div className="mt-4 pt-3 border-t border-gray-700">
              <button
                onClick={resetSettings}
                className="w-full text-center text-red-400 hover:text-red-300 p-2 rounded-lg transition-colors flex items-center justify-center"
              >
                <RotateCcw size={16} className="mr-2" />
                Reset All Settings
              </button>
            </div>
          </div>
        )
    }
  }

  return (
    <div className="w-full h-screen bg-black overflow-hidden relative" ref={containerRef}>
      {/* Video Feed */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-full h-full bg-gray-900 flex items-center justify-center">
          <video
            className="w-full h-full object-cover"
            autoPlay
            muted
            playsInline
            poster="/placeholder.svg?height=720&width=1280&text=Robot+Camera+Feed"
          >
            <source src={`${ESP32_IP}:81/stream`} type="video/mp4" />
          </video>

          <div className="absolute inset-0 flex items-center justify-center text-white text-2xl font-bold bg-gray-800 bg-opacity-50">
            Robot Camera Feed
            <br />
            <span className="text-sm font-normal">Connect to ESP32 stream</span>
          </div>
        </div>
      </div>

      {/* Left Touch Zone - Forward/Backward */}
      <div
        className="absolute left-0 top-0 w-1/3 h-full z-10 touch-none"
        onTouchStart={(e) => handleTouchStart(e, "left")}
        onTouchMove={(e) => handleTouchMove(e, "left")}
        onTouchEnd={() => handleTouchEnd("left")}
        onMouseDown={(e) => handleMouseStart(e, "left")}
        onMouseMove={(e) => handleMouseMove(e, "left")}
        onMouseUp={() => handleMouseEnd("left")}
        onMouseLeave={() => handleMouseEnd("left")}
      >
        {leftTouch.isActive && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="w-2 h-48 bg-white bg-opacity-30 rounded-full relative"
              style={{
                left: leftTouch.startX - 4,
                top: leftTouch.startY - 96,
              }}
            >
              <div
                className="absolute w-8 h-8 bg-blue-500 rounded-full border-2 border-white shadow-lg transform -translate-x-1/2 -translate-y-1/2 transition-none"
                style={{
                  left: "50%",
                  top: `${50 - leftTouch.value * 50}%`,
                }}
              />
              <div className="absolute w-4 h-1 bg-white rounded-full left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2" />
            </div>

            <div className="absolute top-4 left-4 text-white bg-black bg-opacity-50 px-2 py-1 rounded text-sm font-mono">
              FWD: {(leftTouch.value * 100).toFixed(0)}%
            </div>
          </div>
        )}
      </div>

      {/* Right Touch Zone - Left/Right Turn */}
      <div
        className="absolute right-0 top-0 w-1/3 h-full z-10 touch-none"
        onTouchStart={(e) => handleTouchStart(e, "right")}
        onTouchMove={(e) => handleTouchMove(e, "right")}
        onTouchEnd={() => handleTouchEnd("right")}
        onMouseDown={(e) => handleMouseStart(e, "right")}
        onMouseMove={(e) => handleMouseMove(e, "right")}
        onMouseUp={() => handleMouseEnd("right")}
        onMouseLeave={() => handleMouseEnd("right")}
      >
        {rightTouch.isActive && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="h-2 w-48 bg-white bg-opacity-30 rounded-full relative"
              style={{
                left: rightTouch.startX - 96,
                top: rightTouch.startY - 4,
              }}
            >
              <div
                className="absolute w-8 h-8 bg-red-500 rounded-full border-2 border-white shadow-lg transform -translate-x-1/2 -translate-y-1/2 transition-none"
                style={{
                  left: `${50 + rightTouch.value * 50}%`,
                  top: "50%",
                }}
              />
              <div className="absolute w-1 h-4 bg-white rounded-full left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2" />
            </div>

            <div className="absolute top-4 right-4 text-white bg-black bg-opacity-50 px-2 py-1 rounded text-sm font-mono">
              TURN: {(rightTouch.value * 100).toFixed(0)}%
            </div>
          </div>
        )}
      </div>

      {/* Camera Control Zone - Pan/Tilt */}
      <div
        className="absolute left-1/3 top-0 w-1/3 h-full z-10 touch-none"
        onTouchStart={handleCameraTouchStart}
        onTouchMove={handleCameraTouchMove}
        onTouchEnd={handleCameraTouchEnd}
        onMouseDown={handleCameraMouseStart}
        onMouseMove={handleCameraMouseMove}
        onMouseUp={handleCameraMouseEnd}
        onMouseLeave={handleCameraMouseEnd}
      >
        {cameraControl.isActive && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="w-32 h-32 border-2 border-white border-opacity-40 rounded-full relative bg-white bg-opacity-10"
              style={{
                left: cameraControl.startX - 64,
                top: cameraControl.startY - 64,
              }}
            >
              <div
                className="absolute w-12 h-12 bg-green-500 rounded-full border-2 border-white shadow-lg transform -translate-x-1/2 -translate-y-1/2 transition-none"
                style={{
                  left: `${50 + cameraControl.panValue * 40}%`,
                  top: `${50 - cameraControl.tiltValue * 40}%`,
                }}
              />
              <div className="absolute w-4 h-0.5 bg-white rounded-full left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2" />
              <div className="absolute w-0.5 h-4 bg-white rounded-full left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2" />
            </div>

            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 text-white bg-black bg-opacity-50 px-2 py-1 rounded text-sm font-mono">
              PAN: {(cameraControl.panValue * 100).toFixed(0)}% | TILT: {(cameraControl.tiltValue * 100).toFixed(0)}%
            </div>
          </div>
        )}

        {!cameraControl.isActive && (cameraControl.panValue !== 0 || cameraControl.tiltValue !== 0) && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <div className="w-16 h-16 border border-green-400 border-opacity-50 rounded-full relative bg-green-400 bg-opacity-10">
              <div
                className="absolute w-3 h-3 bg-green-400 rounded-full transform -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${50 + cameraControl.panValue * 25}%`,
                  top: `${50 - cameraControl.tiltValue * 25}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 text-white bg-black bg-opacity-50 px-4 py-2 rounded-lg text-sm font-mono z-20">
        {isRecording && <span className="text-red-400 mr-2">● REC</span>}
        Robot Control | FWD: {(leftTouch.value * 100).toFixed(0)}% | TURN: {(rightTouch.value * 100).toFixed(0)}% | PAN:{" "}
        {(cameraControl.panValue * 100).toFixed(0)}% | TILT: {(cameraControl.tiltValue * 100).toFixed(0)}%
      </div>

      {/* Settings Gear Icon */}
      <button
        onClick={toggleSettings}
        className="absolute top-4 right-4 text-white bg-black bg-opacity-50 hover:bg-opacity-70 p-2 rounded-lg z-30 transition-all"
      >
        <Settings size={20} />
      </button>

      {/* Fullscreen Toggle Button */}
      <button
        onClick={toggleFullscreen}
        className="absolute top-4 left-4 text-white bg-black bg-opacity-50 hover:bg-opacity-70 p-2 rounded-lg z-30 transition-all"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 10L12 15L17 10" />
        </svg>
      </button>

      {/* Flashlight Toggle Button */}
      <button
        onClick={toggleFlashlight}
        className="absolute top-4 left-16 text-white bg-black bg-opacity-50 hover:bg-opacity-70 p-2 rounded-lg z-30 transition-all"
      >
        {isFlashlightOn ? (
          // Light bulb ON - solid with rays
          <div className="relative">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 21c0 .5.4 1 1 1h4c.6 0 1-.4 1-1v-1H9v1z" />
              <path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z" />
            </svg>
            {/* Light rays */}
            <div className="absolute inset-0">
              <div className="absolute top-0 left-1/2 w-0.5 h-2 bg-yellow-300 transform -translate-x-1/2 -translate-y-3 rotate-0"></div>
              <div className="absolute top-0 left-1/2 w-0.5 h-2 bg-yellow-300 transform -translate-x-1/2 -translate-y-3 rotate-45"></div>
              <div className="absolute top-0 left-1/2 w-0.5 h-2 bg-yellow-300 transform -translate-x-1/2 -translate-y-3 -rotate-45"></div>
              <div className="absolute top-0 left-1/2 w-0.5 h-2 bg-yellow-300 transform -translate-x-1/2 -translate-y-3 rotate-90"></div>
              <div className="absolute top-0 left-1/2 w-0.5 h-2 bg-yellow-300 transform -translate-x-1/2 -translate-y-3 -rotate-90"></div>
            </div>
          </div>
        ) : (
          // Light bulb OFF - outline only
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21c0 .5.4 1 1 1h4c.6 0 1-.4 1-1v-1H9v1z" />
            <path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z" />
          </svg>
        )}
      </button>

      {/* Still Camera Button */}
      <button
        onClick={takeStillPhoto}
        className="absolute top-4 left-28 text-white bg-black bg-opacity-50 hover:bg-opacity-70 p-2 rounded-lg z-30 transition-all"
        title="Take Photo"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      </button>

      {/* Video Recording Button */}
      <button
        onClick={toggleVideoRecording}
        className={`absolute top-4 left-40 text-white bg-black bg-opacity-50 hover:bg-opacity-70 p-2 rounded-lg z-30 transition-all ${
          isRecording ? "bg-red-600 bg-opacity-70" : ""
        }`}
        title={isRecording ? "Stop Recording" : "Start Recording"}
      >
        {isRecording ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
        )}
      </button>

      {/* Playback Button */}
      <button
        onClick={togglePlayback}
        className="absolute top-4 left-52 text-white bg-black bg-opacity-50 hover:bg-opacity-70 p-2 rounded-lg z-30 transition-all"
        title="View Media"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
          <polygon points="10 8 16 12 10 16 10 8" />
        </svg>
      </button>

      {/* Settings Menu */}
      {isSettingsOpen && (
        <>
          <div className="absolute inset-0 bg-black bg-opacity-50 z-40" onClick={() => setIsSettingsOpen(false)} />

          <div className="absolute top-16 right-4 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 min-w-80 max-h-96 overflow-y-auto">
            <div className="p-4">
              {currentSettingsView === "main" && (
                <h3 className="text-white text-lg font-semibold mb-4 border-b border-gray-700 pb-2">Robot Settings</h3>
              )}

              {renderSettingsContent()}

              {currentSettingsView === "main" && (
                <div className="mt-4 pt-3 border-t border-gray-700">
                  <button
                    onClick={() => setIsSettingsOpen(false)}
                    className="w-full text-center text-gray-400 hover:text-white p-2 rounded-lg transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Media Playback Modal */}
      {isPlaybackOpen && (
        <>
          <div className="absolute inset-0 bg-black bg-opacity-75 z-50" onClick={() => setSelectedMedia(null)} />

          <div className="absolute inset-4 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h3 className="text-white text-lg font-semibold">Media Gallery</h3>
              <button onClick={togglePlayback} className="text-gray-400 hover:text-white p-1 rounded">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Media List */}
              <div className="w-1/3 border-r border-gray-700 overflow-y-auto">
                <div className="p-4">
                  <div className="text-white text-sm mb-3">
                    {mediaFiles.length} files ({mediaFiles.filter((f) => f.type === "image").length} photos,{" "}
                    {mediaFiles.filter((f) => f.type === "video").length} videos)
                  </div>

                  <div className="space-y-2">
                    {mediaFiles.map((file) => (
                      <div
                        key={file.name}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedMedia === file.name
                            ? "bg-blue-600 border-blue-500"
                            : "bg-gray-800 border-gray-600 hover:bg-gray-700"
                        }`}
                        onClick={() => setSelectedMedia(file.name)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            {file.type === "image" ? (
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                className="text-blue-400"
                              >
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21,15 16,10 5,21" />
                              </svg>
                            ) : (
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                className="text-red-400"
                              >
                                <polygon points="23 7 16 12 23 17 23 7" />
                                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                              </svg>
                            )}
                            <div className="text-white text-sm font-medium truncate">{file.name}</div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteMediaFile(file.name)
                            }}
                            className="text-red-400 hover:text-red-300 p-1"
                            title="Delete"
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <polyline points="3,6 5,6 21,6" />
                              <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2" />
                            </svg>
                          </button>
                        </div>
                        <div className="text-gray-400 text-xs mt-1">
                          {file.timestamp} • {(file.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                    ))}

                    {mediaFiles.length === 0 && (
                      <div className="text-gray-400 text-center py-8">No media files found</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Media Viewer */}
              <div className="flex-1 flex items-center justify-center bg-black">
                {selectedMedia ? (
                  <div className="max-w-full max-h-full">
                    {mediaFiles.find((f) => f.name === selectedMedia)?.type === "image" ? (
                      <img
                        src={`${ESP32_IP}/media/${selectedMedia}`}
                        alt={selectedMedia}
                        className="max-w-full max-h-full object-contain"
                      />
                    ) : (
                      <video
                        src={`${ESP32_IP}/media/${selectedMedia}`}
                        controls
                        className="max-w-full max-h-full"
                        preload="metadata"
                      >
                        Your browser does not support the video tag.
                      </video>
                    )}
                  </div>
                ) : (
                  <div className="text-gray-400 text-center">
                    <svg
                      width="64"
                      height="64"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1"
                      className="mx-auto mb-4 opacity-50"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21,15 16,10 5,21" />
                    </svg>
                    <p>Select a file to view</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Instructions */}
      {/* Instructions with Toggle */}
{!leftTouch.isActive && !rightTouch.isActive && !cameraControl.isActive && (
  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 z-20 flex flex-col items-center">
    {showInstructions && (
      <div className="text-white text-center bg-black bg-opacity-70 px-6 py-3 rounded-t-lg">
        <div className="text-lg font-semibold mb-2">Robot Control</div>
        <div className="text-sm">
          <span className="text-blue-400">Left:</span> Forward/Back •
          <span className="text-green-400"> Center:</span> Camera Pan/Tilt •
          <span className="text-red-400"> Right:</span> Left/Right Turn
        </div>
        <div className="text-xs mt-1 opacity-75">
          Touch and drag to control • Double-tap center to recenter camera
        </div>
      </div>
    )}
    <button
      onClick={() => setShowInstructions((prev) => !prev)}
      className="bg-black bg-opacity-70 text-white rounded-full p-1"
      title={showInstructions ? "Hide Instructions" : "Show Instructions"}
    >
      {showInstructions ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
    </button>
  </div>
)}

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 2px solid #ffffff;
        }

        .slider::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 2px solid #ffffff;
        }
      `}</style>
    </div>
  )
}

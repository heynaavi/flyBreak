import AppKit
// Prints "notch <x> <width> <height>" in points for the main screen, or nothing if there is no notch.
if let s = NSScreen.main, let l = s.auxiliaryTopLeftArea, let r = s.auxiliaryTopRightArea {
  print("notch \(l.maxX) \(r.minX - l.maxX) \(l.height)")
}

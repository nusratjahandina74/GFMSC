import * as React from "react";
import { cn } from "../../lib/utils";

function Checkbox({ className, onCheckedChange, checked, ...props }, ref) {
  // Bridges the Radix-UI-style `onCheckedChange(boolean)` API that callers
  // throughout this app use (ClassTeachers.jsx, teacher/Attendance.jsx)
  // onto this plain native <input type="checkbox">. Previously
  // onCheckedChange was spread directly onto the native input as an
  // unrecognized prop — React silently drops it, so nothing ever fired on
  // click and the checkbox stayed permanently unchecked/uncontrolled no
  // matter how many times it was clicked.
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      className={cn(
        "peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  );
}
Checkbox.displayName = "Checkbox";

export { Checkbox };

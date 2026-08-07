import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    const fallbackAriaLabel =
      !props.id &&
      !props["aria-label"] &&
      !props["aria-labelledby"] &&
      typeof props.placeholder === "string" &&
      props.placeholder.trim()
        ? props.placeholder.trim()
        : undefined

    return (
      <input
        type={type}
        aria-label={fallbackAriaLabel}
        className={cn(
          "flex min-h-10 min-w-0 w-full touch-manipulation rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-destructive aria-invalid:ring-destructive/30 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[linear-gradient(135deg,rgba(59,130,246,0.92),rgba(99,102,241,0.9))] text-primary-foreground border border-white/25 shadow-[0_8px_24px_rgba(37,99,235,0.28)] hover:brightness-110",
        destructive:
          "bg-destructive/90 text-destructive-foreground border border-destructive-border hover:bg-destructive",
        outline:
          "border border-white/12 bg-[rgba(19,26,40,0.5)] backdrop-blur-md text-[#cbd5e1] hover:bg-[rgba(30,41,59,0.62)] hover:text-[#e5e7eb]",
        secondary: "border border-white/12 bg-[rgba(30,41,59,0.46)] backdrop-blur-md text-[#d1d5db] hover:bg-[rgba(51,65,85,0.64)] hover:text-[#f8fafc]",
        ghost: "border border-white/6 bg-[rgba(255,255,255,0.03)] text-[#98a2b3] hover:bg-[rgba(255,255,255,0.08)] hover:border-white/14 hover:text-[#e2e8f0]",
      },
      size: {
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-md px-3 text-xs",
        lg: "min-h-10 rounded-lg px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }

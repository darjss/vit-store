import type { Component, ComponentProps } from "solid-js"
import { splitProps } from "solid-js"
 
import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"
 
import { cn } from "@/lib/utils"
 
const badgeVariants = cva(
  "inline-flex items-center border-2 border-black px-3 py-1 text-xs font-black uppercase tracking-wide shadow-[2px_2px_0_0_#000] transition-all hover:shadow-[3px_3px_0_0_#000] hover:translate-x-[-1px] hover:translate-y-[-1px]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-[2px_2px_0_0_#fff] hover:shadow-[3px_3px_0_0_#fff]",
        outline: "bg-white text-foreground",
        success: "bg-success text-success-foreground",
        warning: "bg-warning text-warning-foreground",
        error: "bg-error text-error-foreground"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
)
 
type BadgeProps = ComponentProps<"div"> &
  VariantProps<typeof badgeVariants> & {
    round?: boolean
  }
 
const Badge: Component<BadgeProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "variant", "round"])
  return (
    <div
      class={cn(
        badgeVariants({ variant: local.variant }),
        local.class
      )}
      {...others}
    />
  )
}
 
export type { BadgeProps }
export { Badge, badgeVariants }
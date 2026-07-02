import type { Component, ComponentProps } from "solid-js"
import { splitProps } from "solid-js"

import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-[140ms] ease-out",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        outline: "bg-card text-foreground border border-border",
        success: "bg-success text-success-foreground",
        warning: "bg-warning text-warning-foreground",
        error: "bg-error text-error-foreground",
        sale: "bg-sale text-sale-foreground",
        info: "bg-info text-info-foreground",
        sticker:
          "bg-card text-foreground border-2 border-cocoa shadow-pop-sm font-bold"
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

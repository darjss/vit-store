import type { JSX, ValidComponent } from "solid-js"
import { splitProps } from "solid-js"

import * as ButtonPrimitive from "@kobalte/core/button"
import type { PolymorphicProps } from "@kobalte/core/polymorphic"
import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-normal break-words text-sm font-black uppercase tracking-wide transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border-3 border-border active:translate-x-[4px] active:translate-y-[4px]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-hard-lg hover:shadow-hard hover:translate-x-[3px] hover:translate-y-[3px] active:shadow-none",
        destructive: "bg-destructive text-destructive-foreground shadow-hard-lg hover:shadow-hard hover:translate-x-[3px] hover:translate-y-[3px] active:shadow-none",
        outline: "bg-background text-foreground border-3 border-border shadow-hard-lg hover:bg-secondary hover:text-secondary-foreground hover:shadow-hard hover:translate-x-[3px] hover:translate-y-[3px] active:shadow-none",
        secondary: "bg-secondary text-secondary-foreground shadow-hard-light-lg hover:shadow-hard-light hover:translate-x-[3px] hover:translate-y-[3px] active:shadow-none",
        ghost: "border-0 hover:bg-accent hover:text-accent-foreground shadow-none hover:shadow-none",
        link: "border-0 text-foreground underline-offset-4 hover:underline shadow-none"
      },
      size: {
        default: "h-12 md:h-14 px-6 md:px-8 py-3 text-sm md:text-base",
        sm: "h-10 px-4 text-xs",
        lg: "min-h-16 h-auto px-6 md:px-10 py-4 text-base md:text-lg",
        icon: "size-12",
        compact: "h-auto px-3 py-2 text-[11px] sm:px-4 sm:py-2 sm:text-xs"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
)

type ButtonProps<T extends ValidComponent = "button"> = ButtonPrimitive.ButtonRootProps<T> &
  VariantProps<typeof buttonVariants> & { class?: string | undefined; children?: JSX.Element }

const Button = <T extends ValidComponent = "button">(
  props: PolymorphicProps<T, ButtonProps<T>>
) => {
  const [local, others] = splitProps(props as ButtonProps, ["variant", "size", "class"])
  return (
    <ButtonPrimitive.Root
      class={cn(buttonVariants({ variant: local.variant, size: local.size }), local.class)}
      {...others}
    />
  )
}

export { Button, buttonVariants }
export type { ButtonProps }

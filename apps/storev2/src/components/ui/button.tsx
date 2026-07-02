import type { JSX, ValidComponent } from "solid-js"
import { splitProps } from "solid-js"

import * as ButtonPrimitive from "@kobalte/core/button"
import type { PolymorphicProps } from "@kobalte/core/polymorphic"
import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-[transform,box-shadow,background-color,border-color,color] duration-[140ms] ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.97]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-lift hover:-translate-y-[2px] hover:shadow-lift-lg active:translate-y-0 active:shadow-none",
        secondary:
          "bg-card text-foreground border border-border shadow-soft-sm hover:bg-muted hover:shadow-soft",
        outline:
          "bg-card text-foreground border border-border shadow-soft-sm hover:bg-muted hover:shadow-soft",
        dark: "bg-secondary text-secondary-foreground shadow-soft hover:-translate-y-[2px] hover:shadow-soft-lg active:translate-y-0 active:shadow-none",
        destructive:
          "bg-destructive text-destructive-foreground shadow-soft hover:-translate-y-[2px] hover:shadow-soft-lg active:translate-y-0 active:shadow-none",
        ghost: "hover:bg-muted hover:text-foreground",
        link: "text-foreground underline-offset-4 hover:underline"
      },
      size: {
        default: "h-12 px-6 text-sm md:text-base",
        sm: "h-10 px-4 text-xs",
        lg: "h-14 px-8 text-base",
        icon: "size-11 rounded-full",
        compact: "h-9 px-3.5 text-xs"
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

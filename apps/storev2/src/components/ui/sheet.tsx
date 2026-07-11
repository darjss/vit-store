import type { Component, ComponentProps, JSX, ValidComponent } from "solid-js"
import { splitProps } from "solid-js"
 
import * as SheetPrimitive from "@kobalte/core/dialog"
import type { PolymorphicProps } from "@kobalte/core/polymorphic"
import { cva, type VariantProps } from "class-variance-authority"
 
import { cn } from "@/lib/utils"
import IconClose from "~icons/ri/close-line"
 
const Sheet = SheetPrimitive.Root
const SheetTrigger = SheetPrimitive.Trigger

type SheetCloseProps = ComponentProps<typeof SheetPrimitive.CloseButton> & {
  closeLabel?: string
}

const SheetClose: Component<SheetCloseProps> = (props) => {
  const [local, others] = splitProps(props, ["closeLabel"])
  return (
    <SheetPrimitive.CloseButton
      {...others}
      aria-label={local.closeLabel?.trim() || "Хаах"}
    />
  )
}

export type SheetFocusRestore = {
  register: (element: HTMLElement) => void
  restore: () => boolean
}

export const createSheetFocusRestore = (): SheetFocusRestore => {
  let target: HTMLElement | undefined

  return {
    register: (element) => {
      target = element
    },
    restore: () => {
      if (!target?.isConnected) return false
      target.focus({ preventScroll: true })
      return true
    }
  }
}
 
const portalVariants = cva("fixed inset-0 z-50 flex", {
  variants: {
    position: {
      top: "items-start",
      bottom: "items-end",
      left: "justify-start",
      right: "justify-end"
    }
  },
  defaultVariants: { position: "right" }
})
 
type PortalProps = SheetPrimitive.DialogPortalProps & VariantProps<typeof portalVariants>
 
const SheetPortal: Component<PortalProps> = (props) => {
  const [local, others] = splitProps(props, ["position", "children"])
  return (
    <SheetPrimitive.Portal {...others}>
      <div class={portalVariants({ position: local.position })}>{local.children}</div>
    </SheetPrimitive.Portal>
  )
}
 
type DialogOverlayProps<T extends ValidComponent = "div"> = SheetPrimitive.DialogOverlayProps<T> & {
  class?: string | undefined
}
 
const SheetOverlay = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, DialogOverlayProps<T>>
) => {
  const [local, others] = splitProps(props as DialogOverlayProps, ["class"])
  return (
    <SheetPrimitive.Overlay
      class={cn(
        "fixed inset-0 z-50 bg-foreground/80 data-[expanded=]:animate-in data-[closed=]:animate-out data-[closed=]:fade-out-0 data-[expanded=]:fade-in-0",
        local.class
      )}
      {...others}
    />
  )
}
 
const sheetVariants = cva(
  "fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-out-quart data-[closed=]:duration-300 data-[expanded=]:duration-500 data-[expanded=]:animate-in data-[closed=]:animate-out",
  {
    variants: {
      position: {
        top: "inset-x-0 top-0 border-b data-[closed=]:slide-out-to-top data-[expanded=]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[closed=]:slide-out-to-bottom data-[expanded=]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[closed=]:slide-out-to-left data-[expanded=]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4 border-l data-[closed=]:slide-out-to-right data-[expanded=]:slide-in-from-right sm:max-w-sm"
      }
    },
    defaultVariants: {
      position: "right"
    }
  }
)
 
type DialogContentProps<T extends ValidComponent = "div"> = SheetPrimitive.DialogContentProps<T> &
  VariantProps<typeof sheetVariants> & {
    class?: string | undefined
    children?: JSX.Element
    closeLabel?: string
    focusRestore?: SheetFocusRestore
  }
 
const SheetContent = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, DialogContentProps<T>>
) => {
  const [local, others] = splitProps(props as DialogContentProps, [
    "position",
    "class",
    "children",
    "closeLabel",
    "focusRestore"
  ])
  return (
    <SheetPortal position={local.position}>
      <SheetOverlay />
      <SheetPrimitive.Content
        onOpenAutoFocus={() => {
          if (local.focusRestore && typeof document !== "undefined") {
            const activeElement = document.activeElement
            if (activeElement instanceof HTMLElement) {
              local.focusRestore.register(activeElement)
            }
          }
        }}
        onCloseAutoFocus={(event) => {
          if (local.focusRestore?.restore()) {
            event.preventDefault()
          }
        }}
        class={cn(
          sheetVariants({ position: local.position }),
          local.class,
          "max-h-screen overflow-y-auto"
        )}
        {...others}
      >
        {local.children}
        <SheetPrimitive.CloseButton
          aria-label={local.closeLabel?.trim() || "Хаах"}
          class="absolute top-4 right-4 flex size-11 items-center justify-center rounded-full opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary"
        >
          <IconClose class="size-4" aria-hidden="true" />
        </SheetPrimitive.CloseButton>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}
 
const SheetHeader: Component<ComponentProps<"div">> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return (
    <div
      class={cn(
        "flex min-h-[60px] flex-col space-y-2 pe-[60px] text-center sm:text-left",
        local.class
      )}
      {...others}
    />
  )
}
 
const SheetFooter: Component<ComponentProps<"div">> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return (
    <div
      class={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", local.class)}
      {...others}
    />
  )
}
 
type DialogTitleProps<T extends ValidComponent = "h2"> = SheetPrimitive.DialogTitleProps<T> & {
  class?: string | undefined
}
 
const SheetTitle = <T extends ValidComponent = "h2">(
  props: PolymorphicProps<T, DialogTitleProps<T>>
) => {
  const [local, others] = splitProps(props as DialogTitleProps, ["class"])
  return (
    <SheetPrimitive.Title
      class={cn("text-lg font-semibold text-foreground", local.class)}
      {...others}
    />
  )
}
 
type DialogDescriptionProps<T extends ValidComponent = "p"> =
  SheetPrimitive.DialogDescriptionProps<T> & { class?: string | undefined }
 
const SheetDescription = <T extends ValidComponent = "p">(
  props: PolymorphicProps<T, DialogDescriptionProps<T>>
) => {
  const [local, others] = splitProps(props as DialogDescriptionProps, ["class"])
  return (
    <SheetPrimitive.Description
      class={cn("text-sm text-muted-foreground", local.class)}
      {...others}
    />
  )
}
 
export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription
}
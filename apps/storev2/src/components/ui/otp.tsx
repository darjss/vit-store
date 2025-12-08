import type { Component, ComponentProps, ValidComponent } from "solid-js"
import { Show, splitProps } from "solid-js"
 
import type { DynamicProps, RootProps } from "@corvu/otp-field"
import OtpField from "@corvu/otp-field"
 
import { cn } from "@/lib/utils"
import IconCircle from "~icons/ri/circle-fill"
 
export const REGEXP_ONLY_DIGITS = "^\\d*$"
export const REGEXP_ONLY_CHARS = "^[a-zA-Z]*$"
export const REGEXP_ONLY_DIGITS_AND_CHARS = "^[a-zA-Z0-9]*$"
 
type OTPFieldProps<T extends ValidComponent = "div"> = RootProps<T> & { class?: string }
 
const OTPField = <T extends ValidComponent = "div">(props: DynamicProps<T, OTPFieldProps<T>>) => {
  const [local, others] = splitProps(props as OTPFieldProps, ["class"])
  return (
    <OtpField
      class={cn(
        "flex items-center gap-2 disabled:cursor-not-allowed has-[:disabled]:opacity-50",
        local.class
      )}
      {...others}
    />
  )
}
 
const OTPFieldInput = OtpField.Input
 
const OTPFieldGroup: Component<ComponentProps<"div">> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return <div class={cn("flex items-center gap-2", local.class)} {...others} />
}
 
const OTPFieldSlot: Component<ComponentProps<"div"> & { index: number }> = (props) => {
  const [local, others] = splitProps(props, ["class", "index"])
  const context = OtpField.useContext()
  const char = () => context.value()[local.index]
  const showFakeCaret = () => context.value().length === local.index && context.isInserting()
 
  return (
    <div
      class={cn(
        "group relative flex size-14 md:size-16 items-center justify-center border-4 border-black bg-white text-xl md:text-2xl font-black shadow-[6px_6px_0_0_#000] transition-all hover:shadow-[8px_8px_0_0_#000] hover:translate-x-[-2px] hover:translate-y-[-2px]",
        local.class
      )}
      {...others}
    >
      <div
        class={cn(
          "absolute inset-0 z-10 transition-all",
          context.activeSlots().includes(local.index) && "bg-primary/20 ring-4 ring-inset ring-primary"
        )}
      />
      <span class="relative z-20">{char()}</span>
      <Show when={showFakeCaret()}>
        <div class="pointer-events-none absolute inset-0 flex items-center justify-center z-20">
          <div class="h-7 md:h-8 w-1 animate-caret-blink bg-foreground" />
        </div>
      </Show>
    </div>
  )
}
 
const OTPFieldSeparator: Component<ComponentProps<"div">> = (props) => {
  return (
    <div {...props}>
      <IconCircle class="size-2" />
    </div>
  )
}
 
export { OTPField, OTPFieldInput, OTPFieldGroup, OTPFieldSlot, OTPFieldSeparator }
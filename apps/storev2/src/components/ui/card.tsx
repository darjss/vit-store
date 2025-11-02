import type { Component, ComponentProps } from "solid-js"
import { splitProps } from "solid-js"

import { cn } from "@/lib/utils"

const Card: Component<ComponentProps<"div">> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return (
    <div
      class={cn("border-3 border-black bg-card text-card-foreground shadow-[6px_6px_0_0_#000] hover:shadow-[8px_8px_0_0_#000] hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all", local.class)}
      {...others}
    />
  )
}

const CardHeader: Component<ComponentProps<"div">> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return <div class={cn("flex flex-col space-y-2 p-6 border-b-3 border-black", local.class)} {...others} />
}

const CardTitle: Component<ComponentProps<"h3">> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return (
    <h3 class={cn("text-xl font-black uppercase tracking-tight", local.class)} {...others} />
  )
}

const CardDescription: Component<ComponentProps<"p">> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return <p class={cn("text-sm text-muted-foreground", local.class)} {...others} />
}

const CardContent: Component<ComponentProps<"div">> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return <div class={cn("p-6 pt-0", local.class)} {...others} />
}

const CardFooter: Component<ComponentProps<"div">> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return <div class={cn("flex items-center p-6 pt-0", local.class)} {...others} />
}

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }

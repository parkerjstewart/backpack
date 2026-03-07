"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { clsx } from "clsx"

const EXPLICIT_TEXT_SIZE_CLASS =
  /\btext-(?:xs|sm|base|lg|xl|[2-9]xl|\[[^\]]+\]|hero|section|title|card-title|title-sm|body|body-sm)\b/

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  const classNameString = typeof className === "string" ? className : ""
  const hasExplicitTextSize = EXPLICIT_TEXT_SIZE_CLASS.test(classNameString)

  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={clsx(
        "flex items-center gap-2 leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        !hasExplicitTextSize && "text-sm",
        className,
      )}
      {...props}
    />
  )
}

export { Label }

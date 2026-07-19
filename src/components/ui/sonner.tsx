"use client"

import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success:
            "group-[.toaster]:border-success-foreground/20 group-[.toaster]:bg-success group-[.toaster]:text-success-foreground",
          warning:
            "group-[.toaster]:border-warning-foreground/20 group-[.toaster]:bg-warning group-[.toaster]:text-warning-foreground",
          info: "group-[.toaster]:border-info-foreground/20 group-[.toaster]:bg-info group-[.toaster]:text-info-foreground",
          error:
            "group-[.toaster]:border-error/30 group-[.toaster]:bg-background group-[.toaster]:text-error",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }

import * as React from "react";
import { cn } from "../../lib/utils";

function Card({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border bg-card text-card-foreground shadow",
        className
      )}
      {...props}
    />
  );
}

Card.displayName = "Card";

function CardHeader({ className, ...props }, ref) {
  return <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />;
}

CardHeader.displayName = "CardHeader";

function CardTitle({ className, ...props }, ref) {
  return (
    <h3
      ref={ref}
      className={cn("text-2xl font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
}

CardTitle.displayName = "CardTitle";

function CardDescription({ className, ...props }, ref) {
  return (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}

CardDescription.displayName = "CardDescription";

function CardContent({ className, ...props }, ref) {
  return <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />;
}

CardContent.displayName = "CardContent";

function CardFooter({ className, ...props }, ref) {
  return (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  );
}

CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };

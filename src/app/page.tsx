import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Rocket, Sparkles, Zap } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-3xl w-full space-y-8">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border bg-muted px-4 py-1.5 text-sm">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Ready to build</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Next.js Template
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            A clean starter built with Next.js 15, Tailwind CSS, and shadcn/ui.
            Edit{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono">
              src/app/page.tsx
            </code>{" "}
            to get started.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <Zap className="h-6 w-6 mb-2" />
              <CardTitle>Next.js 15</CardTitle>
              <CardDescription>
                App Router with React 19 and TypeScript ready out of the box.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <Sparkles className="h-6 w-6 mb-2" />
              <CardTitle>Tailwind CSS</CardTitle>
              <CardDescription>
                Utility-first styling with theme variables and dark mode
                support.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <Rocket className="h-6 w-6 mb-2" />
              <CardTitle>shadcn/ui</CardTitle>
              <CardDescription>
                Beautifully designed components you copy and own.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Add a new component</CardTitle>
            <CardDescription>
              Use the shadcn CLI to add new UI components to your project.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted rounded-md px-4 py-3 text-sm font-mono overflow-x-auto">
              npx shadcn@latest add dialog
            </pre>
          </CardContent>
          <CardFooter className="gap-3">
            <Button asChild>
              <a
                href="https://ui.shadcn.com/docs/components"
                target="_blank"
                rel="noopener noreferrer"
              >
                Browse Components
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a
                href="https://nextjs.org/docs"
                target="_blank"
                rel="noopener noreferrer"
              >
                Next.js Docs
              </a>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "sonner";
import { Navbar } from "@/components/shadow/Navbar";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <div className="text-[10px] uppercase tracking-command text-smoke">404</div>
        <h1 className="mt-4 text-4xl font-bold uppercase tracking-command text-white">
          Lost in shadow
        </h1>
        <a
          href="/"
          className="mt-8 inline-block border border-white px-8 py-4 text-xs uppercase tracking-command text-white hover:bg-white hover:text-black transition-colors duration-500"
        >
          Return
        </a>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-xl uppercase tracking-command text-white">The shadow broke</h1>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 border border-white px-6 py-3 text-xs uppercase tracking-command text-white hover:bg-white hover:text-black transition-colors duration-500"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SHADOWCOACH — Discipline reveals weakness" },
      {
        name: "description",
        content:
          "A silent AI coach watching from the shadows. Upload your stance and receive the truth about your technique.",
      },
      { property: "og:title", content: "SHADOWCOACH" },
      { property: "og:description", content: "Discipline reveals weakness." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
      { rel: "apple-touch-icon", href: "/favicon.svg" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Navbar />
      <main className="page pt-24">
        <Outlet />
      </main>
      <Toaster theme="dark" position="bottom-center" richColors />
    </QueryClientProvider>
  );
}

import Link from "next/link";
import { ThemeToggle } from "@/app/_components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen">
      <nav className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link href="/" className="flex items-center gap-2 font-mono text-sm">
          <span className="inline-block h-2 w-2 rounded-full bg-accent" />
          Kalope <span className="text-accentInk">Homes</span>
        </Link>
        <ThemeToggle />
      </nav>
      <div className="mx-auto flex max-w-md flex-col px-6 py-16">{children}</div>
    </main>
  );
}

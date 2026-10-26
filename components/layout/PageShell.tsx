"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectButton from "@/components/ui/ConnectButton";
import NetworkBadge from "@/components/botchain/NetworkBadge";
import BuiltOnBotChain from "@/components/botchain/BuiltOnBotChain";
import { app } from "@/lib/app-config";
import { footerLinks } from "@/lib/botchain/chain";

export interface NavItem {
  href: string;
  label: string;
}

export interface PageShellProps {
  children: React.ReactNode;
  nav?: NavItem[];
  title?: string;
  description?: string;
}

const DEFAULT_LEDGER_NAV: NavItem[] = [
  { href: "/", label: "Retainers" },
  { href: "/new", label: "Open Retainer" },
];

export default function PageShell({
  children,
  nav = DEFAULT_LEDGER_NAV,
  title,
  description,
}: PageShellProps) {
  const currentPath = usePathname();
  const { site, explorer } = footerLinks();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#2B2B2B] text-[#EDE6DC]">
      {/* Top Ledger Header */}
      <header className="sticky top-0 z-30 border-b border-[#4A4640] bg-[#353535]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="group flex items-center gap-2.5 text-decoration-none"
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-xs bg-[#D4895C] text-[#1E1308] font-bold text-xs">
                R
              </div>
              <div className="flex flex-col">
                <span className="font-sans text-sm font-semibold tracking-tight text-[#EDE6DC] group-hover:text-[#D4895C] transition-colors">
                  {app.name}
                </span>
                <span className="text-[10px] text-[#B3A99A] hidden sm:inline">
                  Client & Provider Ledger
                </span>
              </div>
            </Link>

            {/* Navigation tabs */}
            <nav className="flex items-center gap-1 sm:gap-2">
              {nav.map((item) => {
                const isActive =
                  item.href === "/"
                    ? currentPath === "/"
                    : currentPath.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-2.5 py-1 text-xs font-medium rounded-xs transition-colors ${
                      isActive
                        ? "bg-[#2B2B2B] text-[#D4895C] border border-[#4A4640]"
                        : "text-[#B3A99A] hover:text-[#EDE6DC] hover:bg-[#2B2B2B]/50"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <NetworkBadge />
            <div className="w-[140px] sm:w-[170px] flex-shrink-0">
              <ConnectButton />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {(title || description) && (
          <div className="mb-6 border-b border-[#4A4640] pb-4">
            {title && (
              <h1 className="font-sans text-xl sm:text-2xl font-bold tracking-tight text-[#EDE6DC]">
                {title}
              </h1>
            )}
            {description && (
              <p className="mt-1 text-xs sm:text-sm text-[#B3A99A] max-w-2xl">
                {description}
              </p>
            )}
          </div>
        )}

        {children}
      </main>

      {/* Statement Footnote & Ecosystem Footer */}
      <footer className="border-t border-[#4A4640] bg-[#242424] py-6 px-4 sm:px-6 text-xs text-[#B3A99A]">
        <div className="mx-auto max-w-5xl flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-md">
            <p className="font-mono text-[11px] text-[#B3A99A] leading-relaxed">
              Ledger limit: While open, the provider can draw any amount up to the balance at any time.
              The client's protection is the notice period, not a veto.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 font-mono text-[11px] text-[#B3A99A]">
            <BuiltOnBotChain className="hover:text-[#D4895C] transition-colors" />
            <span className="text-[#4A4640]">•</span>
            <a
              href={site}
              target="_blank"
              rel="noreferrer"
              className="hover:text-[#D4895C] transition-colors"
            >
              botchain.ai
            </a>
            <span className="text-[#4A4640]">•</span>
            <a
              href={explorer}
              target="_blank"
              rel="noreferrer"
              className="hover:text-[#D4895C] transition-colors"
            >
              Explorer
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

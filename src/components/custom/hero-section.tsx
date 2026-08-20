// @polsia:user-owned

'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function HeroSection() {
  return (
    <section className="relative overflow-hidden py-section-lg px-gutter">
      {/* Background texture — subtle warm radial gradient */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 70% 40%, oklch(0.92 0.06 15 / 0.15) 0%, transparent 70%)',
        }}
      />

      <div className="container-page">
        <div className="grid items-center gap-16 lg:grid-cols-2 lg:gap-12">
          {/* Left — copy */}
          <div className="flex flex-col gap-6">
            <Badge
              variant="outline"
              className="w-fit border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
            >
              Now open for sign-ups
            </Badge>

            <h1 className="font-display text-5xl font-bold tracking-tight text-foreground lg:text-6xl">
              Meaningful connections for hearts over&nbsp;50
            </h1>

            <p className="text-body-lg text-muted-foreground">
              Heart Lines is the dating platform built for adults who know what they want — genuine
              relationships, not casual encounters. Thoughtful matching, curated profiles, and
              advanced privacy controls help you reconnect with the joy of romance.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Button asChild size="lg" className="gap-2 text-base">
                <a href="/#join">
                  Join Heart Lines
                  <svg
                    aria-hidden="true"
                    className="size-4 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M17 8l4 4m0 0l-4 4m4-4H3"
                    />
                  </svg>
                </a>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-base">
                <a href="/#how-it-works">See how it works</a>
              </Button>
            </div>
          </div>

          {/* Right — decorative SVG illustration */}
          <div className="flex justify-center lg:justify-end" aria-hidden="true">
            <svg
              viewBox="0 0 420 420"
              role="img"
              aria-label="Heart inside concentric rings — visual mark for Heart Lines"
              className="size-full max-w-[420px] select-none drop-shadow-xl"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <title>Heart Lines brand mark</title>
              {/* Outer organic ring */}
              <path
                d="M210 30 C320 30 390 100 390 210 C390 320 320 390 210 390 C100 390 30 320 30 210 C30 100 100 30 210 30Z"
                fill="oklch(0.92 0.06 15 / 0.12)"
                stroke="oklch(0.87 0.08 15 / 0.3)"
                strokeWidth="1.5"
              />
              {/* Middle ring — dashed */}
              <path
                d="M210 70 C295 70 350 125 350 210 C350 295 295 350 210 350 C125 350 70 295 70 210 C70 125 125 70 210 70Z"
                stroke="oklch(0.75 0.12 15 / 0.25)"
                strokeWidth="1.5"
                strokeDasharray="8 6"
              />
              {/* Inner solid ring */}
              <path
                d="M210 115 C270 115 310 155 310 210 C310 265 270 305 210 305 C150 305 110 265 110 210 C110 155 150 115 210 115Z"
                fill="oklch(0.95 0.05 15 / 0.2)"
                stroke="oklch(0.80 0.10 15 / 0.4)"
                strokeWidth="1.5"
              />
              {/* Heart icon */}
              <path
                d="M210 165 C210 165 160 200 160 235 C160 260 178 275 200 275 C208 275 215 270 220 264 C225 270 232 275 240 275 C262 275 280 260 280 235 C280 200 210 165 210 165Z"
                fill="oklch(0.65 0.15 15 / 0.85)"
                stroke="oklch(0.60 0.16 15)"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              {/* Small accent dots */}
              <circle cx="130" cy="155" r="6" fill="oklch(0.70 0.13 15 / 0.5)" />
              <circle cx="295" cy="265" r="4" fill="oklch(0.70 0.13 15 / 0.4)" />
              <circle cx="145" cy="270" r="3" fill="oklch(0.70 0.13 15 / 0.35)" />
              <circle cx="285" cy="148" r="5" fill="oklch(0.70 0.13 15 / 0.45)" />
              {/* Connecting dots to suggest "matching" */}
              <circle cx="210" cy="30" r="4" fill="oklch(0.70 0.13 15 / 0.5)" />
              <circle cx="390" cy="210" r="4" fill="oklch(0.70 0.13 15 / 0.5)" />
              <circle cx="210" cy="390" r="4" fill="oklch(0.70 0.13 15 / 0.5)" />
              <circle cx="30" cy="210" r="4" fill="oklch(0.70 0.13 15 / 0.5)" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}

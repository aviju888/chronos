"use client";

import { cn } from "@/modern/lib/cn";

/* ─────────────────────────────────────────────────────────
 * ROLLING NUMBER — odometer digits in fixed tabular slots.
 * craft: Tabular Numbers (nothing beside it shifts while it
 * counts) + Interruptibility (each digit is a CSS transition,
 * so a new value mid-roll just retargets).
 *
 * Every character, digit or not, sits in the same 1em box so
 * separators, prefixes and suffixes share the digits' baseline.
 * ───────────────────────────────────────────────────────── */

const DIGITS = Array.from({ length: 10 }, (_, i) => i);

const BOX = "relative inline-block h-[1em] leading-none";

function Digit({ d, duration }: { d: number; duration: number }) {
  return (
    <span className={BOX}>
      {/* an invisible in-flow 0 gives the slot its width and a real text
          baseline, so it lines up with separators and surrounding text */}
      <span className="invisible">0</span>
      <span className="absolute inset-0 overflow-hidden">
        <span
          className="absolute inset-x-0 top-0 flex flex-col"
          style={{
            transform: `translateY(${-d}em)`,
            transition: `transform ${duration}ms cubic-bezier(0.23,1,0.32,1)`,
          }}
        >
          {DIGITS.map((n) => (
            <span key={n} className="block h-[1em] text-center leading-none">
              {n}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}

function Static({ children }: { children: string }) {
  return <span className={cn(BOX, "whitespace-pre")}>{children}</span>;
}

export function RollingNumber({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  minDigits = 1,
  group = false,
  duration = 700,
  className,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** pad with leading zeros to at least this many integer digits */
  minDigits?: number;
  /** thousands separators: 12,480 */
  group?: boolean;
  duration?: number;
  className?: string;
}) {
  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(decimals);
  const [int, frac] = fixed.split(".");
  const padded = int.padStart(minDigits, "0");
  const grouped = group ? padded.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : padded;
  const chars = (frac ? `${grouped}.${frac}` : grouped).split("");
  const label = `${prefix}${negative ? "-" : ""}${group ? Number(int).toLocaleString("en-US") : int}${frac ? `.${frac}` : ""}${suffix}`;

  // key digits by place value (counted from the right, ignoring separators)
  // so a digit keeps its slot as the number grows
  const digitCount = chars.filter((c) => /\d/.test(c)).length;
  const places = chars.map((c, i) => (/\d/.test(c) ? digitCount - chars.slice(0, i + 1).filter((x) => /\d/.test(x)).length : -1));

  return (
    <span className={cn("num inline-flex items-baseline", className)} aria-label={label}>
      <span aria-hidden className="inline-flex items-baseline">
        {prefix && <Static>{prefix}</Static>}
        {negative && <Static>−</Static>}
        {chars.map((c, i) =>
          places[i] < 0 ? <Static key={`s-${i}`}>{c}</Static> : <Digit key={`d-${places[i]}`} d={Number(c)} duration={duration} />,
        )}
        {suffix && <Static>{suffix}</Static>}
      </span>
    </span>
  );
}

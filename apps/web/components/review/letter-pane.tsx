"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MarkdownView } from "./markdown-view";

interface LetterSection {
  heading: string;
  markdown: string;
}

/**
 * Reading layout for a generated letter / schedule / settlement statement.
 * Renders as two columns on lg+: a sticky table-of-contents on the left,
 * the prose on the right with serif typography. Falls back to single-column
 * on smaller screens.
 *
 * Pass either `sections` (preferred — TOC works) or a raw `streamMarkdown`
 * for in-progress streaming where sections aren't yet structured.
 */
export function LetterPane({
  sections,
  streamMarkdown,
  streaming = false,
  streamingHint = "streaming…",
  emptyHint = "Composition pending.",
}: {
  sections?: LetterSection[];
  streamMarkdown?: string;
  streaming?: boolean;
  streamingHint?: string;
  emptyHint?: string;
}) {
  const [activeId, setActiveId] = useState<string>("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const fullMarkdown = useMemo(() => {
    if (sections && sections.length > 0) {
      return sections.map((s) => `## ${s.heading}\n\n${s.markdown}`).join("\n\n");
    }
    return streamMarkdown ?? "";
  }, [sections, streamMarkdown]);

  const tocItems = useMemo(() => {
    if (!sections) return [];
    return sections.map((s) => ({
      id: slugify(s.heading),
      heading: s.heading,
    }));
  }, [sections]);

  // After render, attach IDs to each h2 so TOC anchors work, and observe them
  // to highlight the currently-visible section.
  useEffect(() => {
    if (!containerRef.current || tocItems.length === 0) return;
    const container = containerRef.current;
    const headings = Array.from(
      container.querySelectorAll("h2"),
    ) as HTMLHeadingElement[];
    headings.forEach((h, i) => {
      const item = tocItems[i];
      if (item) h.id = item.id;
    });

    const observer = new IntersectionObserver(
      (entries) => {
        const inView = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (inView.length > 0) {
          setActiveId(inView[0].target.id);
        }
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [tocItems, fullMarkdown]);

  if (!fullMarkdown) {
    return <div className="text-sm italic text-zinc-400">{emptyHint}</div>;
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[210px_1fr]">
      {tocItems.length > 0 && (
        <aside className="hidden lg:block">
          <div className="sticky top-6">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
              On this page
            </div>
            <nav className="space-y-1">
              {tocItems.map((t) => (
                <a
                  key={t.id}
                  href={`#${t.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(t.id)?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                    setActiveId(t.id);
                  }}
                  className={`block border-l-2 pl-3 py-1 text-[13px] leading-snug transition-colors ${
                    activeId === t.id
                      ? "border-zinc-900 text-zinc-900 font-medium"
                      : "border-zinc-100 text-zinc-500 hover:border-zinc-300 hover:text-zinc-800"
                  }`}
                >
                  {t.heading}
                </a>
              ))}
            </nav>
          </div>
        </aside>
      )}
      <article ref={containerRef} className="min-w-0 max-w-3xl">
        <MarkdownView text={fullMarkdown} />
        {streaming && (
          <div className="mt-4 flex items-center gap-1.5 text-xs italic text-zinc-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-900" />
            {streamingHint}
          </div>
        )}
      </article>
    </div>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 64);
}

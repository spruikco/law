"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Markdown renderer for letters of advice / amendment schedules / similar
 * professional documents. Uses GFM (tables, task lists, strikethrough).
 *
 * Styling philosophy: serif body for readability of long-form prose, generous
 * leading, restrained colours. Tables get borders + zebra rows. Task lists
 * render as styled checkboxes. Headings are typeset to look like a typed legal
 * letter rather than a web article.
 */
export function MarkdownView({ text }: { text: string }) {
  return (
    <div className="markdown-letter font-serif text-[15px] leading-[1.7] text-zinc-800">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-8 mb-3 font-sans text-2xl font-semibold tracking-tight text-zinc-900">
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2
              {...props}
              className="mt-8 mb-3 font-sans text-base font-semibold uppercase tracking-[0.08em] text-zinc-900 border-b border-zinc-200 pb-1.5"
            >
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3
              {...props}
              className="mt-5 mb-2 font-sans text-[15px] font-semibold text-zinc-900"
            >
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="my-3">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold text-zinc-900">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="my-3 list-disc pl-6 space-y-1.5 marker:text-zinc-400">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-3 list-decimal pl-6 space-y-1.5 marker:text-zinc-500 marker:font-medium">
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => {
            // GFM task list items have `className="task-list-item"` from remark-gfm
            const className = (props as { className?: string }).className;
            if (className === "task-list-item") {
              return <li className="list-none -ml-6">{children}</li>;
            }
            return <li>{children}</li>;
          },
          input: ({ checked, type }) => {
            if (type !== "checkbox") return null;
            return (
              <span
                aria-hidden="true"
                className={`mr-2 inline-flex h-4 w-4 -translate-y-px items-center justify-center rounded-sm border align-middle ${
                  checked
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 bg-white"
                }`}
              >
                {checked ? (
                  <svg
                    viewBox="0 0 16 16"
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 8l3.5 3.5L13 5" />
                  </svg>
                ) : null}
              </span>
            );
          },
          table: ({ children }) => (
            <div className="my-5 overflow-x-auto rounded-md border border-zinc-200">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-zinc-50 text-left font-sans">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-zinc-100">{children}</tbody>
          ),
          tr: ({ children }) => <tr>{children}</tr>,
          th: ({ children }) => (
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-600 align-top">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2.5 align-top text-zinc-800">{children}</td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-4 border-l-2 border-zinc-300 pl-4 text-zinc-600 italic">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.875em] text-zinc-800">
              {children}
            </code>
          ),
          hr: () => <hr className="my-6 border-zinc-200" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

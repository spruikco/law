"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback, type DragEvent } from "react";
import { fetchSamplePdfs } from "../use-sample-pdfs";

type Role = "testator" | "executor" | "beneficiary" | "interested_party";

export function WillsUploadForm() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [clientName, setClientName] = useState("");
  const [clientRole, setClientRole] = useState<Role>("testator");
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = useCallback((list: FileList | File[]) => {
    const arr = Array.from(list).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    setFiles((prev) => {
      const byName = new Map(prev.map((f) => [f.name, f] as const));
      for (const f of arr) byName.set(f.name, f);
      return [...byName.values()];
    });
  }, []);

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  const useSamples = async () => {
    setError(null);
    try {
      const samples = await fetchSamplePdfs(["will.pdf"]);
      setFiles(samples);
      setClientName("Margaret Wilson");
      setClientRole("testator");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const submit = async () => {
    if (files.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("clientName", clientName.trim() || "Client");
      form.set("clientRole", clientRole);
      for (const f of files) form.append("files", f);
      const res = await fetch("/api/wills-review", {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      const { id } = (await res.json()) as { id: string };
      router.push(`/wills-review/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-zinc-700 mb-2">
              Client name
            </label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. Eleanor Patterson"
              className="w-full rounded-md border border-zinc-300 px-4 py-2.5 text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              disabled={submitting}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-2">
              Client role
            </label>
            <select
              value={clientRole}
              onChange={(e) => setClientRole(e.target.value as Role)}
              className="w-full rounded-md border border-zinc-300 px-4 py-2.5 text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              disabled={submitting}
            >
              <option value="testator">Testator</option>
              <option value="executor">Executor</option>
              <option value="beneficiary">Beneficiary</option>
              <option value="interested_party">Interested party</option>
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-zinc-700">
              Will / codicil PDF(s)
            </label>
            <button
              type="button"
              onClick={useSamples}
              disabled={submitting}
              className="text-xs text-zinc-600 underline hover:text-zinc-900 disabled:opacity-50"
            >
              Use sample documents
            </button>
          </div>
          <label
            htmlFor="wills-file-input"
            className={`block cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              dragging
                ? "border-zinc-900 bg-zinc-50"
                : "border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <div className="text-sm text-zinc-600">
              Drag PDFs here or{" "}
              <span className="text-zinc-900 font-medium">click to browse</span>
            </div>
            <input
              id="wills-file-input"
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="sr-only"
              onChange={(e) => e.target.files && addFiles(e.target.files)}
              disabled={submitting}
            />
          </label>

          {files.length > 0 && (
            <ul className="mt-4 divide-y divide-zinc-100 rounded-md border border-zinc-200">
              {files.map((f) => (
                <li
                  key={f.name}
                  className="flex items-center justify-between px-4 py-2.5 text-sm"
                >
                  <span className="text-zinc-900 truncate">{f.name}</span>
                  <span className="flex items-center gap-3 text-xs text-zinc-500">
                    {(f.size / 1024).toFixed(0)} KB
                    <button
                      type="button"
                      className="text-zinc-400 hover:text-red-600"
                      onClick={() =>
                        setFiles((p) => p.filter((x) => x.name !== f.name))
                      }
                    >
                      remove
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-900">
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={submitting || files.length === 0}
          className="w-full rounded-md bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Starting review…" : "Start will review"}
        </button>
      </div>
    </div>
  );
}

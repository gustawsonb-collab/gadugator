import Link from "next/link";

const helpers = [
  { name: "Coach", desc: "Motywuje i daje plan minimum (3–5 min).", badge: "Start" },
  { name: "Tutor", desc: "Krótka lekcja + szybkie ćwiczenia.", badge: "Lekcja" },
  { name: "ChitChat", desc: "Rozmowy na luzie: small talk, codzienność.", badge: "Mówienie" },
  { name: "Work Pro", desc: "Język do pracy: formalny, maile, spotkania.", badge: "Pro" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              GaduGator 🐊
            </h1>
            <p className="mt-2 text-zinc-300">
              Twój przyjazny pomocnik do nauki angielskiego. Krótko, lekko, bez spiny.
            </p>
          </div>

          <Link
            href="/chat"
            className="rounded-2xl bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-950 hover:opacity-90"
          >
            Otwórz czat →
          </Link>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {helpers.map((h) => (
            <div
              key={h.name}
              className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{h.name}</h2>
                <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs text-zinc-200">
                  {h.badge}
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-300">{h.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-3xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h3 className="text-base font-semibold">Dziś (tryb oporny)</h3>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-300">
            <li>1 krótka rozmowa (30–60 s)</li>
            <li>1 zdanie do powtórzenia (TTS)</li>
            <li>Gotowe ✅</li>
          </ul>
          <div className="mt-4">
            <Link
              href="/chat"
              className="inline-flex rounded-2xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:opacity-90"
            >
              Start 60 sekund →
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

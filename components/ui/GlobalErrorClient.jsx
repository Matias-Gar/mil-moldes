"use client";

export default function GlobalErrorClient({ reset }) {
  return (
    <div className="mt-4">
      <button
        className="bg-blue-600 text-white px-3 py-1 rounded"
        onClick={() => reset && reset()}
      >
        Reintentar
      </button>
    </div>
  );
}

/** Esqueleto genérico enquanto uma página carrega: título e uma grade de cards. */
export default function Loading() {
  return (
    <div className="fade flex flex-col gap-10" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-4">
        <span className="skeleton h-7 w-40 rounded-full" />
        <span className="skeleton h-12 w-2/3 max-w-md" />
        <span className="skeleton h-5 w-full max-w-lg" />
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="surface flex flex-col gap-4 p-5">
            <div className="flex items-center gap-3">
              <span className="skeleton size-10 rounded-full" />
              <span className="skeleton h-4 w-28" />
            </div>
            <span className="skeleton h-10 w-3/4" />
            <span className="skeleton h-24 w-full rounded-2xl" />
            <span className="skeleton h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

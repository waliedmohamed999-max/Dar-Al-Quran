export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-10" role="status" aria-label="Loading">
      <div className="skeleton h-10 w-1/3" />
      <div className="skeleton h-40" />
      <div className="skeleton h-40" />
    </div>
  );
}

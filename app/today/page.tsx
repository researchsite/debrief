import Link from 'next/link';

export default function TodayPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 text-center">
      <h1 className="text-2xl font-semibold text-foreground mb-2">Today</h1>
      <p className="text-muted-foreground text-sm">Coming soon</p>

      {/* Floating add button */}
      <Link
        href="/add-person"
        aria-label="Add person"
        className="fixed bottom-20 right-4 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-primary text-primary-foreground text-2xl shadow-lg hover:bg-primary/80 transition-colors"
      >
        +
      </Link>
    </div>
  );
}

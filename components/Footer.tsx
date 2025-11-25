export function Footer() {
  return (
    <footer className="border-t border-slate-800 bg-slate-900/80 py-6 mt-auto">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center">
          <p className="text-sm text-slate-400">
            Fatto con <span className="text-red-500">❤️</span> da{' '}
            <a
              href="https://www.linkedin.com/in/michael-zane-44aa503b/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-400 hover:text-amber-300 font-semibold transition-colors underline"
            >
              ReGilgamesh
            </a>
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Pizza Tracker © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </footer>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-ink-800 px-4 py-8 text-center">
      <p className="text-xs text-white/40">
        © {new Date().getFullYear()} HottiesOnly. 18+ only. All creators marked with an AI badge
        are AI-generated characters operated by verified humans.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-white/30">
        <a className="hover:text-white/60" href="#">Terms</a>
        <a className="hover:text-white/60" href="#">Privacy</a>
        <a className="hover:text-white/60" href="#">2257 / Compliance</a>
        <a className="hover:text-white/60" href="#">Become a creator</a>
      </div>
    </footer>
  );
}

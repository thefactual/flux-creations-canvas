export function Footer() {
  return (
    <footer className="border-t border-zinc-200 px-4 py-8 text-center">
      <p className="text-xs text-zinc-500">
        © {new Date().getFullYear()} HottiesOnly. 18+ only.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-zinc-400">
        <a className="hover:text-zinc-700" href="#">Terms</a>
        <a className="hover:text-zinc-700" href="#">Privacy</a>
        <a className="hover:text-zinc-700" href="#">Compliance</a>
        <a className="hover:text-zinc-700" href="#">Become a creator</a>
      </div>
    </footer>
  );
}

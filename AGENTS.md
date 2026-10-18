<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Architecture rules

- Job scanning logic lives in `src/lib/scan.server.ts` (web reader extraction + AI scoring), shared by user-triggered server functions and the hourly cron route `/api/public/hooks/scheduled-scan` — one code path for manual and scheduled scans.
- The cron route only scans users whose chosen IST hour is due and companies not yet checked in that slot, so replays can't cause extra spend.
- The Android app (Capacitor) wraps the published URL so web updates ship without rebuilding the APK.

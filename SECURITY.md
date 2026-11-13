# Security

## Reporting a problem

If you find a security problem, please do not open a public issue. Use
**Security → Report a vulnerability** on this repository so it can be fixed
before the details are public.

## How this project is protected

- **No secrets in the repository.** API keys are read from the environment or
  a local secrets file that `.gitignore` excludes. Every push and pull request
  is scanned for leaked keys, including the full commit history.
- **Dependencies are watched.** Dependabot opens pull requests for outdated
  packages and GitHub Actions.
- **Code scanning.** CodeQL checks the code for common security bugs.
- **Locked-down CI.** Workflows run with read-only permissions and every
  third-party action is pinned to an exact commit, so a hijacked tag cannot
  change what runs.
- **Content Security Policy.** The page only loads scripts and styles from its
  own origin and cannot send data anywhere else, which limits the damage of
  any cross-site scripting bug.
- **Output escaping.** All user text is HTML-escaped before display, and CSV
  exports are protected against spreadsheet formula injection.
- **Nothing leaves the browser.** Analysis runs on the device; there is no
  server, database or API key to attack.

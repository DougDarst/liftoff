# Security demo: "the server enforces it, not the UI"

A 5-minute live demo for interviews. A new hire (Priya) tries six things she must not be able to do, straight against the API. Every attempt is refused and nothing changes. Then a tampered browser that *thinks* she's a coordinator still can't see or change anyone else's data.

## Before the interview

- [ ] Restart the dev server so every migration is applied: Ctrl+C, then `./pocketbase serve`
- [ ] For a clean slate: stop the server, delete `pb_data/`, start it again (it re-seeds the demo data)
- [ ] `./tests/run.sh` passes
- [ ] Do one dry run of each part below, including the DevTools step in Part 2

This runs locally with the public demo password. Never point it at the deployed site.

## Part 1: six attacks with curl (about 3 minutes)

```bash
./tests/security-demo.sh --pause
```

It signs in as Priya, prints each curl command and the server's reply, and waits for Enter between steps. It assumes the worst case, that Priya somehow knows Marcus's record IDs, and at the end checks as the coordinator that nothing changed.

| # | Priya tries to... | Server says | Say this |
|---|---|---|---|
| 1 | List all users | 1 result: herself | "List rules filter the results, so she gets her own record, not an error." |
| 2 | Read Marcus's progress | Empty list; 404 by ID | "Even with the exact ID, the server won't confirm the record exists." |
| 3 | Mark Marcus's task done | 404 (update), 400 (create) | "Writes are checked against who's asking, not what the UI shows." |
| 4 | Make herself coordinator | 404 | "The update rule refuses any request that includes `role`, even for her own record." |
| 5 | Move her row to Marcus | 404 | "She can't reassign `user` or `task` on a row she owns." |
| 6 | Sign up publicly | 400 | "Only coordinators create accounts; there's no public sign-up." |

## Part 2: a tampered browser (about 2 minutes)

1. Open http://127.0.0.1:8090 and sign in as `priya@example.com`. She sees her checklist.
2. Open DevTools (Cmd+Opt+J) and run:
   ```js
   showApp({ ...pb.authStore.record, role: "coordinator" })
   ```
3. She now has the **coordinator dashboard** and a "Coordinator" badge. Point out:
   - the cohort picker lists only her own cohort;
   - the roster contains only herself;
   - in her side panel, set **"SSO and GitHub access verified"** (an IT task) to *In progress*: **"Couldn't update that task"**, and it reverts.

**Say:** "Hiding the dashboard from new hires is a convenience. The security lives in the API rules, so even a client that lies about its role only sees and changes what the server allows."

I verified this with a modified `app.js` served locally, not by typing into the DevTools console. Try the console step once before the interview.

## Part 3: it's automated (30 seconds)

- `./tests/run.sh` covers these attacks and about 60 more rule checks, plus UI flows, in about 10 seconds.
- GitHub Actions runs it on every push (the badge on the README).
- When I loosened a rule on purpose, 7 checks failed, each naming the protection that was lost.

## Likely questions

- **"Why 404 instead of 403?"** PocketBase applies update rules as a filter, so a record you're not allowed to touch looks like one that doesn't exist. That's deliberate: it doesn't reveal which IDs are real.
- **"What if a new hire edits the JavaScript?"** That's Part 2. Anything the UI hides is also enforced by a rule.
- **"Can she do anything she shouldn't with her own data?"** She can't mark IT or manager tasks done (only flag them blocked), can't backdate completion, can't edit her team or manager, and loses access to old progress if moved to another cohort. Each is a rule with its own test.
- **"What's not protected?"** A coordinator account can see and change everything in the app, so its password matters most. On the deployed site it's private, sign-ins are rate limited, and `tests/check-deploy.sh` verifies both. The PocketBase superuser (admin UI) is separate and bypasses rules entirely.
- **"How did you find the rules' gaps?"** A security review before writing any UI: I had the AI explain every rule, flag risks, and prove each one against a throwaway database before and after fixing. See `BUILD_LOG.md`.

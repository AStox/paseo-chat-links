# chat-links

Paseo plugin. It watches the chat youre in, pulls Linear tickets and GitHub PRs out of it, and keeps status on the side. unread comments, review requested, CI, that kind of thing.

This is not a local Jev install. Jev is just Typesafe's API. We call it to decide which mentions actually belong to the chat. Without that key the pane errors out, even if the tickets are sitting right there in the transcript.

## what you need

- Paseo 0.8 or later
- plugins turned on for the daemon (Settings -> Plugins, or `"pluginsEnabled": true` in the daemon config)
- three keys. easiest is a file on the daemon machine:

`~/.paseo/chat-links.env`

```
GH_TOKEN=...
LINEAR_API_KEY=...
TYPESAFE_API_KEY=...
```

`GH_TOKEN` or `GITHUB_TOKEN`
GitHub PAT. `repo` if the PRs are private, otherwise `public_repo` is enough.

`LINEAR_API_KEY`
Linear personal API key. you can skip this if the daemon machine already has Linear CLI logged in (`~/.config/linear/credentials.toml`).

`TYPESAFE_API_KEY`
Typesafe / Jev API key. this one is not optional. there is no local Jev binary to install.

You can also put those on the daemon process env instead of the file. your laptop shell does not count unless thats how you start Paseo. if you use process env, restart the daemon so the plugin subprocess actually sees it. the file does not need a restart, just `paseo plugin reload chat-links`.

## install

```bash
paseo plugin add AStox/paseo-chat-links
```

From a checkout:

```bash
paseo plugin install /absolute/path/to/paseo-chat-links
```

`paseo plugin ls` should say `running`. if it doesnt, `paseo plugin logs chat-links`.

## using it

Open a chat and hit Links in the header or the composer. it follows whichever chat is on screen. `/links` works too.

If a key is missing you get a "Could not load links" card with the actual error, not a blank list. GitHub/Linear problems show on the card as token missing.
